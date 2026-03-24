import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { joinRelayRoom } from './relay';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

// Store online users: userId -> socketId
export const onlineUsers = new Map<string, string>();
// Store socketId -> userId
export const socketToUser = new Map<string, string>();

export function setupSignaling(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      socket.data.user = decoded;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.user.id;
    onlineUsers.set(userId, socket.id);
    socketToUser.set(socket.id, userId);

    console.log(`User connected to signaling: ${userId}`);

    // Broadcast online status to everyone
    io.emit('user_status', { userId, status: 'online' });

    // Handle Call Invites
    socket.on('invite', ({ targetUserId, isVideo, roomId, publicKey }) => {
      const targetSocketId = onlineUsers.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('invite', { from: userId, isVideo, roomId, publicKey });
      }
    });

    // Handle Call Responses
    socket.on('invite_response', ({ targetUserId, accepted, roomId, publicKey }) => {
      const targetSocketId = onlineUsers.get(targetUserId);
      if (targetSocketId) {
        if (accepted) {
          // Both users join the relay room
          joinRelayRoom(userId, roomId);
          joinRelayRoom(targetUserId, roomId);
        }
        io.to(targetSocketId).emit('invite_response', { from: userId, accepted, roomId, publicKey });
      }
    });

    // Out-of-band media control channel (ping/pong, requestKeyframe, rotation, backpressure)
    socket.on('media_control', ({ targetUserId, type, payload }) => {
      const targetSocketId = onlineUsers.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('media_control', { from: userId, type, payload });
      }
    });

    socket.on('disconnect', () => {
      onlineUsers.delete(userId);
      socketToUser.delete(socket.id);
      io.emit('user_status', { userId, status: 'offline' });
      console.log(`User disconnected from signaling: ${userId}`);
    });
  });
}
