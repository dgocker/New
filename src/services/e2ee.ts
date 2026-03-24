export const e2eeService = {
  async generateKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits', 'deriveKey']
    );
  },

  async exportPublicKey(key: CryptoKey): Promise<number[]> {
    const exported = await crypto.subtle.exportKey('raw', key);
    return Array.from(new Uint8Array(exported));
  },

  async importPublicKey(keyArray: number[]): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
      'raw',
      new Uint8Array(keyArray),
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );
  },

  async deriveSharedSecret(privateKey: CryptoKey, publicKey: CryptoKey): Promise<Uint8Array> {
    const bits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: publicKey },
      privateKey,
      256
    );
    return new Uint8Array(bits);
  },

  generateSAS(sharedSecret: Uint8Array): string {
    const emojis = [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵",
      "🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋",
      "🐌","🐞","🐜","🦟","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡",
      "🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧","🐘","🦛","🦏",
      "🐪","🐫","🦒","🦘","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕",
      "🐩","🦮","🐕‍🦺","🐈","🐈‍⬛","🐓","🦃","🦚","🦜","🦢","🦩","🕊️","🐇","🦝","🦨",
      "🦡","🦦","🦥","🐁","🐀","🐿️","🦔"
    ];
    
    // Use the first 4 bytes of the shared secret to pick 4 emojis
    const view = new DataView(sharedSecret.buffer, sharedSecret.byteOffset, sharedSecret.byteLength);
    let num = view.getUint32(0, true);
    
    let sas = "";
    for(let i = 0; i < 4; i++) {
      sas += emojis[num % emojis.length];
      num = Math.floor(num / emojis.length);
    }
    return sas;
  }
};
