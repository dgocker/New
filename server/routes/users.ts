import express from 'express';
import jwt from 'jsonwebtoken';
import { users } from './auth';
import { onlineUsers } from '../signaling';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

// Middleware to verify JWT
const authenticate = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.get('/', authenticate, (req: any, res) => {
  const currentUserId = req.user.id;
  
  const friendsList = Array.from(users.values())
    .filter(u => u.id !== currentUserId)
    .map(u => ({
      id: u.id,
      username: u.username,
      isOnline: onlineUsers.has(u.id)
    }));

  res.json(friendsList);
});

export default router;
