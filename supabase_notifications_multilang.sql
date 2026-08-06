-- Run this script in the Supabase SQL Editor:

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS body_uz text,
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS body_ru text;

-- Populate existing rows using title and body as Uzbek and Russian fallbacks
UPDATE notifications
SET 
  title_uz = COALESCE(title_uz, title),
  body_uz = COALESCE(body_uz, body),
  title_ru = COALESCE(title_ru, title),
  body_ru = COALESCE(body_ru, body)
WHERE title_uz IS NULL;
