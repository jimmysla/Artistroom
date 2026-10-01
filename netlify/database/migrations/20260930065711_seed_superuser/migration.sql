-- Existing admins keep access to every dashboard area except user management.
UPDATE "admin_users"
SET "permissions" = '["anmeldungen","status","loeschen","export","checkin","einstellungen","logging"]'::jsonb
WHERE "permissions" = '[]'::jsonb;
--> statement-breakpoint
-- Seed the super user account. Only the scrypt hash of the password is stored.
INSERT INTO "admin_users" ("username", "password_hash", "is_super", "permissions")
VALUES ('SuperUser', 'scrypt$16384$8$1$Oz3EpsJRhZvNq3tkk/3RGg==$rx2ww8TA1JNRLjMmFlzRrn8ICMn8tkVBE4RouUkCAqIO9zcbwCQ4CmyQuOtYD9/3lciId/dnDYyAZdtvkmvmTg==', true, '[]'::jsonb)
ON CONFLICT ("username") DO UPDATE SET "is_super" = true;
