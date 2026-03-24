declare var MediaStreamTrackProcessor: any;

export let audioEncoder: AudioEncoder | null = null;
let audioProcessor: any = null;
let reader: ReadableStreamDefaultReader<AudioData> | null = null;

export function startAudioEncoding(
  track: MediaStreamTrack,
  onChunk: (chunk: EncodedAudioChunk) => void
) {
  audioEncoder = new AudioEncoder({
    output: onChunk,
    error: (e) => console.error("AudioEncoder error:", e)
  });

  audioEncoder.configure({
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 1,
    bitrate: 32000, // 32 kbps is good for voice
  });

  audioProcessor = new MediaStreamTrackProcessor({ track });
  reader = audioProcessor.readable.getReader();

  const readFrame = async () => {
    try {
      while (true) {
        if (!reader) break;
        const { done, value } = await reader.read();
        if (done) break;
        if (value && audioEncoder && audioEncoder.state === 'configured') {
          audioEncoder.encode(value);
          value.close();
        } else if (value) {
          value.close();
        }
      }
    } catch (e) {
      console.error("Audio processor read error:", e);
    }
  };

  readFrame();
}

export function stopAudioEncoding() {
  if (reader) {
    reader.cancel();
    reader = null;
  }
  if (audioEncoder) {
    if (audioEncoder.state !== 'closed') {
      audioEncoder.close();
    }
    audioEncoder = null;
  }
  if (audioProcessor) {
    audioProcessor = null;
  }
}
