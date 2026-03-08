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
   * @param {string} jobId - Job ID (can be null for no-op)
   * @param {string} event - Event type: start, progress, complete, error
   * @param {Object} data - Event data
   */
  send(jobId, event, data = {}) {
    if (!jobId) return; // No-op if no jobId (e.g., base64 response mode)
    
    const res = this.connections.get(jobId);
    if (!res) return;

    const payload = JSON.stringify({ event, ...data });
    res.write(`event: ${event}\n`);
    res.write(`data: ${payload}\n\n`);
  }

  /**
   * Send progress percentage
   * @param {string} jobId - Job ID (can be null for no-op)
   * @param {number} percent - 0-100
   * @param {string} message
   */
  progress(jobId, percent, message = '') {
    if (!jobId) return;
    this.send(jobId, 'progress', { percent, message });
  }

  /**
   * Mark job as complete
   * @param {string} jobId - Job ID (can be null for no-op)
   * @param {Object} result
   */
  complete(jobId, result) {
    if (!jobId) return;
    this.send(jobId, 'complete', { result });
    this.close(jobId);
  }

  /**
   * Mark job as errored
   * @param {string} jobId - Job ID (can be null for no-op)
   * @param {string} error
   */
  error(jobId, error) {
    if (!jobId) return;
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
