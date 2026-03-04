/**
 * Manages SSE connections for progress reporting
 */
class ProgressReporter {
  constructor() {
    this.connections = new Map();
  }

  /**
   * Create a new job with SSE connection
   * @param {Object} res - Express response object with SSE setup
   * @returns {string} - Job ID
   */
  createJob(res) {
    const jobId = uuidv4();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    res.write('\n');

    this.connections.set(jobId, res);

    res.on('close', () => {
      this.connections.delete(jobId);
    });

    return jobId;
  }

  /**
   * Send progress event to a job
   * @param {string} jobId
   * @param {string} event - Event type: start, progress, complete, error
   * @param {Object} data - Event data
   */
  send(jobId, event, data = {}) {
    const res = this.connections.get(jobId);
    if (!res) return;

    const payload = JSON.stringify({ event, ...data });
    res.write(`event: ${event}\n`);
    res.write(`data: ${payload}\n\n`);
  }

  /**
   * Send progress percentage
   * @param {string} jobId
   * @param {number} percent - 0-100
   * @param {string} message
   */
  progress(jobId, percent, message = '') {
    this.send(jobId, 'progress', { percent, message });
  }

  /**
   * Mark job as complete
   * @param {string} jobId
   * @param {Object} result
   */
  complete(jobId, result) {
    this.send(jobId, 'complete', { result });
    this.close(jobId);
  }

  /**
   * Mark job as errored
   * @param {string} jobId
   * @param {string} error
   */
  error(jobId, error) {
    this.send(jobId, 'error', { error });
    this.close(jobId);
  }

  /**
   * Close a job connection
   * @param {string} jobId
   */
  close(jobId) {
    const res = this.connections.get(jobId);
    if (res) {
      res.end();
      this.connections.delete(jobId);
    }
  }
}

// Simple UUID v4 implementation
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = new ProgressReporter();
