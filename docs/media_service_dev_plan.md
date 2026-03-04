# Media Processing Service - Development Plan

The **Media Processing Service (MPS)** is a standalone, CPU-heavy microservice designed to act as an optimization sidecar for the LLM Gateway. Its sole purpose is to receive large multimodal payloads (images, audio, video), aggressively compress/downscale them, and return LLM-friendly formats. 

By isolating this workload, the core Gateway remains lightweight, pure-JS, and unaffected by the event-loop blocking operations of media crunching.

---

## 1. Core Objectives
- **LLM-Targeted Downscaling:** LLMs rarely benefit from resolutions over 1024px or bitrates over 16kHz. MPS crushes massive files into tokens-efficient, VRAM-safe sizes.
- **Stateless & Synchronous:** The service acts as a pure processing pipeline (Data In -> Data Out). No databases, no persistent storage, no complex session state.
- **Blazing Fast:** Designed to be highly concurrent and utilize native binary bindings under the hood.

---

## 2. Recommended Tech Stack
Because this service is entirely I/O and CPU bound with native media dependencies, you have three primary options:

1. **Go (Golang):** Highly recommended. Insanely fast, low memory footprint, compiles to a single binary. Use `bimg` (libvips wrapper) for images and `go-fluent-ffmpeg` for media.
2. **Python:** Standard choice for AI media. Native ecosystem for audio (`librosa`) and images (`Pillow`, `OpenCV`). Slower HTTP handling (FastAPI) but massive library support.
3. **Node.js (Fat Container):** Quickest to build if you only know JS. Express + `sharp` + `fluent-ffmpeg`. The main issue is the bulky `node_modules` size.

*Assumption for this plan: A fast, stateless API framework (Go Fiber, Python FastAPI, or Node Express).*

---

## 3. Supported API Endpoints

### `POST /v1/optimize/image`
Takes a massive image and returns an LLM-friendly downscaled version.

* **Accepts:** `multipart/form-data` OR inline `{"base64": "..."}`
* **Parameters:** 
  * `max_dimension` (default: 1024)
  * `quality` (default: 85)
  * `format` (default: 'jpeg') - WebP is also good, but heavily model-dependent.
* **Processing Logic:** 
  1. Detect current aspect ratio.
  2. If longest edge > `max_dimension`, proportionally resize so longest edge == `max_dimension`.
  3. Strip EXIF data (privacy + space saving).
  4. Compress to JPEG/WebP.
* **Returns:** 
  ```json
  {
    "original_size_bytes": 5242880,
    "optimized_size_bytes": 102400,
    "format": "image/jpeg",
    "base64": "..."
  }
  ```

### `POST /v1/optimize/audio`
Prepares user microphone recordings or massive WAV files for Speech-to-Text (STT) models like Whisper.

* **Accepts:** `multipart/form-data`
* **Parameters:**
  * `sample_rate` (default: 16000)
  * `channels` (default: 1)
* **Processing Logic:**
  1. Down-mix stereo to mono.
  2. Resample to 16kHz (Standard Whisper/LLM input resolution).
  3. Compress to `.mp3` or `.ogg` (if supported by target) or `.wav` for raw uncompressed.
* **Returns:** Downscaled buffer or base64.

### `POST /v1/optimize/video` (Future/Phase 2)
Extracts keyframes or audio tracks from massive video uploads.

* **Accepts:** `multipart/form-data`
* **Parameters:**
  * `mode` (enum: `extract_audio`, `extract_keyframes`)
  * `fps` (default: 1) - One frame per second.
* **Processing Logic:**
  1. Uses `ffmpeg` to strip the audio track or grab frames.
* **Returns:** An array of base64 images or a single audio track buffer.

---

## 4. Error Handling & Gateway Contract

The Gateway expects the MPS to be robust but occasionally fail (e.g., corrupt file, unsupported format).

* **200 OK:** Success, the Gateway swaps the payload.
* **415 Unsupported Media Type:** E.g., user uploaded a `.TIFF` file but the processor only reads JPEG/PNG. The Gateway should *pass-through* the original and let the upstream LLM provider reject it.
* **413 Payload Too Large:** The MPS should have hard limits (e.g., `LIMIT_IMAGE_SIZE_MB=25`). If exceeded, Gateway returns 413 to the user.
* **5XX Errors / Timeout:** The Gateway's internal Circuit Breaker will trip, logging a warning, and bypassing the MPS entirely to maintain service uptime.

---

## 5. Security & Deployment

* **Authentication:** It is meant to be run in a private subnet (e.g., inside a `docker-compose` network) alongside the Gateway. 
  * If exposed publicly, require a simple `Authorization: Bearer <shared_secret_token>`.
* **Hardware:** Needs decent CPU allocation. Image resizing is CPU intensive, but short-lived.
* **Observability:** Must expose a `GET /health` endpoint that checks if native dependencies (`libvips`, `ffmpeg`) are successfully hooked and accessible.

---

## 6. Dockerization Blueprint (`Dockerfile`)

```dockerfile
# Example setup requiring system dependencies
FROM debian:alpine

# Install heavy system level media dependencies
RUN apk add --no-cache vips-dev ffmpeg curl

# ... Install language runtime (Node/Go/Python) ...
# ... Copy code ...

ENV PORT=3500
ENV MAX_CONCURRENT_WORKERS=4

EXPOSE 3500
CMD ["run-server"]
```
