declare var MediaStreamTrackGenerator: any;

export let audioDecoder: AudioDecoder | null = null;
let audioGenerator: any = null;
let audioWriter: WritableStreamDefaultWriter<AudioData> | null = null;

export function startAudioDecoding(): MediaStreamTrack {
  audioGenerator = new MediaStreamTrackGenerator({ kind: 'audio' });
  audioWriter = audioGenerator.writable.getWriter();

  audioDecoder = new AudioDecoder({
    output: (data) => {
      if (audioWriter) {
        audioWriter.write(data);
        // Note: writing to the generator transfers ownership, so we don't close() it here.
      } else {
        data.close();
      }
    },
    error: (e) => console.error("AudioDecoder error:", e)
  });

  audioDecoder.configure({
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 1,
  });

  return audioGenerator as MediaStreamTrack;
}

export function decodeAudioChunk(chunk: EncodedAudioChunk) {
  if (audioDecoder && audioDecoder.state === 'configured') {
    audioDecoder.decode(chunk);
  }
}

export function stopAudioDecoding() {
  if (audioDecoder) {
    if (audioDecoder.state !== 'closed') {
      audioDecoder.close();
    }
    audioDecoder = null;
  }
  if (audioWriter) {
    audioWriter.releaseLock();
    audioWriter = null;
  }
  if (audioGenerator) {
    audioGenerator = null;
  }
}
