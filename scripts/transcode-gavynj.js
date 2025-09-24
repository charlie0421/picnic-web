const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(ffmpegPath);

const input = path.resolve(__dirname, '../public/concert2025/video/GAVYNJ.mp4');
const output = path.resolve(__dirname, '../public/concert2025/video/GAVYNJ-720p.mp4');

if (!fs.existsSync(input)) {
  console.error('Input not found:', input);
  process.exit(1);
}

console.log('Transcoding to 720p...', { input, output });

ffmpeg(input)
  .videoCodec('libx264')
  .audioCodec('aac')
  .outputOptions([
    '-movflags +faststart',
    '-preset veryfast',
    '-profile:v main',
    '-level 3.1',
    '-vf scale=-2:720',
    '-b:v 1700k',
    '-maxrate 2200k',
    '-bufsize 3400k',
    '-b:a 128k'
  ])
  .on('progress', p => {
    if (p && typeof p.percent === 'number') {
      process.stdout.write(`\r${p.percent.toFixed(1)}%`);
    }
  })
  .on('end', () => {
    console.log('\nDone');
  })
  .on('error', (err) => {
    console.error('ffmpeg error:', err);
    process.exit(1);
  })
  .save(output);
