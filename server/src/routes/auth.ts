import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { encrypt, decrypt } from '../lib/crypto';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

function signToken(userId: string): string {
  const secret = process.env.JWT_SECRET!;
  return jwt.sign({ userId }, secret, { expiresIn: '7d' });
}

// POST /api/auth/signup
router.post('/signup', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash },
    });

    const token = signToken(user.id);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, hasApiKey: false },
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signToken(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        hasApiKey: !!user.anthropicKeyEnc,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({
      user: {
        id: user.id,
        email: user.email,
        hasApiKey: !!user.anthropicKeyEnc,
      },
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/user/apikey — store encrypted Anthropic key
router.put('/apikey', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { apiKey } = req.body;
    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      res.status(400).json({ error: 'Invalid Anthropic API key format' });
      return;
    }

    const { encrypted, iv } = encrypt(apiKey);
    await prisma.user.update({
      where: { id: req.userId },
      data: { anthropicKeyEnc: encrypted, anthropicKeyIv: iv },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('API key update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/user/apikey
router.delete('/apikey', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.user.update({
      where: { id: req.userId },
      data: { anthropicKeyEnc: null, anthropicKeyIv: null },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('API key delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export function getUserAnthropicKey(userId: string): Promise<string | null> {
  return prisma.user
    .findUnique({ where: { id: userId } })
    .then((u) => {
      if (!u?.anthropicKeyEnc || !u?.anthropicKeyIv) return null;
      return decrypt(u.anthropicKeyEnc, u.anthropicKeyIv);
    });
}

export default router;
