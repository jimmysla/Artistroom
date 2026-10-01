-- Guarantees a working super user login on every environment (incl. Production): the account
-- "SuperUser" exists, is active, is a super user (may manage users) and has the agreed initial
-- password. Only the scrypt hash is stored; it is re-encrypted with the current key on first login.
INSERT INTO "admin_users" ("username", "password_hash", "is_super", "permissions", "active")
VALUES ('SuperUser', 'scrypt$16384$8$1$FtsqzoFRHcGFhWYcRhZPfw==$hJ6Vu+CY5tyZahBWj1DxI7rJfU7IvNaw06ngvJ+GDbRHpR/uhYsIYNWt/4Ssv6vIeOBSWbgj6oyl/H/NTbkHmQ==', true, '[]'::jsonb, true)
ON CONFLICT ("username") DO UPDATE
SET "password_hash" = EXCLUDED."password_hash", "is_super" = true, "active" = true;
