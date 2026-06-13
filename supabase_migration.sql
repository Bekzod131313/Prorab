-- ============================================================
-- Prorab — yangi dizayn uchun schema migratsiyasi
-- Supabase SQL Editor'da bir marta ishga tushiring.
-- ============================================================

-- 1) Obyektlar (loyihalar) jadvaliga yangi ustunlar
ALTER TABLE obyektlar
  ADD COLUMN IF NOT EXISTS manzil      text,           -- Address
  ADD COLUMN IF NOT EXISTS mijoz       text,           -- Client
  ADD COLUMN IF NOT EXISTS bosqich     text,           -- Current stage
  ADD COLUMN IF NOT EXISTS progress    integer DEFAULT 0,   -- Completion % (0-100)
  ADD COLUMN IF NOT EXISTS tugash      date,           -- End date (optional explicit)
  ADD COLUMN IF NOT EXISTS rasm        text;           -- Cover image URL

-- 2) Vazifalar (Tasks) jadvali
CREATE TABLE IF NOT EXISTS tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ob_id       uuid NOT NULL REFERENCES obyektlar(id) ON DELETE CASCADE,
  nomi        text NOT NULL,
  tavsif      text,
  holat       text NOT NULL DEFAULT 'todo',     -- todo | progress | done
  muddat      date,
  assignee    uuid REFERENCES profiles(id),
  created_by  uuid REFERENCES profiles(id),
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_ob ON tasks(ob_id);

-- 3) Materiallar (Materials) jadvali
CREATE TABLE IF NOT EXISTS materials (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ob_id       uuid NOT NULL REFERENCES obyektlar(id) ON DELETE CASCADE,
  nomi        text NOT NULL,
  miqdor      numeric DEFAULT 0,                 -- Quantity
  birlik      text,                              -- Unit (kg, dona, m...)
  narx        numeric DEFAULT 0,                 -- Unit price
  holat       text DEFAULT 'kerak',              -- kerak | buyurtma | yetkazildi
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_materials_ob ON materials(ob_id);

-- 4) RLS (Row Level Security) — agar boshqa jadvallaringizda yoqilgan bo'lsa
ALTER TABLE tasks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

-- Obyekt a'zolari o'qiy/yoza oladi
DROP POLICY IF EXISTS tasks_member_all ON tasks;
CREATE POLICY tasks_member_all ON tasks FOR ALL
  USING (EXISTS (SELECT 1 FROM ob_members m WHERE m.ob_id = tasks.ob_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM ob_members m WHERE m.ob_id = tasks.ob_id AND m.user_id = auth.uid()));

DROP POLICY IF EXISTS materials_member_all ON materials;
CREATE POLICY materials_member_all ON materials FOR ALL
  USING (EXISTS (SELECT 1 FROM ob_members m WHERE m.ob_id = materials.ob_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM ob_members m WHERE m.ob_id = materials.ob_id AND m.user_id = auth.uid()));
