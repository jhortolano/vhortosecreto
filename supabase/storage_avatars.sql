-- Ejecutar solo esto en Supabase SQL Editor si aún no tienes bucket/políticas de avatares.
-- Crea bucket público `avatars` y permite que cada usuario suba solo en su carpeta `{auth.uid()}/...`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
on storage.objects
for select
to public
using (bucket_id = 'avatars');

drop policy if exists "avatars_authenticated_insert_own_folder" on storage.objects;
create policy "avatars_authenticated_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
);

drop policy if exists "avatars_authenticated_update_own_folder" on storage.objects;
create policy "avatars_authenticated_update_own_folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
);

drop policy if exists "avatars_authenticated_delete_own_folder" on storage.objects;
create policy "avatars_authenticated_delete_own_folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
);
