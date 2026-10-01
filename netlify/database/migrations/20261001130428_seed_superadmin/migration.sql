-- Seed the super admin account "SuperAdmin". Only the scrypt hash of the password is stored
-- (encrypted automatically on the first login). Re-running re-activates the account and resets
-- the password, so access to the dashboard can always be restored.
INSERT INTO "admin_users" ("username", "password_hash", "is_super", "permissions", "active")
VALUES ('SuperAdmin', 'scrypt$16384$8$1$b9cz5EYFCXZ3oao4dxBkEg==$fM6UGxDDXBcrhHHKuhQo2Yu8L7aC8J9u5ed5axw2LL56CtVm/0F4xTpWyIZ/T8tJaZVZNhwQjK+/HD717TIUpQ==', true, '[]'::jsonb, true)
ON CONFLICT ("username") DO UPDATE SET "password_hash" = EXCLUDED."password_hash", "is_super" = true, "active" = true;
