export class CryptoService {
  private worker: Worker;
  private onEncryptedChunks: ((frameId: number, packets: Uint8Array[]) => void) | null = null;
  private onDecryptedFrame: ((frameId: number, mediaType: number, data: Uint8Array) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL('../workers/crypto.worker.ts', import.meta.url), { type: 'module' });
    
    this.worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'ENCRYPTED_CHUNKS' && this.onEncryptedChunks) {
        this.onEncryptedChunks(payload.frameId, payload.packets);
      } else if (type === 'DECRYPTED_FRAME' && this.onDecryptedFrame) {
        this.onDecryptedFrame(payload.frameId, payload.mediaType, payload.data);
      } else if (type === 'INIT_DONE') {
        console.log('Crypto worker initialized');
      }
    };
  }

  public init(sharedSecret: Uint8Array) {
    this.worker.postMessage({ type: 'INIT', payload: { sharedSecret } });
  }

  public setCallbacks(
    onEncryptedChunks: (frameId: number, packets: Uint8Array[]) => void,
    onDecryptedFrame: (frameId: number, mediaType: number, data: Uint8Array) => void
  ) {
    this.onEncryptedChunks = onEncryptedChunks;
    this.onDecryptedFrame = onDecryptedFrame;
  }

  public encryptAndChunk(frameId: number, mediaType: number, data: Uint8Array) {
    // Transfer the buffer to the worker to avoid copying overhead
    this.worker.postMessage({ type: 'ENCRYPT', payload: { frameId, mediaType, data } }, [data.buffer]);
  }

  public processIncomingPacket(packet: Uint8Array) {
    // We copy the packet buffer here because the WebSocket might reuse it, 
    // or we can transfer it if we own it. Assuming we own it:
    this.worker.postMessage({ type: 'DECRYPT', payload: { packet } }, [packet.buffer]);
  }

  public destroy() {
    this.worker.postMessage({ type: 'DESTROY' });
  }

  public terminate() {
    this.worker.terminate();
  }
}

export const cryptoService = new CryptoService();
