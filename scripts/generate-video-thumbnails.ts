import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import ffmpegStatic from 'ffmpeg-static'

const ROOT = process.cwd()
const videoDir = path.join(ROOT, 'public', 'concert2025', 'video')
const thumbsDir = path.join(videoDir, 'thumbs')

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function runFfmpeg(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegBin = ffmpegStatic || 'ffmpeg'
    const args = ['-y', '-ss', '1', '-i', input, '-frames:v', '1', '-q:v', '2', output]
    const proc = spawn(ffmpegBin as string, args, { stdio: 'inherit' })
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code}`))
    })
    proc.on('error', reject)
  })
}

async function main() {
  ensureDir(thumbsDir)
  if (!fs.existsSync(videoDir)) {
    console.log('[thumbs] Video directory not found, skipping:', videoDir)
    process.exit(0)
  }

  const files = fs.readdirSync(videoDir).filter((f) => f.toLowerCase().endsWith('.mp4'))
  for (const file of files) {
    const base = file.replace(/\.mp4$/i, '')
    const out = path.join(thumbsDir, `${base}.jpg`)
    const input = path.join(videoDir, file)
    try {
      await runFfmpeg(input, out)
      console.log('Generated:', out)
    } catch (e) {
      console.error('Failed to generate thumbnail for', file, e)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


