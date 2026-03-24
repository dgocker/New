import express from 'express';
import jwt from 'jsonwebtoken';
import { invites } from './auth';

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

router.post('/generate', authenticate, (req, res) => {
  // In a real app, we would check if the user is allowed to generate invites
  // and ensure they haven't exceeded their limit.
  const code = Math.random().toString(36).substring(2, 10);
  invites.add(code);
  res.json({ code });
});

export default router;
