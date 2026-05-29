import { supabase } from '@/lib/supabase';

const BUCKET = 'avatars';

function extFromMime(mime: string | null | undefined): string {
  if (!mime) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

/**
 * En Storage, las entradas con `id` nula suelen ser carpetas; el resto son ficheros.
 * Borra todo lo que haya en `avatars/{userId}/` para no dejar un `avatar.jpg` al subir un `avatar.png`.
 */
async function removePreviousAvatarsInFolder(userId: string): Promise<void> {
  const { data: items, error: listError } = await supabase.storage.from(BUCKET).list(userId);
  if (listError) {
    throw listError;
  }
  if (!items?.length) {
    return;
  }

  const isLikelyFile = (item: (typeof items)[0]) => item.id != null;

  let paths = items.filter(isLikelyFile).map((item) => `${userId}/${item.name}`);

  if (paths.length === 0) {
    paths = items
      .filter((item) => item.name && item.name !== '.emptyFolderPlaceholder')
      .map((item) => `${userId}/${item.name}`);
  }

  if (paths.length === 0) {
    return;
  }

  const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
  if (removeError) {
    throw removeError;
  }
}

/**
 * Sube la imagen al bucket `avatars` bajo la carpeta del usuario y devuelve la URL pública.
 * Ruta: `{userId}/avatar.{ext}`. Antes elimina cualquier avatar previo en esa carpeta.
 */
export async function uploadAvatarFromUri(
  userId: string,
  localUri: string,
  mimeType: string | null | undefined
): Promise<string> {
  const ext = extFromMime(mimeType);
  const path = `${userId}/avatar_${Date.now()}.${ext}`;

  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error('No se pudo leer la imagen seleccionada.');
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = mimeType || 'image/jpeg';

  await removePreviousAvatarsInFolder(userId);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
