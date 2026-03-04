/**
 * Vendor script to download required binaries
 * Run: node scripts/vendor.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

const VENDOR_DIR = path.join(__dirname, '..', 'bin');
const FFMPEG_VERSION = '2024-11-04'; // Recent stable version
const FFMPEG_URL = `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip`;

console.log('Vendor Download Script');
console.log('======================\n');

// Ensure bin directory exists
if (!fs.existsSync(VENDOR_DIR)) {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  console.log(`Created directory: ${VENDOR_DIR}`);
}

// Check if ffmpeg already exists
const ffmpegPath = path.join(VENDOR_DIR, 'ffmpeg.exe');
const ffprobePath = path.join(VENDOR_DIR, 'ffprobe.exe');

if (fs.existsSync(ffmpegPath) && fs.existsSync(ffprobePath)) {
  console.log('FFmpeg binaries already present.');
  console.log(`  ${ffmpegPath}`);
  console.log(`  ${ffprobePath}`);
  process.exit(0);
}

// Download ffmpeg
console.log('Downloading FFmpeg binaries...');
console.log(`URL: ${FFMPEG_URL}\n`);

const zipPath = path.join(VENDOR_DIR, 'ffmpeg.zip');

const file = fs.createWriteStream(zipPath);

https.get(FFMPEG_URL, (response) => {
  // Handle redirects
  if (response.statusCode === 302 || response.statusCode === 301) {
    console.log('Following redirect...');
    https.get(response.headers.location, (redirectResponse) => {
      downloadAndExtract(redirectResponse);
    });
  } else {
    downloadAndExtract(response);
  }
}).on('error', (err) => {
  console.error('Error downloading:', err.message);
  process.exit(1);
});

function downloadAndExtract(response) {
  response.pipe(file);

  let downloaded = 0;
  const totalSize = parseInt(response.headers['content-length'] || 0, 10);

  response.on('data', (chunk) => {
    downloaded += chunk.length;
    if (totalSize > 0) {
      const percent = ((downloaded / totalSize) * 100).toFixed(1);
      process.stdout.write(`\rDownloading: ${percent}%`);
    }
  });

  file.on('finish', () => {
    file.close();
    console.log('\n\nDownload complete. Extracting...');
    extractZip();
  });
}

function extractZip() {
  // Use PowerShell to extract the zip (built into Windows)
  const psCommand = `
    $zip = "${zipPath.replace(/\\/g, '\\\\')}"
    $dest = "${VENDOR_DIR.replace(/\\/g, '\\\\')}"
    Expand-Archive -Path $zip -DestinationPath $dest -Force
    Get-ChildItem $dest -Recurse -Filter "*.exe" | Move-Item -Destination $dest -Force
  `;

  const ps = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-Command', psCommand]);

  ps.stdout.on('data', (data) => console.log(data.toString()));
  ps.stderr.on('data', (data) => console.error(data.toString()));

  ps.on('close', (code) => {
    // Clean up zip file
    try {
      fs.unlinkSync(zipPath);
    } catch (e) {}

    // Find and rename ffmpeg.exe (builds have versioned folder names)
    const files = fs.readdirSync(VENDOR_DIR);
    for (const file of files) {
      const fullPath = path.join(VENDOR_DIR, file);
      if (fs.statSync(fullPath).isDirectory()) {
        // Look for ffmpeg in subdirectory
        try {
          const subFiles = fs.readdirSync(fullPath);
          for (const subFile of subFiles) {
            if (subFile === 'ffmpeg.exe' || subFile === 'ffprobe.exe') {
              fs.copyFileSync(path.join(fullPath, subFile), path.join(VENDOR_DIR, subFile));
            }
          }
          // Remove the extracted folder
          fs.rmSync(fullPath, { recursive: true });
        } catch (e) {}
      }
    }

    console.log('\nExtraction complete!');
    console.log(`  ${ffmpegPath}`);
    console.log(`  ${ffprobePath}`);
  });
}
