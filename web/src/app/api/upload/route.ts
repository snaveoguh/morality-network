import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm',
]);

const BUCKET = process.env.S3_BUCKET || 'morality';
const REGION = process.env.S3_REGION || 'eu-west-2';

function getS3Client() {
  return new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large. Max ${MAX_SIZE / 1024 / 1024}MB.` },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}` },
        { status: 400 },
      );
    }

    const ext = file.name.split('.').pop() || 'bin';
    const hash = crypto.randomBytes(16).toString('hex');
    const key = `user-uploads/${new Date().toISOString().split('T')[0]}/${hash}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const s3 = getS3Client();
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

    return NextResponse.json({ url, key, size: file.size, type: file.type });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 },
    );
  }
}
