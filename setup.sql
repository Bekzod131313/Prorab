
-- Run this in Supabase SQL Editor:

-- 1. profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  phone TEXT UNIQUE,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. obyektlar (projects)
CREATE TABLE IF NOT EXISTS obyektlar (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nomi TEXT NOT NULL,
  owner_id UUID REFERENCES profiles(id),
  boshlanish DATE,
  muddat INT DEFAULT 30,
  kirim NUMERIC DEFAULT 0,
  chiqim NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ob_members (project members with balance)
CREATE TABLE IF NOT EXISTS ob_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ob_id UUID REFERENCES obyektlar(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  role TEXT DEFAULT 'member', -- owner, member, worker
  balance NUMERIC DEFAULT 0,
  added_by UUID REFERENCES profiles(id),
  kasb TEXT,
  ishaqi NUMERIC DEFAULT 0,
  olingan NUMERIC DEFAULT 0,
  boshlanish DATE,
  tugash DATE,
  kirim NUMERIC DEFAULT 0,
  chiqim NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ob_id, user_id)
);

-- 3.5. my_workers (global unassigned workers connected to user)
CREATE TABLE IF NOT EXISTS my_workers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  kasb TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, worker_id)
);

-- 4. transactions (money flow)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ob_id UUID REFERENCES obyektlar(id) ON DELETE CASCADE,
  from_user UUID REFERENCES profiles(id),
  to_user UUID REFERENCES profiles(id),
  summa NUMERIC NOT NULL,
  tur TEXT NOT NULL, -- income, spend, send
  kategoriya TEXT,
  izoh TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE obyektlar ENABLE ROW LEVEL SECURITY;
ALTER TABLE ob_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- profiles: anyone can read, own can update
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- obyektlar: members can see, owners can manage
CREATE POLICY "ob_select" ON obyektlar FOR SELECT USING (
  EXISTS(SELECT 1 FROM ob_members WHERE ob_id=id AND user_id=auth.uid())
);
CREATE POLICY "ob_insert" ON obyektlar FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "ob_update" ON obyektlar FOR UPDATE USING (
  EXISTS(SELECT 1 FROM ob_members WHERE ob_id=id AND user_id=auth.uid() AND role='owner')
);
CREATE POLICY "ob_delete" ON obyektlar FOR DELETE USING (auth.uid() = owner_id);

-- ob_members: members can see own project members
CREATE POLICY "obm_select" ON ob_members FOR SELECT USING (
  EXISTS(SELECT 1 FROM ob_members m2 WHERE m2.ob_id=ob_id AND m2.user_id=auth.uid())
);
CREATE POLICY "obm_insert" ON ob_members FOR INSERT WITH CHECK (
  auth.uid() = user_id OR
  EXISTS(SELECT 1 FROM ob_members WHERE ob_id=ob_id AND user_id=auth.uid() AND role IN ('owner','member'))
);
CREATE POLICY "obm_update" ON ob_members FOR UPDATE USING (
  EXISTS(SELECT 1 FROM ob_members WHERE ob_id=ob_id AND user_id=auth.uid() AND role IN ('owner','member'))
);
CREATE POLICY "obm_delete" ON ob_members FOR DELETE USING (
  EXISTS(SELECT 1 FROM ob_members WHERE ob_id=ob_id AND user_id=auth.uid() AND role='owner')
);

-- transactions: project members can see and insert
CREATE POLICY "tx_select" ON transactions FOR SELECT USING (
  EXISTS(SELECT 1 FROM ob_members WHERE ob_id=ob_id AND user_id=auth.uid())
);
CREATE POLICY "tx_insert" ON transactions FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM ob_members WHERE ob_id=ob_id AND user_id=auth.uid())
);
CREATE POLICY "tx_delete" ON transactions FOR DELETE USING (
  from_user=auth.uid() OR
  EXISTS(SELECT 1 FROM ob_members WHERE ob_id=ob_id AND user_id=auth.uid() AND role='owner')
);

-- my_workers: owners can manage their list, workers can see they are in it
ALTER TABLE my_workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mw_select" ON my_workers FOR SELECT USING (auth.uid() = owner_id OR auth.uid() = worker_id);
CREATE POLICY "mw_insert" ON my_workers FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "mw_update" ON my_workers FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "mw_delete" ON my_workers FOR DELETE USING (auth.uid() = owner_id);

-- Also add trigger for auto profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, phone)
  VALUES (new.id, new.phone)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 6. app_versions table
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
