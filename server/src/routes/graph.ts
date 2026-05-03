import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { buildCitationGraph } from '../services/graphBuilder';
import { getReferences, batchGetPapers, S2Paper } from '../services/semanticScholar';
import { prisma } from '../lib/prisma';

// ── Expand helpers ──
interface ExpandNode {
  id: string; title: string; abstract?: string; year?: number;
  authors: { name: string; authorId?: string }[];
  citationCount: number; influentialCitationCount: number;
  arxivId?: string; venue?: string; fieldsOfStudy?: string[];
  openAccessPdf?: string; tldr?: string; isSeed: boolean;
}

function s2ToExpandNode(paper: S2Paper): ExpandNode {
  return {
    id: paper.paperId, title: paper.title, abstract: paper.abstract,
    year: paper.year, authors: paper.authors ?? [],
    citationCount: paper.citationCount ?? 0,
    influentialCitationCount: paper.influentialCitationCount ?? 0,
    arxivId: paper.externalIds?.ArXiv,
    venue: paper.publicationVenue?.name ?? undefined,
    fieldsOfStudy: paper.fieldsOfStudy ?? [],
    openAccessPdf: paper.openAccessPdf?.url,
    tldr: paper.tldr?.text, isSeed: false,
  };
}

async function upsertExpandPaper(paper: S2Paper): Promise<void> {
  try {
    await prisma.paper.upsert({
      where: { s2PaperId: paper.paperId },
      update: { citationCount: paper.citationCount ?? 0, influentialCitationCount: paper.influentialCitationCount ?? 0, fetchedAt: new Date() },
      create: {
        s2PaperId: paper.paperId, arxivId: paper.externalIds?.ArXiv ?? null,
        title: paper.title, abstract: paper.abstract ?? null, year: paper.year ?? null,
        authors: paper.authors ?? [], citationCount: paper.citationCount ?? 0,
        influentialCitationCount: paper.influentialCitationCount ?? 0,
        venue: paper.publicationVenue?.name ?? null, fieldsOfStudy: paper.fieldsOfStudy ?? [],
        externalIds: paper.externalIds ?? {}, openAccessPdf: paper.openAccessPdf?.url ?? null,
        tldr: paper.tldr?.text ?? null, metadataJson: paper as any,
      },
    });
  } catch (err) { console.error('Failed to upsert paper:', err); }
}

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

// POST /api/graph/expand — fetch references for a node and return new nodes/edges
router.post('/expand', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paperId, existingNodeIds } = req.body;
    if (!paperId || typeof paperId !== 'string') {
      res.status(400).json({ error: 'paperId is required' });
      return;
    }

    const existingIds = new Set<string>(Array.isArray(existingNodeIds) ? existingNodeIds : []);
    const refs = await getReferences(paperId, 20);

    const newRefIds = refs
      .filter((r) => r.paperId && !existingIds.has(r.paperId))
      .map((r) => r.paperId);

    // All edges from expanded node (including to already-existing nodes for connectivity)
    const newEdges = refs
      .filter((r) => r.paperId)
      .map((r) => ({ source: paperId, target: r.paperId, isInfluential: r.isInfluential ?? false }));

    let newNodes: ExpandNode[] = [];
    if (newRefIds.length > 0) {
      const papers = await batchGetPapers(newRefIds);
      for (const paper of papers) {
        if (!paper?.paperId) continue;
        newNodes.push(s2ToExpandNode(paper));
        await upsertExpandPaper(paper);
      }
    }

    console.log(`Expand ${paperId}: ${newNodes.length} new nodes, ${newEdges.length} edges`);
    res.json({ nodes: newNodes, edges: newEdges });
  } catch (err: any) {
    console.error('Expand error:', err?.message ?? err);
    res.status(500).json({ error: 'Failed to expand node' });
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
