import { create } from 'zustand';
import { stopLocalMedia } from '../services/media';

export type CallState = 'IDLE' | 'CALLING' | 'RINGING' | 'CONNECTED' | 'RECONNECTING';

export interface IncomingCall {
  from: string;
  roomId: string;
  isVideo: boolean;
  remotePublicKey: number[];
}

interface CallStore {
  state: CallState;
  remoteUserId: string | null;
  roomId: string | null;
  sharedSecret: Uint8Array | null;
  sas: string | null;
  localKeyPair: CryptoKeyPair | null;
  incomingCall: IncomingCall | null;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  localStream: MediaStream | null;
  
  // Actions
  setState: (newState: CallState) => void;
  setRemoteUser: (userId: string | null) => void;
  setCallDetails: (roomId: string, sharedSecret: Uint8Array, sas: string) => void;
  setLocalKeyPair: (keyPair: CryptoKeyPair) => void;
  setIncomingCall: (call: IncomingCall | null) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  teardown: () => void;
}

export const useCallStore = create<CallStore>((set, get) => ({
  state: 'IDLE',
  remoteUserId: null,
  roomId: null,
  sharedSecret: null,
  sas: null,
  localKeyPair: null,
  incomingCall: null,
  isAudioMuted: false,
  isVideoMuted: false,
  localStream: null,

  setState: (newState) => set({ state: newState }),
  setRemoteUser: (userId) => set({ remoteUserId: userId }),
  setCallDetails: (roomId, sharedSecret, sas) => set({ roomId, sharedSecret, sas }),
  setLocalKeyPair: (keyPair) => set({ localKeyPair: keyPair }),
  setIncomingCall: (call) => set({ incomingCall: call }),
  setLocalStream: (stream) => set({ localStream: stream }),
  
  toggleAudio: () => {
    const { localStream, isAudioMuted } = get();
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = isAudioMuted);
    }
    set({ isAudioMuted: !isAudioMuted });
  },
  
  toggleVideo: () => {
    const { localStream, isVideoMuted } = get();
    if (localStream) {
      localStream.getVideoTracks().forEach(t => t.enabled = isVideoMuted);
    }
    set({ isVideoMuted: !isVideoMuted });
  },
  
  teardown: () => {
    const { localStream } = get();
    stopLocalMedia(localStream);
    
    set({
      state: 'IDLE',
      remoteUserId: null,
      roomId: null,
      sharedSecret: null,
      sas: null,
      localKeyPair: null,
      incomingCall: null,
      isAudioMuted: false,
      isVideoMuted: false,
      localStream: null
    });
  }
}));
