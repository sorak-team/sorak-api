-- Migration: Add class_theme_contents table for granular NDGD allocation
CREATE TABLE IF NOT EXISTS class_theme_contents (
    id BIGSERIAL PRIMARY KEY,
    class_id BIGINT NOT NULL REFERENCES classes(class_id) ON DELETE CASCADE,
    theme_id BIGINT NOT NULL REFERENCES curriculum_themes(theme_id) ON DELETE CASCADE,
    content_id BIGINT NOT NULL REFERENCES educational_contents(content_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_class_theme_content UNIQUE (class_id, theme_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_class_theme_contents_lookup ON class_theme_contents(class_id, theme_id);
CREATE INDEX IF NOT EXISTS idx_class_theme_contents_content ON class_theme_contents(content_id);

-- Backfill data from existing class_theme_goals (if any)
INSERT INTO class_theme_contents (class_id, theme_id, content_id)
SELECT ctg.class_id, ctg.theme_id, ec.content_id
FROM class_theme_goals ctg
JOIN educational_contents ec ON ec.goal_id = ctg.goal_id
WHERE ec.deleted_at IS NULL
ON CONFLICT (class_id, theme_id, content_id) DO NOTHING;
