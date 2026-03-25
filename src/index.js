const express = require('express');
const config = require('./config/config');
const logger = require('./utils/logger');
const PipelineExecutor = require('./pipeline/PipelineExecutor');
const ProgressReporter = require('./pipeline/ProgressReporter');

// Import processors
const ImageProcessor = require('./processors/image/ImageProcessor');
const AudioProcessor = require('./processors/audio/AudioProcessor');
const VideoProcessor = require('./processors/video/VideoProcessor');

// Import routes
const imageRoutes = require('./api/routes/image');
const audioRoutes = require('./api/routes/audio');
const videoRoutes = require('./api/routes/video');

const app = express();

// Middleware - JSON body limits (file uploads handled by multer)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    processors: {
      image: 'unknown',
      audio: 'unknown',
      video: 'unknown',
    },
  };

  // Check if sharp is available
  try {
    require('sharp');
    health.processors.image = 'ready';
  } catch (e) {
    health.processors.image = 'error';
  }

  // Check ffmpeg (basic check)
  try {
    const ffmpeg = require('fluent-ffmpeg');
    health.processors.audio = 'ready';
    health.processors.video = 'ready';
  } catch (e) {
    health.processors.audio = 'error';
    health.processors.video = 'error';
  }

  const allReady = Object.values(health.processors).every(s => s === 'ready');
  health.status = allReady ? 'ok' : 'degraded';

  res.json(health);
});

// Register processors
PipelineExecutor.register('image', new ImageProcessor());
PipelineExecutor.register('audio', new AudioProcessor());
PipelineExecutor.register('video', new VideoProcessor());

// API routes
app.use('/v1/optimize', imageRoutes);
app.use('/v1/optimize', audioRoutes);
app.use('/v1/optimize', videoRoutes);

// SSE progress endpoint
app.get('/v1/optimize/progress/:jobId', (req, res) => {
  const { jobId } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  res.write('\n');

  // Send initial connection message
  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ jobId })}\n\n`);

  // Clean up on close
  res.on('close', () => {
    logger.debug('SSE connection closed', { jobId });
  });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File too large. Max size: ${config.maxFileSizeMb}MB` });
  }

  res.status(500).json({ error: err.message || 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(config.port, () => {
  logger.info(`Media Service started on port ${config.port}`);
  logger.info(`Max file size: ${config.maxFileSizeMb}MB`);
  logger.info(`Log level: ${config.logLevel}`);
});

module.exports = app;
