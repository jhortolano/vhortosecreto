import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';

const MAX_DIM = 1080;
const MAX_SIZE = 50 * 1024;
const INITIAL_COMPRESSION = 0.8;

export async function resizeImage(uri: string): Promise<string> {
  let result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIM } }],
    { compress: INITIAL_COMPRESSION, format: ImageManipulator.SaveFormat.JPEG }
  );

  let file = new File(result.uri);
  let info = await file.info();
  let quality = INITIAL_COMPRESSION;

  while (info.exists && info.size != null && info.size > MAX_SIZE && quality > 0.1) {
    quality -= 0.15;
    result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_DIM } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );
    file = new File(result.uri);
    info = await file.info();
  }

  return result.uri;
}

export async function imageUriToBase64(uri: string): Promise<string> {
  const file = new File(uri);
  return await file.base64();
}
