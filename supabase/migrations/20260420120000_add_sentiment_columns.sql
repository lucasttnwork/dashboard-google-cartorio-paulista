-- Phase 4: Add sentiment analysis columns to reviews and review_collaborators

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS sentiment TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

ALTER TABLE review_collaborators ADD COLUMN IF NOT EXISTS sentiment TEXT;
ALTER TABLE review_collaborators ADD COLUMN IF NOT EXISTS confidence REAL;
ALTER TABLE review_collaborators ADD COLUMN IF NOT EXISTS excerpt TEXT;
ALTER TABLE review_collaborators ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'gemini';
