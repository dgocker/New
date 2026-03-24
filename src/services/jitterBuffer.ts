export class JitterBuffer<T> {
  private queue: { frameId: number, chunk: T, chunkTimestamp: number, localReceiveTime: number }[] = [];
  private playoutDelayMs: number;
  private onFrameReady: (chunk: T) => void;
  private lastEmittedId = -1;
  private intervalId: any = null;
  
  private firstChunkTimestamp: number = -1;
  private firstLocalTime: number = -1;

  constructor(onFrameReady: (chunk: T) => void, playoutDelayMs = 60) {
    this.onFrameReady = onFrameReady;
    this.playoutDelayMs = playoutDelayMs;
  }

  public start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tick(), 5); // 5ms tick for smoother sync
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.queue = [];
    this.lastEmittedId = -1;
    this.firstChunkTimestamp = -1;
    this.firstLocalTime = -1;
  }

  public push(frameId: number, chunk: T, chunkTimestamp: number) {
    if (frameId <= this.lastEmittedId) return; // Drop late frames
    
    if (this.firstChunkTimestamp === -1) {
      this.firstChunkTimestamp = chunkTimestamp;
      this.firstLocalTime = performance.now();
    }
    
    this.queue.push({ frameId, chunk, chunkTimestamp, localReceiveTime: performance.now() });
    // Sort by frameId to ensure in-order playout
    this.queue.sort((a, b) => a.frameId - b.frameId);
  }

  private tick() {
    const now = performance.now();
    while (this.queue.length > 0) {
      const head = this.queue[0];
      
      // Calculate target playout time based on the media timestamp
      // chunkTimestamp is in microseconds for WebCodecs
      const relativeTimeMs = (head.chunkTimestamp - this.firstChunkTimestamp) / 1000;
      const targetPlayoutTime = this.firstLocalTime + relativeTimeMs + this.playoutDelayMs;
      
      if (now >= targetPlayoutTime) {
        this.queue.shift();
        if (head.frameId > this.lastEmittedId) {
          this.lastEmittedId = head.frameId;
          this.onFrameReady(head.chunk);
        }
      } else {
        // The head of the queue hasn't reached its presentation time
        break;
      }
    }
  }
}
