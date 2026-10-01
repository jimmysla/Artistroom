-- IT admin account "IT-Jimmy" (super user). Only the salted scrypt hash is stored – never the password.
-- The hash is encrypted with the server key on the first login. Skipped if the username already exists.
INSERT INTO "admin_users" ("username", "password_hash", "is_super", "permissions", "active")
SELECT 'IT-Jimmy', 'scrypt$16384$8$1$pizepuaa7k22Yr6y//m8Zg==$BMLZNsM5aKU1xNiaEn7xQ9k5VzhcBO1MGh4s4vTlcgS9jEqIeYbKRFL2f4SwcGZ9DIsDqxCgNX/XVdNXSZM64g==', true, '[]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM "admin_users" WHERE lower("username") = 'it-jimmy');
