ALTER TABLE feedback ADD COLUMN series TEXT NOT NULL DEFAULT 'big' CHECK (series IN ('big', 'mini'));
ALTER TABLE feedback ADD COLUMN language TEXT NOT NULL DEFAULT 'vi' CHECK (language IN ('vi', 'en', 'bi'));
ALTER TABLE feedback ADD COLUMN original TEXT NOT NULL DEFAULT '';
ALTER TABLE feedback ADD COLUMN revision TEXT NOT NULL DEFAULT '';
ALTER TABLE feedback ADD COLUMN release_commit TEXT NOT NULL DEFAULT '';
