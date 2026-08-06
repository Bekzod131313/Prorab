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

-- 5) Loyiha a'zolariga yangi ustunlar (boshlanish, tugash, kirim, chiqim)
ALTER TABLE ob_members
  ADD COLUMN IF NOT EXISTS boshlanish  date,
  ADD COLUMN IF NOT EXISTS tugash        date,
  ADD COLUMN IF NOT EXISTS kirim         numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chiqim        numeric DEFAULT 0;

-- 6) Tranzaksiyalarni yaratuvchi ustuni
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);

-- Mavjud ma'lumotlarni to'ldirish
UPDATE transactions SET created_by = COALESCE(from_user, to_user) WHERE created_by IS NULL;


-- 7) Force update/App versions table
CREATE TABLE IF NOT EXISTS app_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appstore_version text NOT NULL,
  appstore_build_number integer NOT NULL,
  playmarket_version text NOT NULL,
  playmarket_build_number integer NOT NULL,
  appstore_url text NOT NULL,
  playmarket_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE app_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to app_versions" ON app_versions;
CREATE POLICY "Allow public read access to app_versions" ON app_versions FOR SELECT USING (true);

INSERT INTO app_versions (appstore_version, appstore_build_number, playmarket_version, playmarket_build_number, appstore_url, playmarket_url)
VALUES ('1.0.0', 1, '1.0.0', 1, 'https://apps.apple.com', 'https://play.google.com')
ON CONFLICT DO NOTHING;

