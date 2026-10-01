-- Seed the initial admin account. Only the scrypt hash of the password is stored.
INSERT INTO "admin_users" ("username", "password_hash")
VALUES ('AdminArtist', 'scrypt$16384$8$1$DFnEzzjoOTSMAR9gHwbmbw==$Rp0un3xvBHBJjGh5M4kjXbBXWi91k2eOPEnQV8d+SkU+04ZGIpz0ywiuOkotbhlaRGxSDzfczsAP6F6nLARpmA==')
ON CONFLICT ("username") DO NOTHING;
