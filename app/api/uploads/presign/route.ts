import { NextRequest, NextResponse } from 'next/server'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { S3Client } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
})

export async function POST(req: NextRequest) {
  try {
    const { filename, contentType } = await req.json()
    const bucket = process.env.S3_BUCKET as string
    if (!bucket) return NextResponse.json({ error: 'No bucket configured' }, { status: 500 })

    const key = `posts/${Date.now()}_${encodeURIComponent(filename)}`
    const { url, fields } = await createPresignedPost(s3, {
      Bucket: bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 0, 100 * 1024 * 1024], // 100MB
        ['starts-with', '$Content-Type', ''],
      ],
      Expires: 60,
      Fields: { 'Content-Type': contentType || 'application/octet-stream' },
    })

    return NextResponse.json({ url, fields, key, publicUrl: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}` })
  } catch (e) {
    return NextResponse.json({ error: 'failed to presign' }, { status: 500 })
  }
}


