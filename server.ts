import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import path from 'path';
import net from 'net';

import authRoutes from './server/routes/auth';
import inviteRoutes from './server/routes/invites';
import usersRoutes from './server/routes/users';
import { setupSignaling } from './server/signaling';
import { setupSecureRelay } from './server/relay';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  
  app.use('/api/auth', authRoutes);
  app.use('/api/invites', inviteRoutes);
  app.use('/api/users', usersRoutes);

  // Socket.io Signaling Server
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });
  setupSignaling(io);

  // Raw WebSocket Secure Relay
  setupSecureRelay(server);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
