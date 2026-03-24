import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

// In-memory DB for Phase 1
export const users = new Map<string, any>();
export const invites = new Set<string>();

// Generate initial invite for testing
invites.add('admin-invite-123');

router.post('/register', async (req, res) => {
  const { username, password, inviteCode } = req.body;

  if (!username || !password || !inviteCode) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!invites.has(inviteCode)) {
    return res.status(403).json({ error: 'Invalid or expired invite code' });
  }

  if (Array.from(users.values()).some(u => u.username === username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  // Consume invite
  invites.delete(inviteCode);

  const hashedPassword = await bcrypt.hash(password, 10);
  const id = Math.random().toString(36).substring(7);
  
  const user = { id, username, password: hashedPassword };
  users.set(id, user);

  const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id, username } });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const user = Array.from(users.values()).find(u => u.username === username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username } });
});

export default router;
