-- Remove every admin account and keep only the fixed super admin "SuperAdmin".
-- Only the scrypt hash of the password is stored (encrypted at rest on the first login).
DELETE FROM "admin_users";
--> statement-breakpoint
INSERT INTO "admin_users" ("username", "password_hash", "is_super", "permissions", "active")
VALUES ('SuperAdmin', 'scrypt$16384$8$1$czIvbZIVtCzE/RwlWWPILg==$JXNav68c4vDE79U5zuyoEib88PsFgdvPy8mS3Ucyh2s1pd6wRoeZi/PK5vBH+vdrB/H0XJehV7p/kI3Mid/jAA==', true, '[]'::jsonb, true);
