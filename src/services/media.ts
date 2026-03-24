let hiddenVideo: HTMLVideoElement | null = null;

export async function getLocalMedia(video: boolean, audio: boolean, facingMode: 'user' | 'environment' = 'user'): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: video ? {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
      facingMode: facingMode
    } : false,
    audio: audio ? {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    } : false
  });

  // Attach to hidden video element to keep stream alive in background
  if (!hiddenVideo) {
    hiddenVideo = document.createElement('video');
    hiddenVideo.setAttribute('playsinline', 'true');
    hiddenVideo.setAttribute('autoplay', 'true');
    hiddenVideo.setAttribute('muted', 'true');
    hiddenVideo.style.display = 'none';
    document.body.appendChild(hiddenVideo);
  }
  
  hiddenVideo.srcObject = stream;
  await hiddenVideo.play().catch(e => console.error("Hidden video play failed", e));

  return stream;
}

export function stopLocalMedia(stream: MediaStream | null) {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  if (hiddenVideo) {
    hiddenVideo.srcObject = null;
  }
}
