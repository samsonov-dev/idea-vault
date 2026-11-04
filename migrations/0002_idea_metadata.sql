ALTER TABLE ideas ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high'));
ALTER TABLE ideas ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_ideas_status_priority ON ideas(status, priority);
