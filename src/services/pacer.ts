export class Pacer {
  private queue: Uint8Array[] = [];
  private targetBitrate: number = 1000000; // 1 Mbps default
  private ws: WebSocket | null = null;
  private timerWorker: Worker | null = null;
  private tokens: number = 0;
  private lastTick: number = performance.now();

  constructor() {
    this.timerWorker = new Worker(new URL('../workers/timer.worker.ts', import.meta.url), { type: 'module' });
    this.timerWorker.onmessage = (e) => {
      if (e.data === 'tick') {
        this.tick();
      }
    };
  }

  public setWebSocket(ws: WebSocket) {
    this.ws = ws;
  }

  public setTargetBitrate(bps: number) {
    this.targetBitrate = bps;
  }

  public enqueue(packet: Uint8Array) {
    this.queue.push(packet);
  }

  public start() {
    this.lastTick = performance.now();
    this.timerWorker?.postMessage('start');
  }

  public stop() {
    this.timerWorker?.postMessage('stop');
    this.queue = [];
  }

  private tick() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const now = performance.now();
    const deltaMs = now - this.lastTick;
    this.lastTick = now;

    // Calculate tokens (bytes) generated in this tick based on target bitrate
    const bytesPerMs = this.targetBitrate / 8 / 1000;
    this.tokens += bytesPerMs * deltaMs;

    // Token bucket capacity: allow up to 100ms of burst
    const maxBurst = bytesPerMs * 100;
    if (this.tokens > maxBurst) {
      this.tokens = maxBurst;
    }

    // Send packets while we have enough tokens and queue is not empty
    while (this.queue.length > 0 && this.tokens >= this.queue[0].length) {
      // Backpressure check: if WebSocket buffer is too large (> 512KB), 
      // stop sending and let it drain to avoid memory bloat and latency spikes.
      if (this.ws.bufferedAmount > 512 * 1024) {
        break;
      }

      const packet = this.queue.shift()!;
      this.ws.send(packet);
      this.tokens -= packet.length;
    }
    
    // Drop packets if queue gets too large (e.g., > 2 seconds of video)
    // This prevents infinite memory growth if network is completely stalled
    if (this.queue.length > 300) {
      console.warn("Pacer queue too large, dropping old packets");
      this.queue.splice(0, this.queue.length - 100); // Keep only the newest 100
    }
  }
}

export const pacer = new Pacer();
