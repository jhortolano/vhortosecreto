import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';

const MAX_DIM = 1080;
const MAX_SIZE = 50 * 1024;
const INITIAL_COMPRESSION = 0.8;
const MIN_COMPRESSION = 0.1;

export async function resizeImage(uri: string): Promise<string> {
  let dim = MAX_DIM;
  let resultUri = uri;

  for (let attempt = 0; attempt < 5; attempt++) {
    let result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: dim } }],
      { compress: INITIAL_COMPRESSION, format: ImageManipulator.SaveFormat.JPEG }
    );
    resultUri = result.uri;

    let file = new File(result.uri);
    let info = await file.info();
    let quality = INITIAL_COMPRESSION;

    while (info.exists && info.size != null && info.size > MAX_SIZE && quality > MIN_COMPRESSION) {
      quality -= 0.15;
      result = await ImageManipulator.manipulateAsync(
        result.uri,
        [],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
      );
      resultUri = result.uri;
      file = new File(result.uri);
      info = await file.info();
    }

    if (info.exists && info.size != null && info.size <= MAX_SIZE) {
      return result.uri;
    }

    dim = Math.floor(dim * 0.75);
  }

  return resultUri;
}

export async function imageUriToBase64(uri: string): Promise<string> {
  const file = new File(uri);
  return await file.base64();
}
