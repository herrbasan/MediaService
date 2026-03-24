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
 * POST /v1/optimize/image/crop
 * Crop an image by region, center, or grid
 */
router.post('/image/crop', async (req, res) => {
  try {
    let inputBuffer;
    let originalSize;

    // Handle base64 input
    if (req.body.base64) {
      const base64Data = req.body.base64.replace(/^data:[^;]+;base64,/, '');
      inputBuffer = Buffer.from(base64Data, 'base64');
      originalSize = inputBuffer.length;
    } else {
      return res.status(400).json({ error: 'No base64 data provided' });
    }

    const { crop, quality, format } = req.body;

    if (!crop || !crop.type) {
      return res.status(400).json({ error: 'crop object with type (region|center|grid) is required' });
    }

    const options = {
      quality: parseInt(quality) || 85,
      format: format || 'jpeg',
      crop,
    };

    const result = await PipelineExecutor.execute('image', inputBuffer, options, ProgressReporter);

    res.json({
      original_size_bytes: originalSize,
      ...result.metadata,
    });
  } catch (error) {
    logger.error('Image crop failed', { error: error.message });
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * POST /v1/optimize/image
 * Optimize/resize an image
 */
router.post('/image', upload.single('file'), async (req, res) => {
  try {
    let inputBuffer;
    let originalSize;

    // Handle file upload or base64 input
    if (req.file) {
      inputBuffer = req.file.buffer;
      originalSize = req.file.size;
    } else if (req.body.base64) {
      // Handle base64 input (strip data URL prefix if present)
      const base64Data = req.body.base64.replace(/^data:[^;]+;base64,/, '');
      inputBuffer = Buffer.from(base64Data, 'base64');
      originalSize = inputBuffer.length;
    } else {
      return res.status(400).json({ error: 'No file or base64 data provided' });
    }

    const options = {
      max_dimension: parseInt(req.body.max_dimension) || 1024,
      quality: parseInt(req.body.quality) || 85,
      format: req.body.format || 'jpeg',
      strip_exif: req.body.strip_exif !== 'false',
      response_type: req.body.response_type || 'base64',
    };

    const responseType = req.body.response_type || 'base64';

    // Only use SSE for progress reporting if not requesting base64 response
    // For base64, we send a simple JSON response at the end
    let jobId = null;
    if (responseType !== 'base64') {
      jobId = ProgressReporter.createJob(res);
    }

    // Execute processing
    const result = await PipelineExecutor.execute('image', inputBuffer, options, ProgressReporter, jobId);

    // Send final response based on response_type
    if (responseType === 'base64') {
      const base64 = result.buffer.toString('base64');
      const mimeType = result.metadata.mimeType;
      res.json({
        original_size_bytes: originalSize,
        optimized_size_bytes: result.metadata.outputSize,
        format: result.metadata.format,
        width: result.metadata.width,
        height: result.metadata.height,
        base64: `data:${mimeType};base64,${base64}`,
      });
    } else {
      // Stream as file
      res.setHeader('Content-Type', result.metadata.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="optimized.${result.metadata.format}"`);
      res.send(result.buffer);
    }
  } catch (error) {
    logger.error('Image optimization failed', { error: error.message });
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

module.exports = router;
