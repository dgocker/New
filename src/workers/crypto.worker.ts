// Web Worker for AES-GCM Encryption/Decryption and Chunking

const MTU = 1200;
const HEADER_SIZE = 23; // 1(Routing) + 1(Type) + 4(FrameId) + 2(ChunkIdx) + 2(TotalChunks) + 12(IV) + 1(PaddingLen)
const MAX_PAYLOAD = MTU - HEADER_SIZE;

let cryptoKey: CryptoKey | null = null;
const OBFUSCATION_MASK = new Uint8Array([0x5A, 0x3C, 0x96, 0x18, 0x72, 0x4B, 0xE1, 0x8D, 0x2F]);

// Reassembly buffer for incoming chunks
// frameId -> { totalChunks, receivedChunks, chunks: Uint8Array[], timestamp }
const reassemblyBuffer = new Map<number, any>();

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'INIT') {
    const rawKey = payload.sharedSecret; // Uint8Array
    cryptoKey = await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
    self.postMessage({ type: 'INIT_DONE' });
  } 
  else if (type === 'ENCRYPT') {
    if (!cryptoKey) return;
    const { frameId, data, mediaType } = payload; // mediaType: 1 = Video, 2 = Audio
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      data
    );
    
    const encryptedData = new Uint8Array(encryptedBuffer);
    const totalChunks = Math.ceil(encryptedData.length / MAX_PAYLOAD);
    
    const packets: Uint8Array[] = [];
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * MAX_PAYLOAD;
      const end = Math.min(start + MAX_PAYLOAD, encryptedData.length);
      const chunkPayload = encryptedData.slice(start, end);
      
      // Add padding to obfuscate packet size from DPI
      // Pad to a multiple of 128 bytes, capped at MTU
      let targetSize = Math.ceil((HEADER_SIZE + chunkPayload.length) / 128) * 128;
      if (targetSize > MTU) {
        targetSize = MTU;
      }
      const paddingLen = targetSize - (HEADER_SIZE + chunkPayload.length);
      
      const packet = new Uint8Array(HEADER_SIZE + chunkPayload.length + paddingLen);
      const view = new DataView(packet.buffer);
      
      // Byte 0: Routing (0 = Media)
      view.setUint8(0, 0);
      // Byte 1: Media Type
      view.setUint8(1, mediaType);
      // Byte 2-5: Frame ID
      view.setUint32(2, frameId, true); // little-endian
      // Byte 6-7: Chunk Index
      view.setUint16(6, i, true);
      // Byte 8-9: Total Chunks
      view.setUint16(8, totalChunks, true);
      // Byte 10-21: IV
      packet.set(iv, 10);
      // Byte 22: Padding Length
      view.setUint8(22, paddingLen);
      // Byte 23+: Payload
      packet.set(chunkPayload, HEADER_SIZE);
      
      // Fill padding with random bytes
      if (paddingLen > 0) {
        const paddingBytes = new Uint8Array(paddingLen);
        crypto.getRandomValues(paddingBytes);
        packet.set(paddingBytes, HEADER_SIZE + chunkPayload.length);
      }
      
      // Obfuscate Header (Bytes 1 to 9, and 22) to hide from DPI
      for (let j = 1; j < 10; j++) {
        packet[j] ^= OBFUSCATION_MASK[j % OBFUSCATION_MASK.length];
      }
      packet[22] ^= OBFUSCATION_MASK[22 % OBFUSCATION_MASK.length];
      
      packets.push(packet);
    }
    
    self.postMessage({ type: 'ENCRYPTED_CHUNKS', payload: { frameId, packets } }, { transfer: packets.map(p => p.buffer) });
  }
  else if (type === 'DECRYPT') {
    if (!cryptoKey) return;
    const { packet } = payload; // Uint8Array
    
    if (packet.length < HEADER_SIZE) return;
    
    // De-obfuscate Header (Bytes 1 to 9, and 22)
    for (let j = 1; j < 10; j++) {
      packet[j] ^= OBFUSCATION_MASK[j % OBFUSCATION_MASK.length];
    }
    packet[22] ^= OBFUSCATION_MASK[22 % OBFUSCATION_MASK.length];
    
    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    const routing = view.getUint8(0);
    if (routing !== 0) return; // Not a media packet
    
    const mediaType = view.getUint8(1);
    const frameId = view.getUint32(2, true);
    const chunkIdx = view.getUint16(6, true);
    const totalChunks = view.getUint16(8, true);
    const paddingLen = view.getUint8(22);
    
    // Safety check for corrupted padding length
    if (packet.length - paddingLen < HEADER_SIZE) return;
    
    const iv = packet.slice(10, 22);
    
    // Extract payload, ignoring the padding at the end
    const chunkPayload = packet.slice(23, packet.length - paddingLen);
    
    if (!reassemblyBuffer.has(frameId)) {
      reassemblyBuffer.set(frameId, {
        totalChunks,
        receivedChunks: 0,
        chunks: new Array(totalChunks).fill(null),
        timestamp: Date.now(),
        mediaType,
        iv
      });
    }
    
    const frameData = reassemblyBuffer.get(frameId);
    if (!frameData.chunks[chunkIdx]) {
      frameData.chunks[chunkIdx] = chunkPayload;
      frameData.receivedChunks++;
    }
    
    if (frameData.receivedChunks === frameData.totalChunks) {
      // Reassemble
      const totalLength = frameData.chunks.reduce((acc: number, val: Uint8Array) => acc + val.length, 0);
      const encryptedFrame = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of frameData.chunks) {
        encryptedFrame.set(chunk, offset);
        offset += chunk.length;
      }
      
      reassemblyBuffer.delete(frameId);
      
      try {
        const decryptedBuffer = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: frameData.iv },
          cryptoKey,
          encryptedFrame
        );
        const decryptedData = new Uint8Array(decryptedBuffer);
        self.postMessage({ 
          type: 'DECRYPTED_FRAME', 
          payload: { frameId, mediaType: frameData.mediaType, data: decryptedData } 
        }, { transfer: [decryptedData.buffer] });
      } catch (e) {
        console.error("Decryption failed for frame", frameId);
      }
    }
    
    // Cleanup old frames (memory leak protection)
    const now = Date.now();
    for (const [id, data] of reassemblyBuffer.entries()) {
      if (now - data.timestamp > 2000) { // 2 seconds TTL
        reassemblyBuffer.delete(id);
      }
    }
  }
  else if (type === 'DESTROY') {
    cryptoKey = null;
    reassemblyBuffer.clear();
    self.postMessage({ type: 'DESTROYED' });
  }
};
