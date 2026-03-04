const path = require('path');
const fs = require('fs');

// Load .env if present
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Determine ffmpeg path - prefer local bin, fall back to @ffmpeg-installer
function getFfmpegPath() {
  if (process.env.FFMPEG_PATH) {
    return process.env.FFMPEG_PATH;
  }
  // Check local bin directory first
  const localPath = path.join(__dirname, '../../bin/ffmpeg.exe');
  if (fs.existsSync(localPath)) {
    return localPath;
  }
  // Fall back to @ffmpeg-installer
  try {
    return require('@ffmpeg-installer/ffmpeg').path;
  } catch (e) {
    return null;
  }
}

module.exports = {
  port: parseInt(process.env.PORT || '3500', 10),
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10),
  maxFileSizeBytes: (parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10)) * 1024 * 1024,
  logLevel: process.env.LOG_LEVEL || 'info',
  ffmpegPath: getFfmpegPath(),
};
