import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { buildCitationGraph } from '../services/graphBuilder';
import { prisma } from '../lib/prisma';

const router = Router();

// POST /api/graph/search — build a citation graph for a topic
router.post('/search', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { topic } = req.body;
    if (!topic || typeof topic !== 'string' || topic.trim().length < 2) {
      res.status(400).json({ error: 'Topic is required (min 2 chars)' });
      return;
    }

    const graph = await buildCitationGraph(topic.trim());
    res.json(graph);
  } catch (err: any) {
    const msg = err?.response?.data ?? err?.message ?? String(err);
    console.error('Graph search error:', msg);
    res.status(500).json({ error: 'Failed to build citation graph', detail: msg });
  }
});

// POST /api/graph/save — save a graph to user's account
router.post('/save', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { topic, graphJson } = req.body;
    if (!topic || !graphJson) {
      res.status(400).json({ error: 'topic and graphJson are required' });
      return;
    }

    const nodeCount = (graphJson.nodes ?? []).length;
    const edgeCount = (graphJson.edges ?? []).length;

    const saved = await prisma.savedGraph.create({
      data: {
        userId: req.userId!,
        topic,
        graphJson,
        nodeCount,
        edgeCount,
      },
    });

    res.status(201).json(saved);
  } catch (err) {
    console.error('Graph save error:', err);
    res.status(500).json({ error: 'Failed to save graph' });
  }
});

// GET /api/graph/list — list user's saved graphs
router.get('/list', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const graphs = await prisma.savedGraph.findMany({
      where: { userId: req.userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        topic: true,
        nodeCount: true,
        edgeCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(graphs);
  } catch (err) {
    console.error('Graph list error:', err);
    res.status(500).json({ error: 'Failed to fetch graphs' });
  }
});

// GET /api/graph/:id — load a specific saved graph
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const graph = await prisma.savedGraph.findFirst({
      where: { id, userId: req.userId },
    });
    if (!graph) {
      res.status(404).json({ error: 'Graph not found' });
      return;
    }
    res.json(graph);
  } catch (err) {
    console.error('Graph fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch graph' });
  }
});

// DELETE /api/graph/:id
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const graph = await prisma.savedGraph.findFirst({
      where: { id, userId: req.userId },
    });
    if (!graph) {
      res.status(404).json({ error: 'Graph not found' });
      return;
    }
    await prisma.savedGraph.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Graph delete error:', err);
    res.status(500).json({ error: 'Failed to delete graph' });
  }
});

export default router;
