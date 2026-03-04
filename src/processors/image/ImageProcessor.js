const sharp = require('sharp');
const Processor = require('../../pipeline/Processor');
const logger = require('../../utils/logger');

/**
 * Image processor using sharp (libvips)
 */
class ImageProcessor extends Processor {
  constructor() {
    super('image');
  }

  validateOptions(options) {
    const { max_dimension, quality, format } = options;

    if (max_dimension !== undefined && (max_dimension < 1 || max_dimension > 10000)) {
      throw new Error('max_dimension must be between 1 and 10000');
    }
    if (quality !== undefined && (quality < 1 || quality > 100)) {
      throw new Error('quality must be between 1 and 100');
    }
    if (format !== undefined && !['jpeg', 'png', 'webp', 'avif', 'gif'].includes(format)) {
      throw new Error('format must be jpeg, png, webp, avif, or gif');
    }
  }

  async process(input, options = {}, onProgress) {
    const {
      max_dimension = 1024,
      quality = 85,
      format = 'jpeg',
      strip_exif = true,
    } = options;

    onProgress?.(5, 'Loading image');

    let pipeline = sharp(input);

    // Get metadata for aspect ratio calculation
    const metadata = await pipeline.metadata();
    onProgress?.(15, 'Analyzing dimensions');

    // Calculate resize dimensions
    let width = metadata.width;
    let height = metadata.height;
    const needsResize = width > max_dimension || height > max_dimension;

    if (needsResize) {
      if (width > height) {
        height = Math.round((height / width) * max_dimension);
        width = max_dimension;
      } else {
        width = Math.round((width / height) * max_dimension);
        height = max_dimension;
      }

      onProgress?.(30, `Resizing to ${width}x${height}`);
      pipeline = pipeline.resize(width, height, { fit: 'inside' });
    }

    // Strip EXIF if requested
    if (strip_exif) {
      onProgress?.(50, 'Stripping metadata');
      pipeline = pipeline.rotate(); // Auto-rotate and strip EXIF
    }

    // Apply format and quality
    onProgress?.(70, `Converting to ${format}`);
    switch (format) {
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality });
        break;
      case 'png':
        pipeline = pipeline.png({ quality });
        break;
      case 'webp':
        pipeline = pipeline.webp({ quality });
        break;
      case 'avif':
        pipeline = pipeline.avif({ quality });
        break;
      case 'gif':
        pipeline = pipeline.gif();
        break;
    }

    onProgress?.(85, 'Encoding output');
    const outputBuffer = await pipeline.toBuffer();

    const outputMetadata = await sharp(outputBuffer).metadata();

    logger.info('Image processed', {
      originalSize: input.length,
      outputSize: outputBuffer.length,
      dimensions: `${outputMetadata.width}x${outputMetadata.height}`,
      format,
    });

    onProgress?.(100, 'Complete');

    return {
      buffer: outputBuffer,
      metadata: {
        originalSize: input.length,
        outputSize: outputBuffer.length,
        width: outputMetadata.width,
        height: outputMetadata.height,
        format,
        mimeType: `image/${format === 'jpeg' ? 'jpeg' : format}`,
      },
    };
  }
}

module.exports = ImageProcessor;
