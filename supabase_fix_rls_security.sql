-- ============================================================
-- KRITIK XAVFSIZLIK TUZATISHI
-- Eski RLS siyosatlarida "WHERE ob_id=ob_id" kabi shartlar
-- ikkala tomoni ham bitta jadval ustuniga ishora qilib,
-- shart doim TRUE bo'lib qolgan edi. Natijada bir loyihaga
-- a'zo qilingan ishchi BOSHQA BARCHA loyihalarning
-- tranzaksiyalarini va a'zolarini ko'rishi mumkin edi.
--
-- Supabase SQL Editor'da darhol ishga tushiring.
-- ============================================================

-- obyektlar: faqat o'zi a'zo bo'lgan loyihani ko'rsin
DROP POLICY IF EXISTS "ob_select" ON obyektlar;
CREATE POLICY "ob_select" ON obyektlar FOR SELECT USING (
  EXISTS(SELECT 1 FROM ob_members m WHERE m.ob_id = obyektlar.id AND m.user_id = auth.uid())
);

DROP POLICY IF EXISTS "ob_update" ON obyektlar;
CREATE POLICY "ob_update" ON obyektlar FOR UPDATE USING (
  EXISTS(SELECT 1 FROM ob_members m WHERE m.ob_id = obyektlar.id AND m.user_id = auth.uid() AND m.role='owner')
);

-- ob_members: faqat o'z loyihasiga a'zo qo'sha/o'zgartira/o'chira olsin
DROP POLICY IF EXISTS "obm_insert" ON ob_members;
CREATE POLICY "obm_insert" ON ob_members FOR INSERT WITH CHECK (
  auth.uid() = user_id OR
  EXISTS(SELECT 1 FROM ob_members m WHERE m.ob_id = ob_members.ob_id AND m.user_id = auth.uid() AND m.role IN ('owner','member'))
);

DROP POLICY IF EXISTS "obm_update" ON ob_members;
CREATE POLICY "obm_update" ON ob_members FOR UPDATE USING (
  EXISTS(SELECT 1 FROM ob_members m WHERE m.ob_id = ob_members.ob_id AND m.user_id = auth.uid() AND m.role IN ('owner','member'))
);

DROP POLICY IF EXISTS "obm_delete" ON ob_members;
CREATE POLICY "obm_delete" ON ob_members FOR DELETE USING (
  EXISTS(SELECT 1 FROM ob_members m WHERE m.ob_id = ob_members.ob_id AND m.user_id = auth.uid() AND m.role='owner')
);

-- transactions: faqat o'z loyihasining tranzaksiyalarini ko'rsin/yarata olsin
DROP POLICY IF EXISTS "tx_select" ON transactions;
CREATE POLICY "tx_select" ON transactions FOR SELECT USING (
  EXISTS(SELECT 1 FROM ob_members m WHERE m.ob_id = transactions.ob_id AND m.user_id = auth.uid())
);

DROP POLICY IF EXISTS "tx_insert" ON transactions;
CREATE POLICY "tx_insert" ON transactions FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM ob_members m WHERE m.ob_id = transactions.ob_id AND m.user_id = auth.uid())
);

DROP POLICY IF EXISTS "tx_delete" ON transactions;
CREATE POLICY "tx_delete" ON transactions FOR DELETE USING (
  from_user = auth.uid() OR
  EXISTS(SELECT 1 FROM ob_members m WHERE m.ob_id = transactions.ob_id AND m.user_id = auth.uid() AND m.role='owner')
);
