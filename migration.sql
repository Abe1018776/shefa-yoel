-- Add new columns for Compare page features
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)

ALTER TABLE versions ADD COLUMN IF NOT EXISTS human_comment text;
ALTER TABLE versions ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false;
ALTER TABLE versions ADD COLUMN IF NOT EXISTS is_human boolean DEFAULT false;
