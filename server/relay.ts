import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import http from 'http';
import net from 'net';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

interface RelayClient {
  ws: WebSocket;
  userId: string;
  roomId: string | null;
  burstTokens: number;
  lastTokenUpdate: number;
}

const clients = new Map<string, RelayClient>();
const rooms = new Map<string, Set<string>>();

// Burst Protection: ~2.5 Mbps fill rate, 500 KB max burst
const BURST_RATE_LIMIT = 2.5 * 1024 * 1024 / 8; 
const MAX_BURST_TOKENS = 500 * 1024; 

export function setupSecureRelay(server: http.Server) {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : '';
    
    if (pathname === '/secure-relay') {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const token = url.searchParams.get('token');
      
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        (socket as net.Socket).setNoDelay(true); // OS level optimization
        
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request, decoded.id);
        });
      } catch (e) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    }
  });

  wss.on('connection', (ws: WebSocket, request: http.IncomingMessage, userId: string) => {
    console.log(`User connected to secure relay: ${userId}`);
    
    const client: RelayClient = {
      ws,
      userId,
      roomId: null,
      burstTokens: MAX_BURST_TOKENS,
      lastTokenUpdate: Date.now()
    };
    clients.set(userId, client);

    ws.on('message', (message: Buffer, isBinary: boolean) => {
      if (!isBinary) return;

      const now = Date.now();
      const dt = (now - client.lastTokenUpdate) / 1000;
      client.burstTokens = Math.min(MAX_BURST_TOKENS, client.burstTokens + dt * BURST_RATE_LIMIT);
      client.lastTokenUpdate = now;

      const byte0 = message[0];
      const isTelemetry = byte0 === 255; // Priority Feedback Channel

      // Burst Protection (Bypass for telemetry)
      if (!isTelemetry) {
        if (client.burstTokens < message.length) {
          // Drop packet due to burst limit (prevent starting storm)
          return;
        }
        client.burstTokens -= message.length;
      }

      // Routing
      if (!client.roomId) return;
      const room = rooms.get(client.roomId);
      if (!room) return;

      for (const peerId of room) {
        if (peerId !== userId) {
          const peer = clients.get(peerId);
          if (peer && peer.ws.readyState === WebSocket.OPEN) {
            
            // Backpressure monitoring
            if (peer.ws.bufferedAmount > 5 * 1024 * 1024) {
              // Hard drop (OOM protection)
              continue;
            } else if (peer.ws.bufferedAmount > 400 * 1024) {
              // Send backpressure signal to sender via WS (or signaling)
              // For now, we drop if it's getting too high, but we should ideally notify
              // We'll implement the media_control backpressure notification in the signaling channel
            }

            // Zero-Delay Routing: send immediately
            peer.ws.send(message, { binary: true });
          }
        }
      }
    });

    ws.on('close', () => {
      console.log(`User disconnected from secure relay: ${userId}`);
      clients.delete(userId);
      if (client.roomId) {
        const room = rooms.get(client.roomId);
        if (room) {
          room.delete(userId);
          if (room.size === 0) rooms.delete(client.roomId);
        }
      }
    });
  });
}

export function joinRelayRoom(userId: string, roomId: string) {
  const client = clients.get(userId);
  if (client) {
    client.roomId = roomId;
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId)!.add(userId);
  }
}
