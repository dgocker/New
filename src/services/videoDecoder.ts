let decoder: VideoDecoder | null = null;

export function startVideoDecoding(onFrame: (frame: VideoFrame) => void) {
  if (decoder) {
    stopVideoDecoding();
  }

  decoder = new VideoDecoder({
    output: (frame) => onFrame(frame),
    error: (e) => console.error("VideoDecoder error:", e)
  });

  // H.264 Baseline Profile, Annex B (matches encoder)
  decoder.configure({
    codec: 'avc1.42001f',
    hardwareAcceleration: 'prefer-hardware',
  });
}

export function decodeChunk(chunk: EncodedVideoChunk) {
  if (decoder && decoder.state === 'configured') {
    try {
      decoder.decode(chunk);
    } catch (e) {
      console.error("Decode error", e);
    }
  }
}

export function stopVideoDecoding() {
  if (decoder && decoder.state !== 'closed') {
    decoder.close();
  }
  decoder = null;
}
