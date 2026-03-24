import { VideoEncoderConfig } from './videoEncoder';

export class ABRController {
  /**
   * Maps estimated bandwidth to optimal video encoding parameters.
   * @param estimatedBps Estimated bandwidth in bits per second
   * @returns VideoEncoderConfig
   */
  public static getOptimalConfig(estimatedBps: number): VideoEncoderConfig {
    // We allocate 90% of the estimated bandwidth to video, leaving 10% for audio + overhead
    const videoBitrate = Math.floor(estimatedBps * 0.9);

    if (estimatedBps >= 1500000) {
      // High quality: 720p @ 30fps
      return { width: 1280, height: 720, bitrate: videoBitrate, framerate: 30 };
    } else if (estimatedBps >= 800000) {
      // Medium quality: 480p @ 24fps
      return { width: 854, height: 480, bitrate: videoBitrate, framerate: 24 };
    } else if (estimatedBps >= 400000) {
      // Low quality: 360p @ 15fps
      return { width: 640, height: 360, bitrate: videoBitrate, framerate: 15 };
    } else {
      // Very low quality: 240p @ 10fps
      return { width: 426, height: 240, bitrate: videoBitrate, framerate: 10 };
    }
  }
}
