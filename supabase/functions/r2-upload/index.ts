import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { S3Client, PutObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3';

const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID');
const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY');
const R2_BUCKET_NAME = Deno.env.get('R2_BUCKET_NAME');
const R2_PUBLIC_URL = Deno.env.get('R2_PUBLIC_URL') ?? `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function missingEnv(name: string): Response {
  return new Response(JSON.stringify({ error: `Missing env: ${name}` }), {
    status: 500,
    headers: JSON_HEADERS,
  });
}

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error('Missing required R2 env vars');
}

const S3 = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

serve(async (req) => {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: JSON_HEADERS });
  }

  if (!S3) return missingEnv('R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET_NAME');

  try {
    const { image_base64 } = await req.json();
    if (!image_base64) {
      return new Response(JSON.stringify({ error: 'image_base64 required' }), { status: 400, headers: JSON_HEADERS });
    }

    const uuid = crypto.randomUUID();
    const key = `encuestas/${uuid}.jpg`;

    const binary = Uint8Array.from(atob(image_base64), (c) => c.charCodeAt(0));

    await S3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: binary,
        ContentType: 'image/jpeg',
      })
    );

    const url = `${R2_PUBLIC_URL}/${key}`;

    return new Response(JSON.stringify({ key, url }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: JSON_HEADERS });
  }
});
