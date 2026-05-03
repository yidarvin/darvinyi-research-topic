import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { decrypt } from '../lib/crypto';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

// GET /api/paper/:s2Id — get paper metadata + cached summary
router.get('/:s2Id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const s2Id = String(req.params.s2Id);
    const paper = await prisma.paper.findUnique({
      where: { s2PaperId: s2Id },
      include: { summary: true },
    });
    if (!paper) {
      res.status(404).json({ error: 'Paper not found' });
      return;
    }
    res.json(paper);
  } catch (err) {
    console.error('Paper fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch paper' });
  }
});

// POST /api/paper/:s2Id/summarize — AI summary via SSE streaming
router.post('/:s2Id/summarize', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const s2Id = String(req.params.s2Id);
    // Check for cached summary first
    const existing = await prisma.summary.findFirst({
      where: { paper: { s2PaperId: s2Id } },
    });
    if (existing) {
      res.json({ summary: existing.summaryText, cached: true });
      return;
    }

    // Get paper data
    const paper = await prisma.paper.findUnique({
      where: { s2PaperId: s2Id },
    });
    if (!paper) {
      res.status(404).json({ error: 'Paper not found in database. Load the graph first.' });
      return;
    }

    // Get user's Anthropic key
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user?.anthropicKeyEnc || !user?.anthropicKeyIv) {
      res.status(402).json({ error: 'Anthropic API key required. Add it in settings.' });
      return;
    }
    const apiKey = decrypt(user.anthropicKeyEnc, user.anthropicKeyIv);

    // Stream SSE response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const anthropic = new Anthropic({ apiKey });

    const prompt = `You are an expert research assistant. Summarize the following research paper clearly and concisely for an academic audience.

Title: ${paper.title}
Year: ${paper.year ?? 'Unknown'}
Authors: ${(paper.authors as any[]).map((a: any) => a.name).join(', ')}
Venue: ${paper.venue ?? 'Unknown'}
${paper.tldr ? `One-sentence summary: ${paper.tldr}` : ''}

Abstract:
${paper.abstract ?? 'No abstract available.'}

Please provide a structured summary with these sections:
1. **Core Contribution** — What is the main idea or innovation?
2. **Methods** — What approach or methodology was used?
3. **Key Findings** — What were the main results or conclusions?
4. **Limitations & Future Work** — What are the weaknesses or open questions?

Keep each section to 2-4 sentences. Be precise and use appropriate technical terminology.`;

    let fullSummary = '';

    try {
      const stream = await anthropic.messages.stream({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          const text = chunk.delta.text;
          fullSummary += text;
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      // Cache the summary
      await prisma.summary.create({
        data: {
          paper: { connect: { s2PaperId: s2Id } },
          summaryText: fullSummary,
          modelUsed: 'claude-3-5-sonnet-20241022',
        },
      });

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (claudeErr: any) {
      const errMsg = claudeErr?.message ?? 'Claude API error';
      res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
      res.end();
    }
  } catch (err) {
    console.error('Summarize error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to summarize paper' });
    }
  }
});

export default router;
