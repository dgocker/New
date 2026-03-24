/**
 * Simple AIMD (Additive Increase Multiplicative Decrease) Congestion Controller
 * Inspired by WebRTC GCC (Google Congestion Control)
 */
export class CongestionController {
  private estimatedBps: number = 1000000; // Start at 1 Mbps
  private minBps: number = 150000; // 150 kbps
  private maxBps: number = 2500000; // 2.5 Mbps
  private state: 'slow_start' | 'congestion_avoidance' = 'slow_start';
  
  private onBitrateChange: ((bps: number) => void) | null = null;

  constructor() {}

  public setCallback(cb: (bps: number) => void) {
    this.onBitrateChange = cb;
  }

  /**
   * Called when we receive a Receiver Report (RR) via the priority feedback channel
   * @param fractionLost 0.0 to 1.0 (percentage of packets lost)
   * @param rtt Round trip time in milliseconds
   */
  public processFeedback(fractionLost: number, rtt: number) {
    let changed = false;

    if (fractionLost > 0.1) {
      // High loss (>10%): Multiplicative Decrease
      this.state = 'congestion_avoidance';
      this.estimatedBps = Math.max(this.minBps, this.estimatedBps * 0.8);
      changed = true;
    } else if (fractionLost > 0.02) {
      // 2-10% loss: Hold state (do nothing)
      this.state = 'congestion_avoidance';
    } else {
      // Low loss (<2%): Increase
      if (this.state === 'slow_start') {
        // Multiplicative increase during slow start (8% increase)
        this.estimatedBps = Math.min(this.maxBps, this.estimatedBps * 1.08);
      } else {
        // Additive increase during congestion avoidance (10 kbps)
        this.estimatedBps = Math.min(this.maxBps, this.estimatedBps + 10000);
      }
      changed = true;
    }

    if (changed && this.onBitrateChange) {
      this.onBitrateChange(this.estimatedBps);
    }
  }

  public getEstimatedBitrate(): number {
    return this.estimatedBps;
  }
  
  public reset() {
    this.estimatedBps = 1000000;
    this.state = 'slow_start';
  }
}

export const congestionController = new CongestionController();
