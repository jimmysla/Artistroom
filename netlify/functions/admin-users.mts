import type { Config, Context } from "@netlify/functions";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { adminUsers, type AdminUser } from "../../db/schema.js";
import { PERMISSIONS, isPermission, validatePassword, validatePasswordConfirm, validateUsername } from "../../shared/admin.js";
import { hashPassword, requireAdmin } from "../lib/auth.js";
import { TransportError, encryptionSource, readSealed } from "../lib/crypto.js";
import { logAction } from "../lib/audit.js";
import { error, json, str, logError } from "../lib/http.js";

// Never expose password hashes.
const publicUser = ({ passwordHash: _hash, ...u }: AdminUser) => u;

const permissionLabels = (ids: string[]) =>
  ids.map((id) => PERMISSIONS.find((p) => p.id === id)?.label ?? id).join(", ") || "keine";

function parsePermissions(v: unknown): string[] | null {
  if (!Array.isArray(v) || !v.every(isPermission)) return null;
  return [...new Set(v)];
}

/** Keeps at least one active super user so nobody locks themselves out. */
const otherActiveSupers = async (id: number) => {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(adminUsers)
    .where(and(eq(adminUsers.isSuper, true), eq(adminUsers.active, true), ne(adminUsers.id, id)));
  return count;
};

export default async (req: Request, context: Context) => {
  const session = await requireAdmin(req, "super");
  if (session instanceof Response) return session;
  const actor = session.username;
  const idParam = context.params?.id;

  try {
    if (!idParam) {
      if (req.method === "GET") {
        const rows = await db.select().from(adminUsers).orderBy(asc(adminUsers.createdAt));
        return json({ users: rows.map(publicUser), encryption: await encryptionSource() });
      }
      if (req.method !== "POST") return error("Methode nicht erlaubt.", 405);
      // The whole body (incl. password) arrives encrypted from the browser (src/lib/secure.ts).
      const body = await readSealed(req);
      const username = str(body.username).trim();
      const password = str(body.password);
      const permissions = parsePermissions(body.permissions ?? []);
      const isSuper = body.isSuper === true;
      const fieldErrors: Record<string, string> = {};
      const u = validateUsername(username);
      const p = validatePassword(password);
      if (u) fieldErrors.username = u;
      if (p) fieldErrors.password = p;
      const c = validatePasswordConfirm(password, str(body.passwordConfirm));
      if (c) fieldErrors.passwordConfirm = c;
      if (!permissions) fieldErrors.permissions = "Ungültige Berechtigungen.";
      if (Object.keys(fieldErrors).length) return error("Bitte überprüfe die Eingaben.", 422, { fieldErrors });

      const [exists] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(sql`lower(${adminUsers.username})`, username.toLowerCase()));
      if (exists) return error("Dieser Benutzername ist bereits vergeben.", 409, { fieldErrors: { username: "Bereits vergeben." } });

      const [created] = await db
        .insert(adminUsers)
        .values({ username, passwordHash: await hashPassword(password), permissions: isSuper ? [] : permissions!, isSuper })
        .returning();
      await logAction({ username: actor, action: "benutzer_erstellt", target: username, details: isSuper ? "Super User" : `Rechte: ${permissionLabels(created.permissions)}`, undo: { kind: "user_created", id: created.id } });
      return json({ user: publicUser(created) }, 201);
    }

    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) return error("Ungültige ID.", 400);
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    if (!user) return error("Benutzer nicht gefunden.", 404);
    const isSelf = user.username === actor;

    if (req.method === "PATCH") {
      const body = await readSealed(req);
      const set: Partial<AdminUser> = {};
      const changes: string[] = [];

      if (body.permissions !== undefined) {
        const permissions = parsePermissions(body.permissions);
        if (!permissions) return error("Ungültige Berechtigungen.", 422);
        set.permissions = permissions;
        changes.push(`Rechte: ${permissionLabels(permissions)}`);
      }
      if (body.isSuper !== undefined) {
        if (typeof body.isSuper !== "boolean") return error("Ungültige Anfrage.", 422);
        if (body.isSuper !== user.isSuper) {
          if (!body.isSuper && (isSelf || (await otherActiveSupers(id)) === 0)) return error("Mindestens ein aktiver Super User muss bestehen bleiben – eigene Super-Rechte können nicht entzogen werden.", 409);
          set.isSuper = body.isSuper;
          changes.push(body.isSuper ? "zum Super User gemacht" : "Super-User-Rechte entzogen");
        }
      }
      if (body.active !== undefined) {
        if (typeof body.active !== "boolean") return error("Ungültige Anfrage.", 422);
        if (body.active !== user.active) {
          if (!body.active && isSelf) return error("Du kannst dein eigenes Konto nicht deaktivieren.", 409);
          if (!body.active && user.isSuper && (await otherActiveSupers(id)) === 0) return error("Der letzte aktive Super User kann nicht deaktiviert werden.", 409);
          set.active = body.active;
          changes.push(body.active ? "aktiviert" : "deaktiviert");
        }
      }
      if (body.password !== undefined) {
        const password = str(body.password);
        const p = validatePassword(password);
        if (p) return error(p, 422, { fieldErrors: { password: p } });
        const c = validatePasswordConfirm(password, str(body.passwordConfirm));
        if (c) return error(c, 422, { fieldErrors: { passwordConfirm: c } });
        set.passwordHash = await hashPassword(password);
        changes.push("Passwort neu gesetzt");
      }
      if (!changes.length) return json({ user: publicUser(user) });

      const [updated] = await db.update(adminUsers).set(set).where(eq(adminUsers.id, id)).returning();
      // Previous values of exactly the changed fields, for undo.
      const before = Object.fromEntries(Object.keys(set).map((k) => [k, user[k as keyof AdminUser]]));
      await logAction({ username: actor, action: "benutzer_geaendert", target: user.username, details: changes.join("; "), undo: { kind: "user_changed", id, before } });
      return json({ user: publicUser(updated) });
    }

    if (req.method === "DELETE") {
      if (isSelf) return error("Du kannst dein eigenes Konto nicht löschen.", 409);
      if (user.isSuper && (await otherActiveSupers(id)) === 0) return error("Der letzte aktive Super User kann nicht gelöscht werden.", 409);
      await db.delete(adminUsers).where(eq(adminUsers.id, id));
      await logAction({ username: actor, action: "benutzer_geloescht", target: user.username, undo: { kind: "user_deleted", row: user } });
      return json({ ok: true });
    }

    return error("Methode nicht erlaubt.", 405);
  } catch (err) {
    if (err instanceof TransportError) return error(err.message, 400);
    logError("Admin user operation failed", err);
    return error("Die Benutzerverwaltung ist gerade nicht erreichbar.", 500);
  }
};

export const config: Config = { path: ["/api/admin/users", "/api/admin/users/:id"] };
