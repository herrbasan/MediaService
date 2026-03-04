const express = require('express');
const multer = require('multer');
const config = require('../../config/config');
const PipelineExecutor = require('../../pipeline/PipelineExecutor');
const ProgressReporter = require('../../pipeline/ProgressReporter');
const logger = require('../../utils/logger');

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSizeBytes },
});

/**
 * POST /v1/optimize/video
 * Process video (extract audio or keyframes)
 */
router.post('/video', upload.single('file'), async (req, res) => {
  try {
    let inputBuffer;
    let originalSize;

    // Handle file upload or base64 input
    if (req.file) {
      inputBuffer = req.file.buffer;
      originalSize = req.file.size;
    } else if (req.body.base64) {
      const base64Data = req.body.base64.replace(/^data:[^;]+;base64,/, '');
      inputBuffer = Buffer.from(base64Data, 'base64');
      originalSize = inputBuffer.length;
    } else {
      return res.status(400).json({ error: 'No file or base64 data provided' });
    }

    const options = {
      mode: req.body.mode || 'extract_audio',
      fps: parseInt(req.body.fps) || 1,
      format: req.body.format || 'jpeg',
      max_dimension: parseInt(req.body.max_dimension) || 1024,
      response_type: req.body.response_type || 'base64',
    };

    const responseType = req.body.response_type || 'base64';

    // Create SSE connection for progress
    const jobId = ProgressReporter.createJob(res);

    // Execute processing
    const result = await PipelineExecutor.execute('video', inputBuffer, options, ProgressReporter, jobId);

    // Send final response based on response_type and mode
    if (responseType === 'base64') {
      if (options.mode === 'extract_audio') {
        const base64 = result.buffer.toString('base64');
        res.json({
          original_size_bytes: originalSize,
          output_size_bytes: result.metadata.outputSize,
          mode: result.metadata.mode,
          format: result.metadata.format,
          base64: `data:${result.metadata.mimeType};base64,${base64}`,
        });
      } else {
        res.json({
          original_size_bytes: originalSize,
          frame_count: result.metadata.frameCount,
          mode: result.metadata.mode,
          frames_base64: result.buffer.toString('base64'),
        });
      }
    } else {
      res.setHeader('Content-Type', result.metadata.mimeType);
      if (options.mode === 'extract_audio') {
        res.setHeader('Content-Disposition', 'attachment; filename="audio.mp3"');
      } else {
        res.setHeader('Content-Type', 'image/jpeg'); // frames are jpeg
      }
      res.send(result.buffer);
    }
  } catch (error) {
    logger.error('Video processing failed', { error: error.message });
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

module.exports = router;
