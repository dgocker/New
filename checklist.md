# Checklist

## Phase 1: UI/UX & Auth (Block 1)
- [x] Mobile-First React UI with gesture support
- [x] Login/Password Auth (JWT, hashing, brute-force protection)
- [x] Closed registration via unique invite links (one-time use, sequential generation)
- [x] Main page: Real-time Online/Offline status via Socket.io
- [x] Audio/Video call buttons for online users
- [x] Call Interface: Video (PiP) and Audio-only modes
- [x] Universal controls (Mute, Camera toggle, Switch camera, End call)
- [x] Page Visibility API handling (background mode)

## Phase 2: State Machine & Collisions (Block 1.1)
- [x] Strict FSM (IDLE, CALLING, RINGING, CONNECTED, RECONNECTING)
- [x] Busy State handling (auto-reject invites if not IDLE)
- [x] Button protection (Debounce & Lock during transitions)
- [x] Guaranteed Teardown (reset to IDLE, clear timeouts, close tracks, unlock UI)

## Phase 3: Signaling & Relay (Block 2)
- [x] Socket.io Signaling Server (Session management, JWT validation)
- [x] Isolated Rooms & ECDH key exchange
- [x] SAS (Short Authentication String) mechanism (4 emojis/digits)
- [x] `media_control` channel (ping/pong, requestKeyframe, rotation, backpressure)
- [x] Raw WebSocket Secure Relay (`/secure-relay`, no perMessageDeflate, setNoDelay)
- [x] Burst Protection on Relay
- [x] Routing & Backpressure (Byte 0 routing, bufferedAmount monitoring)
- [x] Priority Feedback Channel (Byte marker 255 for ReceiverReport, Zero-Delay Routing)

## Phase 4: Capture & WebCodecs (Block 3)
- [x] Video Capture (getUserMedia -> hidden `<video>` -> `VideoFrame` via rAF/timer)
- [x] Hardware VideoEncoder (`avc1.42e01f`, `annexb`)
- [x] Resolution Hysteresis & Limits (240p to 720p)
- [ ] Safe Watchdog (recreate encoder if no frames for 3s)
- [x] Dynamic Reconfiguration (ABR integration, on-the-fly config)
- [x] Synchronous KeyFrame request on resolution change

## Phase 5: Cryptography & Obfuscation (Block 4)
- [x] Web Worker for AES-GCM encryption
- [x] Obfuscation & Fragmentation (800-1180 byte chunks, 0-64 byte padding)
- [x] Binary Header Structure (Type, frameId, senderTs, Checksum)

## Phase 6: Congestion Control, BWE, ABR, Pacer (Block 5)
- [x] Two-way Secure BWE (transportSeqNum, sendTs, ReceiverReport via media_control)
- [x] Custom GCC in Web Worker (Delay-based & Loss-based controllers, Slow Start)
- [x] Dynamic Channel Reservation (Audio quota, Overhead, Network Ceiling ~2.3 Mbps)
- [x] ABR Module (Hysteresis, Resolution Scaling, Backpressure sync, Audio-Fallback)
- [x] Advanced Pacer (Timer-based, Debt System, Smart Drop P-frames + requestKeyframe)

## Phase 7: Decoding & Jitter Buffer (Block 6)
- [x] Chunk Assembly & Decryption
- [x] Hardware VideoDecoder (`annexb`, Canvas rendering with transforms)
- [x] Jitter Buffer & A/V Sync (Master Clock = AudioContext.currentTime, Clock Skew Compensation)
- [ ] Catch-up logic (time jump, requestKeyframe on crash)

## Phase 8: Audio Processing (Block 7)
- [x] Audio Sender (AudioContext, AudioWorklet/ScriptProcessor, Opus AudioEncoder, AES-GCM, Padding)
- [x] Transport Priority (Audio ignores video buffer limits)
- [x] Mute function (send encrypted silence)
- [x] Audio Receiver (Decryption, AudioDecoder, audioJitterBuffer, seamless playback)

## Phase 9: Lifecycle, Reconnects & Edge Cases (Block 8 & 8.1)
- [x] Reconnects (Inject new WS reference without full reload)
- [x] Resource Cleanup (`.destroy()`, close AudioContext)
- [x] Perfect Forward Secrecy (Destroy crypto key)
- [x] Background Mode (Pause video encoding, send `video_muted`, keep audio/WS active)
- [x] Seamless Handover (SessionID, Flush queues, request I-frame)
- [x] Deep Hardware Cleanup (`VideoEncoder.close()`, `VideoDecoder.close()`)
- [x] Graceful Degradation (NotAllowedError, NotReadableError handling)
- [x] Bluetooth Hot-Swapping (ondevicechange, hot track injection)
- [x] Strict Garbage Collection (`frame.close()` in `finally`)
- [x] Timer Isolation (Web Worker Pacer or AudioContext hack)
