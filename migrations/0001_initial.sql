CREATE TABLE IF NOT EXISTS ideas (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox','refine','ready','progress','done')), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_ideas_updated_at ON ideas(updated_at DESC);
