-- Creates the storage buckets used by the app and the policies that let
-- authenticated users upload/read their own files. Run this once in the
-- Supabase SQL editor. Fixes "rasm yuklashda xato" (upload errors) caused
-- by missing buckets/policies for project files, project cover images,
-- and profile avatar/portfolio images.

insert into storage.buckets (id, name, public)
values
  ('project-files', 'project-files', true),
  ('project-images', 'project-images', true),
  ('profile-images', 'profile-images', true),
  ('profile-portfolio', 'profile-portfolio', true)
on conflict (id) do update set public = true;

-- Public read access (buckets are public, so anyone with the URL can view).
create policy "public read project-files" on storage.objects
  for select using (bucket_id = 'project-files');
create policy "public read project-images" on storage.objects
  for select using (bucket_id = 'project-images');
create policy "public read profile-images" on storage.objects
  for select using (bucket_id = 'profile-images');
create policy "public read profile-portfolio" on storage.objects
  for select using (bucket_id = 'profile-portfolio');

-- Any authenticated user can upload/update/delete in these buckets.
-- (Project membership is already enforced at the app level via ob_members;
-- avatar/portfolio paths are scoped by the user's own id in the app code.)
create policy "auth write project-files" on storage.objects
  for insert with check (bucket_id = 'project-files' and auth.role() = 'authenticated');
create policy "auth update project-files" on storage.objects
  for update using (bucket_id = 'project-files' and auth.role() = 'authenticated');
create policy "auth delete project-files" on storage.objects
  for delete using (bucket_id = 'project-files' and auth.role() = 'authenticated');

create policy "auth write project-images" on storage.objects
  for insert with check (bucket_id = 'project-images' and auth.role() = 'authenticated');
create policy "auth update project-images" on storage.objects
  for update using (bucket_id = 'project-images' and auth.role() = 'authenticated');

create policy "auth write profile-images" on storage.objects
  for insert with check (bucket_id = 'profile-images' and auth.role() = 'authenticated');
create policy "auth update profile-images" on storage.objects
  for update using (bucket_id = 'profile-images' and auth.role() = 'authenticated');

create policy "auth write profile-portfolio" on storage.objects
  for insert with check (bucket_id = 'profile-portfolio' and auth.role() = 'authenticated');
create policy "auth delete profile-portfolio" on storage.objects
  for delete using (bucket_id = 'profile-portfolio' and auth.role() = 'authenticated');
