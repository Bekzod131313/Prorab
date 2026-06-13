-- ============================================================
-- Prorab — Telegram orqali ishchi qo'shish (taklif havolasi)
-- Supabase SQL Editor'da bir marta ishga tushiring.
-- ============================================================

-- 1) profiles jadvaliga Telegram ma'lumotlari
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS telegram_id bigint UNIQUE,
  ADD COLUMN IF NOT EXISTS avatar_url  text,
  ADD COLUMN IF NOT EXISTS email       text;

-- 2) Taklif tokenlari jadvali
CREATE TABLE IF NOT EXISTS invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ob_id       uuid NOT NULL REFERENCES obyektlar(id) ON DELETE CASCADE,
  token       text UNIQUE NOT NULL,
  kasb        text,
  created_by  uuid REFERENCES profiles(id),
  used        boolean DEFAULT false,
  used_by     uuid REFERENCES profiles(id),
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invites_ob ON invites(ob_id);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- Faqat obyekt egasi taklif yaratishi/ko'rishi mumkin
DROP POLICY IF EXISTS invites_owner_all ON invites;
CREATE POLICY invites_owner_all ON invites FOR ALL
  USING (EXISTS (SELECT 1 FROM obyektlar o WHERE o.id = invites.ob_id AND o.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM obyektlar o WHERE o.id = invites.ob_id AND o.owner_id = auth.uid()));
