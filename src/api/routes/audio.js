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
 * POST /v1/optimize/audio
 * Optimize/resample audio
 */
router.post('/audio', upload.single('file'), async (req, res) => {
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
      sample_rate: parseInt(req.body.sample_rate) || 16000,
      channels: parseInt(req.body.channels) || 1,
      format: req.body.format || 'mp3',
      response_type: req.body.response_type || 'base64',
    };

    const responseType = req.body.response_type || 'base64';

    // Create SSE connection for progress
    const jobId = ProgressReporter.createJob(res);

    // Execute processing
    const result = await PipelineExecutor.execute('audio', inputBuffer, options, ProgressReporter, jobId);

    // Send final response based on response_type
    if (responseType === 'base64') {
      const base64 = result.buffer.toString('base64');
      const mimeType = result.metadata.mimeType;
      res.json({
        original_size_bytes: originalSize,
        optimized_size_bytes: result.metadata.outputSize,
        sample_rate: result.metadata.sampleRate,
        channels: result.metadata.channels,
        format: result.metadata.format,
        base64: `data:${mimeType};base64,${base64}`,
      });
    } else {
      res.setHeader('Content-Type', result.metadata.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="optimized.${result.metadata.format}"`);
      res.send(result.buffer);
    }
  } catch (error) {
    logger.error('Audio optimization failed', { error: error.message });
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

module.exports = router;
