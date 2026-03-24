import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

let socket: Socket | null = null;

export const getSocket = () => {
  if (!socket) {
    const token = useAuthStore.getState().token;
    if (!token) return null;
    
    socket = io({
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('Connected to signaling server');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from signaling server');
    });
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
