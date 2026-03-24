import React, { useEffect, useRef, useState } from 'react';
import { useCallStore } from '../store/callStore';
import { Button } from './ui/Button';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, SwitchCamera } from 'lucide-react';
import { getLocalMedia } from '../services/media';
import { callManager } from '../services/callManager';
import { getSocket } from '../services/socket';
import { e2eeService } from '../services/e2ee';

export function CallScreen() {
  const { 
    state, roomId, sharedSecret, sas, isAudioMuted, isVideoMuted, 
    toggleAudio, toggleVideo, teardown, setLocalStream, localStream,
    remoteUserId, incomingCall, setCallDetails, setState, setLocalKeyPair, localKeyPair
  } = useCallStore();
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Initialize local media
  useEffect(() => {
    let mounted = true;
    const initMedia = async () => {
      try {
        const stream = await getLocalMedia(true, true, facingMode);
        if (mounted) {
          setLocalStream(stream);
          setMediaError(null);
        } else {
          stream.getTracks().forEach(t => t.stop());
        }
      } catch (e: any) {
        console.error("Failed to get local media", e);
        if (mounted) {
          if (e.name === 'NotAllowedError') {
            setMediaError('Camera and microphone access was denied. Please allow permissions in your browser.');
          } else if (e.name === 'NotFoundError') {
            setMediaError('No camera or microphone found on this device.');
          } else if (e.name === 'NotReadableError') {
            setMediaError('Camera or microphone is already in use by another application.');
          } else {
            setMediaError('An unknown error occurred while accessing media devices.');
          }
        }
      }
    };
    if (!localStream) initMedia();

    // Bluetooth / Device Hot-Swapping
    const handleDeviceChange = async () => {
      console.log("Media devices changed, attempting to hot-swap...");
      try {
        const newStream = await getLocalMedia(true, true, facingMode);
        if (mounted) {
          setLocalStream(newStream);
          if (state === 'CONNECTED') {
            callManager.replaceTracks(newStream);
          }
        }
      } catch (e) {
        console.error("Hot-swap failed", e);
      }
    };

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);

    return () => { 
      mounted = false; 
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [state, facingMode]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Handle Signaling
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleInviteResponse = async (data: any) => {
      if (state !== 'CALLING') return;
      if (!data.accepted) {
        alert(`Call declined: ${data.reason || 'No reason'}`);
        teardown();
        return;
      }

      try {
        const remotePublicKey = await e2eeService.importPublicKey(data.publicKey);
        const secret = await e2eeService.deriveSharedSecret(localKeyPair!.privateKey, remotePublicKey);
        const generatedSas = e2eeService.generateSAS(secret);
        
        setCallDetails(data.roomId, secret, generatedSas);
        setState('CONNECTED');
      } catch (e) {
        console.error("Failed to establish E2EE", e);
        teardown();
      }
    };

    socket.on('invite_response', handleInviteResponse);
    
    const handleMediaControl = (data: any) => {
      if (data.type === 'end_call') {
        teardown();
      }
    };
    socket.on('media_control', handleMediaControl);
    
    // If we are the caller, initiate the call
    if (state === 'CALLING' && !isProcessing && remoteUserId) {
      setIsProcessing(true);
      const initiateCall = async () => {
        try {
          const keyPair = await e2eeService.generateKeyPair();
          setLocalKeyPair(keyPair);
          const pubKeyArray = await e2eeService.exportPublicKey(keyPair.publicKey);
          const newRoomId = `room_${Math.random().toString(36).substring(2, 10)}`;
          
          socket.emit('invite', {
            targetUserId: remoteUserId,
            isVideo: true,
            roomId: newRoomId,
            publicKey: pubKeyArray
          });
        } catch (e) {
          console.error("Failed to initiate call", e);
          teardown();
        }
      };
      initiateCall();
    }

    return () => {
      socket.off('invite_response', handleInviteResponse);
      socket.off('media_control', handleMediaControl);
    };
  }, [state, remoteUserId, localKeyPair, isProcessing]);

  // Start CallManager when connected
  useEffect(() => {
    if (state === 'CONNECTED' && localStream && roomId && sharedSecret) {
      callManager.start(roomId, sharedSecret, localStream);
    }
    return () => {
      if (state === 'CONNECTED') {
        callManager.stop();
      }
    };
  }, [state, localStream, roomId, sharedSecret]);

  // Background Mode Handling
  useEffect(() => {
    const handleVisibilityChange = () => {
      const { localStream, isVideoMuted } = useCallStore.getState();
      if (!localStream) return;
      
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        if (document.hidden) {
          // Pause video transmission (send black frames)
          videoTrack.enabled = false;
        } else {
          // Resume video transmission if not explicitly muted
          videoTrack.enabled = !isVideoMuted;
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Expose a way to render frames
  useEffect(() => {
    const handleRemoteFrame = (frame: VideoFrame) => {
      const canvas = remoteCanvasRef.current;
      if (!canvas) {
        frame.close();
        return;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
          canvas.width = frame.displayWidth;
          canvas.height = frame.displayHeight;
        }
        ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
      }
      frame.close(); // Crucial for memory management
    };

    (window as any).renderRemoteFrame = handleRemoteFrame;
    return () => { delete (window as any).renderRemoteFrame; };
  }, []);

  const handleAccept = async () => {
    if (!incomingCall || isProcessing) return;
    setIsProcessing(true);
    const socket = getSocket();
    
    try {
      const keyPair = await e2eeService.generateKeyPair();
      setLocalKeyPair(keyPair);
      const pubKeyArray = await e2eeService.exportPublicKey(keyPair.publicKey);
      
      const remotePublicKey = await e2eeService.importPublicKey(incomingCall.remotePublicKey);
      const secret = await e2eeService.deriveSharedSecret(keyPair.privateKey, remotePublicKey);
      const generatedSas = e2eeService.generateSAS(secret);

      socket?.emit('invite_response', {
        targetUserId: incomingCall.from,
        accepted: true,
        roomId: incomingCall.roomId,
        publicKey: pubKeyArray
      });

      setCallDetails(incomingCall.roomId, secret, generatedSas);
      setState('CONNECTED');
    } catch (e) {
      console.error("Failed to accept call", e);
      teardown();
    }
  };

  const handleReject = () => {
    if (!incomingCall) return;
    const socket = getSocket();
    socket?.emit('invite_response', {
      targetUserId: incomingCall.from,
      accepted: false,
      roomId: incomingCall.roomId,
      reason: 'declined'
    });
    teardown();
  };

  const handleSwitchCamera = async () => {
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);
    
    try {
      const newStream = await getLocalMedia(true, true, newFacingMode);
      setLocalStream(newStream);
      if (state === 'CONNECTED') {
        callManager.replaceTracks(newStream);
      }
    } catch (e) {
      console.error("Failed to switch camera", e);
      // Revert state if failed
      setFacingMode(facingMode);
    }
  };

  if (state === 'RINGING') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 text-white">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-zinc-800">
            <Phone className="h-10 w-10 animate-pulse text-zinc-400" />
          </div>
          <h2 className="text-2xl font-bold">Incoming Call</h2>
          <p className="text-zinc-400">from {incomingCall?.from}</p>
        </div>
        <div className="flex gap-6">
          <Button variant="destructive" size="icon" className="h-16 w-16 rounded-full" onClick={handleReject} disabled={isProcessing}>
            <PhoneOff className="h-7 w-7" />
          </Button>
          <Button variant="default" size="icon" className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600" onClick={handleAccept} disabled={isProcessing}>
            <Phone className="h-7 w-7" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 text-white">
      {/* Video Area */}
      <div className="relative flex-1">
        {/* Remote Video Canvas */}
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
          <canvas 
            ref={remoteCanvasRef} 
            className="h-full w-full object-contain"
          />
          {state === 'CALLING' && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 backdrop-blur-sm">
              <span className="text-zinc-400 font-medium">Calling...</span>
            </div>
          )}
        </div>
        
        {/* Local Video PiP */}
        <div className="absolute bottom-24 right-4 h-48 w-32 overflow-hidden rounded-xl bg-zinc-800 shadow-lg">
          {mediaError ? (
            <div className="flex h-full w-full items-center justify-center bg-red-900/50 p-2 text-center text-xs text-red-200">
              {mediaError}
            </div>
          ) : (
            <video 
              ref={localVideoRef}
              autoPlay 
              playsInline 
              muted 
              className={`h-full w-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
            />
          )}
          {isVideoMuted && !mediaError && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 backdrop-blur-sm">
              <VideoOff className="h-6 w-6 text-zinc-500" />
            </div>
          )}
        </div>

        {/* SAS Display */}
        {state === 'CONNECTED' && sas && (
          <div className="absolute left-4 top-4 rounded-lg bg-black/50 px-3 py-1.5 text-lg tracking-widest backdrop-blur-md">
            {sas}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex h-24 items-center justify-center gap-4 sm:gap-6 bg-zinc-950/80 pb-6 pt-4 backdrop-blur-md">
        <Button 
          variant={isAudioMuted ? "destructive" : "secondary"} 
          size="icon" 
          className="h-12 w-12 sm:h-14 sm:w-14 rounded-full"
          onClick={toggleAudio}
        >
          {isAudioMuted ? <MicOff className="h-5 w-5 sm:h-6 sm:w-6" /> : <Mic className="h-5 w-5 sm:h-6 sm:w-6" />}
        </Button>
        
        <Button 
          variant="secondary" 
          size="icon" 
          className="h-12 w-12 sm:h-14 sm:w-14 rounded-full"
          onClick={handleSwitchCamera}
        >
          <SwitchCamera className="h-5 w-5 sm:h-6 sm:w-6" />
        </Button>

        <Button 
          variant="destructive" 
          size="icon" 
          className="h-14 w-14 sm:h-16 sm:w-16 rounded-full"
          onClick={() => {
            // Send end call signal
            if (remoteUserId) {
              getSocket()?.emit('media_control', { targetUserId: remoteUserId, type: 'end_call' });
            }
            teardown();
          }}
        >
          <PhoneOff className="h-6 w-6 sm:h-7 sm:w-7" />
        </Button>

        <Button 
          variant={isVideoMuted ? "destructive" : "secondary"} 
          size="icon" 
          className="h-12 w-12 sm:h-14 sm:w-14 rounded-full"
          onClick={toggleVideo}
        >
          {isVideoMuted ? <VideoOff className="h-5 w-5 sm:h-6 sm:w-6" /> : <Video className="h-5 w-5 sm:h-6 sm:w-6" />}
        </Button>
      </div>
    </div>
  );
}
