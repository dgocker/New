import { cryptoService } from './crypto';
import { pacer } from './pacer';
import { congestionController } from './congestionControl';
import { ABRController } from './abr';
import { JitterBuffer } from './jitterBuffer';
import { startVideoEncoding, stopVideoEncoding, forceKeyFrame, reconfigureVideoEncoder } from './videoEncoder';
import { startVideoDecoding, stopVideoDecoding, decodeChunk } from './videoDecoder';
import { startAudioEncoding, stopAudioEncoding } from './audioEncoder';
import { startAudioDecoding, stopAudioDecoding, decodeAudioChunk } from './audioDecoder';

class CallManager {
  private ws: WebSocket | null = null;
  private videoJitterBuffer: JitterBuffer<EncodedVideoChunk> | null = null;
  private audioJitterBuffer: JitterBuffer<EncodedAudioChunk> | null = null;
  private videoFrameIdCounter = 0;
  private audioFrameIdCounter = 0;
  private isRunning = false;
  private pingInterval: any = null;
  private remoteAudioElement: HTMLAudioElement | null = null;

  public async start(roomId: string, sharedSecret: Uint8Array, localStream: MediaStream) {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. Initialize Crypto
    cryptoService.init(sharedSecret);

    // 2. Setup WebSocket Relay
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}/secure-relay?roomId=${roomId}`);
    this.ws.binaryType = 'arraybuffer';

    // 3. Setup Pacer
    pacer.setWebSocket(this.ws);
    pacer.start();

    // 4. Setup Jitter Buffers & Decoders
    this.videoJitterBuffer = new JitterBuffer<EncodedVideoChunk>((chunk) => decodeChunk(chunk), 60);
    this.videoJitterBuffer.start();
    
    this.audioJitterBuffer = new JitterBuffer<EncodedAudioChunk>((chunk) => decodeAudioChunk(chunk), 40); // Lower delay for audio
    this.audioJitterBuffer.start();

    startVideoDecoding((frame) => {
      if ((window as any).renderRemoteFrame) {
        (window as any).renderRemoteFrame(frame);
      } else {
        frame.close();
      }
    });

    const remoteAudioTrack = startAudioDecoding();
    this.playRemoteAudio(remoteAudioTrack);

    // 5. Wire Crypto Callbacks
    cryptoService.setCallbacks(
      (frameId, packets) => {
        packets.forEach(p => pacer.enqueue(p));
      },
      (frameId, mediaType, data) => {
        if (mediaType === 1) { // Video
          const chunk = this.deserializeVideoChunk(data);
          this.videoJitterBuffer?.push(frameId, chunk, chunk.timestamp);
        } else if (mediaType === 2) { // Audio
          const chunk = this.deserializeAudioChunk(data);
          this.audioJitterBuffer?.push(frameId, chunk, chunk.timestamp);
        }
      }
    );

    // 6. Handle Incoming WebSocket Messages
    this.ws.onmessage = (event) => {
      const data = new Uint8Array(event.data);
      if (data[0] === 0) { // Media packet
        cryptoService.processIncomingPacket(data);
      } else if (data[0] === 255) { // RTCP / Feedback
        const fractionLost = data[1] / 255;
        const oldBps = congestionController.getEstimatedBitrate();
        const oldConfig = ABRController.getOptimalConfig(oldBps);
        
        congestionController.processFeedback(fractionLost, 50); // Hardcoded RTT for now
        
        const newBps = congestionController.getEstimatedBitrate();
        pacer.setTargetBitrate(newBps);

        const newConfig = ABRController.getOptimalConfig(newBps);
        if (oldConfig.width !== newConfig.width || oldConfig.framerate !== newConfig.framerate) {
          console.log(`[ABR] Scaling to ${newConfig.width}x${newConfig.height} @ ${newConfig.framerate}fps (${newConfig.bitrate}bps)`);
          reconfigureVideoEncoder(newConfig);
          forceKeyFrame();
        } else if (Math.abs(oldConfig.bitrate - newConfig.bitrate) > 50000) {
          // Just update bitrate if it changed significantly
          reconfigureVideoEncoder(newConfig);
        }
      }
    };

    this.ws.onclose = () => {
      if (this.isRunning) {
        console.log("WebSocket closed, attempting reconnect...");
        setTimeout(() => this.reconnect(roomId), 1000);
      }
    };

    // 7. Start Encoding Local Stream
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      const initialConfig = ABRController.getOptimalConfig(congestionController.getEstimatedBitrate());
      startVideoEncoding(videoTrack, initialConfig, (chunk) => {
        const serialized = this.serializeMediaChunk(chunk);
        cryptoService.encryptAndChunk(this.videoFrameIdCounter++, 1, serialized);
      });
    }

    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      startAudioEncoding(audioTrack, (chunk) => {
        const serialized = this.serializeMediaChunk(chunk);
        cryptoService.encryptAndChunk(this.audioFrameIdCounter++, 2, serialized);
      });
    }

    // 8. Send periodic feedback (mocking RTCP Receiver Report)
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Mocking 0% loss for now, in a real app we'd track sequence numbers
        // Pad to 128 bytes to obfuscate from DPI
        const feedback = new Uint8Array(128); 
        feedback[0] = 255;
        feedback[1] = 0; // fractionLost
        // Fill the rest with random bytes
        crypto.getRandomValues(new Uint8Array(feedback.buffer, 2));
        this.ws.send(feedback);
      }
    }, 1000);
  }

  public stop() {
    this.isRunning = false;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect loop
      this.ws.close();
      this.ws = null;
    }
    pacer.stop();
    this.videoJitterBuffer?.stop();
    this.audioJitterBuffer?.stop();
    stopVideoEncoding();
    stopVideoDecoding();
    stopAudioEncoding();
    stopAudioDecoding();
    this.stopRemoteAudio();
    cryptoService.destroy(); // Perfect Forward Secrecy
  }

  public replaceTracks(newStream: MediaStream) {
    if (!this.isRunning) return;

    // 1. Replace Video Track
    const newVideoTrack = newStream.getVideoTracks()[0];
    if (newVideoTrack) {
      stopVideoEncoding();
      const config = ABRController.getOptimalConfig(congestionController.getEstimatedBitrate());
      startVideoEncoding(newVideoTrack, config, (chunk) => {
        const serialized = this.serializeMediaChunk(chunk);
        cryptoService.encryptAndChunk(this.videoFrameIdCounter++, 1, serialized);
      });
    }

    // 2. Replace Audio Track
    const newAudioTrack = newStream.getAudioTracks()[0];
    if (newAudioTrack) {
      stopAudioEncoding();
      startAudioEncoding(newAudioTrack, (chunk) => {
        const serialized = this.serializeMediaChunk(chunk);
        cryptoService.encryptAndChunk(this.audioFrameIdCounter++, 2, serialized);
      });
    }
  }

  private reconnect(roomId: string) {
    if (!this.isRunning) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}/secure-relay?roomId=${roomId}`);
    this.ws.binaryType = 'arraybuffer';
    
    pacer.setWebSocket(this.ws);
    
    this.ws.onmessage = (event) => {
      const data = new Uint8Array(event.data);
      if (data[0] === 0) {
        cryptoService.processIncomingPacket(data);
      } else if (data[0] === 255) {
        const fractionLost = data[1] / 255;
        const oldBps = congestionController.getEstimatedBitrate();
        const oldConfig = ABRController.getOptimalConfig(oldBps);
        
        congestionController.processFeedback(fractionLost, 50);
        
        const newBps = congestionController.getEstimatedBitrate();
        pacer.setTargetBitrate(newBps);

        const newConfig = ABRController.getOptimalConfig(newBps);
        if (oldConfig.width !== newConfig.width || oldConfig.framerate !== newConfig.framerate) {
          console.log(`[ABR] Scaling to ${newConfig.width}x${newConfig.height} @ ${newConfig.framerate}fps (${newConfig.bitrate}bps)`);
          reconfigureVideoEncoder(newConfig);
          forceKeyFrame();
        } else if (Math.abs(oldConfig.bitrate - newConfig.bitrate) > 50000) {
          reconfigureVideoEncoder(newConfig);
        }
      }
    };

    this.ws.onclose = () => {
      if (this.isRunning) {
        console.log("WebSocket closed again, attempting reconnect...");
        setTimeout(() => this.reconnect(roomId), 2000);
      }
    };
  }

  private playRemoteAudio(track: MediaStreamTrack) {
    this.remoteAudioElement = new Audio();
    this.remoteAudioElement.srcObject = new MediaStream([track]);
    this.remoteAudioElement.play().catch(e => console.error("Audio play failed:", e));
  }

  private stopRemoteAudio() {
    if (this.remoteAudioElement) {
      this.remoteAudioElement.pause();
      this.remoteAudioElement.srcObject = null;
      this.remoteAudioElement = null;
    }
  }

  private serializeMediaChunk(chunk: EncodedVideoChunk | EncodedAudioChunk): Uint8Array {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    const buffer = new ArrayBuffer(13 + data.length);
    const view = new DataView(buffer);
    view.setUint8(0, chunk.type === 'key' ? 1 : 0);
    view.setFloat64(1, chunk.timestamp, true); // little-endian
    view.setUint32(9, chunk.duration || 0, true);
    new Uint8Array(buffer).set(data, 13);
    return new Uint8Array(buffer);
  }

  private deserializeVideoChunk(buffer: Uint8Array): EncodedVideoChunk {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const type = view.getUint8(0) === 1 ? 'key' : 'delta';
    const timestamp = view.getFloat64(1, true);
    const duration = view.getUint32(9, true);
    const data = buffer.slice(13);
    return new EncodedVideoChunk({ type, timestamp, duration, data });
  }

  private deserializeAudioChunk(buffer: Uint8Array): EncodedAudioChunk {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const type = view.getUint8(0) === 1 ? 'key' : 'delta';
    const timestamp = view.getFloat64(1, true);
    const duration = view.getUint32(9, true);
    const data = buffer.slice(13);
    return new EncodedAudioChunk({ type, timestamp, duration, data });
  }
}

export const callManager = new CallManager();
