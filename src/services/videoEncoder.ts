declare class MediaStreamTrackProcessor<T> {
  constructor(init: { track: MediaStreamTrack });
  readable: ReadableStream<T>;
}

export interface VideoEncoderConfig {
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
}

let encoder: VideoEncoder | null = null;
let processor: MediaStreamTrackProcessor<VideoFrame> | null = null;
let abortController: AbortController | null = null;

export async function startVideoEncoding(
  track: MediaStreamTrack,
  config: VideoEncoderConfig,
  onChunk: (chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata) => void
) {
  if (encoder) {
    stopVideoEncoding();
  }

  encoder = new VideoEncoder({
    output: (chunk, metadata) => onChunk(chunk, metadata),
    error: (e) => console.error("VideoEncoder error:", e)
  });

  // H.264 Baseline Profile, Level 3.1, Annex B
  encoder.configure({
    codec: 'avc1.42001f', // Baseline profile
    width: config.width,
    height: config.height,
    hardwareAcceleration: 'prefer-hardware',
    bitrate: config.bitrate,
    framerate: config.framerate,
    latencyMode: 'realtime',
    avc: { format: 'annexb' }
  });

  processor = new MediaStreamTrackProcessor({ track });
  const reader = processor.readable.getReader();
  abortController = new AbortController();

  let frameCount = 0;

  try {
    while (!abortController.signal.aborted) {
      const { done, value: frame } = await reader.read();
      if (done) break;
      if (frame) {
        if (encoder.state === 'configured') {
          // Insert keyframe every 60 frames or if forced
          const isKeyFrame = frameCount % 60 === 0 || needsKeyFrame;
          if (needsKeyFrame) needsKeyFrame = false;
          encoder.encode(frame, { keyFrame: isKeyFrame });
          frameCount++;
        }
        frame.close();
      }
    }
  } catch (e) {
    if (abortController && !abortController.signal.aborted) {
      console.error("Track reading error", e);
    }
  } finally {
    reader.releaseLock();
  }
}

export function reconfigureVideoEncoder(config: VideoEncoderConfig) {
  if (encoder && encoder.state === 'configured') {
    encoder.configure({
      codec: 'avc1.42001f',
      width: config.width,
      height: config.height,
      hardwareAcceleration: 'prefer-hardware',
      bitrate: config.bitrate,
      framerate: config.framerate,
      latencyMode: 'realtime',
      avc: { format: 'annexb' }
    });
  }
}

export function stopVideoEncoding() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  if (encoder && encoder.state !== 'closed') {
    encoder.close();
  }
  encoder = null;
  processor = null;
}

let needsKeyFrame = false;
export function forceKeyFrame() {
  needsKeyFrame = true;
}
