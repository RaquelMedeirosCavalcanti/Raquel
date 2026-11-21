CREATE TABLE IF NOT EXISTS intervals_connections (
 user_id TEXT PRIMARY KEY NOT NULL,
 key_cipher TEXT NOT NULL,
 data TEXT NOT NULL,
 lock_until INTEGER NOT NULL DEFAULT 0
);
