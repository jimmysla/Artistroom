-- Super user "IT-Jimmy" with a new password. Only the salted scrypt hash is stored – never the password.
-- Updates the existing account (also re-activates it and grants super user rights) or creates it if missing.
UPDATE "admin_users" SET "password_hash" = 'scrypt$16384$8$1$NPcKTeF5dShr76tgCIOAmA==$nEyCJpcIicn0YdNJ77HpjIqLQxDFh1stlG6QuT0J5XtOqxlPwS8xoJ0cdBqzhrw/f8nvTtzA75swJMH+R62siA==', "is_super" = true, "permissions" = '[]'::jsonb, "active" = true
WHERE lower("username") = 'it-jimmy';
--> statement-breakpoint
INSERT INTO "admin_users" ("username", "password_hash", "is_super", "permissions", "active")
SELECT 'IT-Jimmy', 'scrypt$16384$8$1$NPcKTeF5dShr76tgCIOAmA==$nEyCJpcIicn0YdNJ77HpjIqLQxDFh1stlG6QuT0J5XtOqxlPwS8xoJ0cdBqzhrw/f8nvTtzA75swJMH+R62siA==', true, '[]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM "admin_users" WHERE lower("username") = 'it-jimmy');
