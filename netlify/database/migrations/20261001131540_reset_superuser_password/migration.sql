-- The SuperUser seed hash did not match the intended initial password, so the account could
-- never log in. Reset it (only the scrypt hash is stored) and make sure it is an active super user.
-- The plain hash is re-encrypted with the current key on the first successful login.
INSERT INTO "admin_users" ("username", "password_hash", "is_super", "permissions", "active")
VALUES ('SuperUser', 'scrypt$16384$8$1$qU29LRcdQ6VI97NSdpzU3g==$O2otFE5Ibs6Ogf6oG73bZLFCnHCMmuOlv1gPUAaH5gUIakgzQ9udU+VwojTHPTfWHzNSvvibWNNKHbqRAqGJ2g==', true, '[]'::jsonb, true)
ON CONFLICT ("username") DO UPDATE
SET "password_hash" = EXCLUDED."password_hash", "is_super" = true, "active" = true;
