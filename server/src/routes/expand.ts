import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getReferences, batchGetPapers, S2Paper } from '../services/semanticScholar';
import { prisma } from '../lib/prisma';

const router = Router();

interface ExpandNode {
  id: string;
  title: string;
  abstract?: string;
  year?: number;
  authors: { name: string; authorId?: string }[];
  citationCount: number;
  influentialCitationCount: number;
  arxivId?: string;
  venue?: string;
  fieldsOfStudy?: string[];
  openAccessPdf?: string;
  tldr?: string;
  isSeed: boolean;
}

interface ExpandEdge {
  source: string;
  target: string;
  isInfluential: boolean;
}

function s2PaperToExpandNode(paper: S2Paper): ExpandNode {
  return {
    id: paper.paperId,
    title: paper.title,
    abstract: paper.abstract,
    year: paper.year,
    authors: paper.authors ?? [],
    citationCount: paper.citationCount ?? 0,
    influentialCitationCount: paper.influentialCitationCount ?? 0,
    arxivId: paper.externalIds?.ArXiv,
    venue: paper.publicationVenue?.name ?? undefined,
    fieldsOfStudy: paper.fieldsOfStudy ?? [],
    openAccessPdf: paper.openAccessPdf?.url,
    tldr: paper.tldr?.text,
    isSeed: false,
  };
}

async function upsertPaper(paper: S2Paper): Promise<void> {
  try {
    await prisma.paper.upsert({
      where: { s2PaperId: paper.paperId },
      update: {
        citationCount: paper.citationCount ?? 0,
        influentialCitationCount: paper.influentialCitationCount ?? 0,
        fetchedAt: new Date(),
      },
      create: {
        s2PaperId: paper.paperId,
        arxivId: paper.externalIds?.ArXiv ?? null,
        title: paper.title,
        abstract: paper.abstract ?? null,
        year: paper.year ?? null,
        authors: paper.authors ?? [],
        citationCount: paper.citationCount ?? 0,
        influentialCitationCount: paper.influentialCitationCount ?? 0,
        venue: paper.publicationVenue?.name ?? null,
        fieldsOfStudy: paper.fieldsOfStudy ?? [],
        externalIds: paper.externalIds ?? {},
        openAccessPdf: paper.openAccessPdf?.url ?? null,
        tldr: paper.tldr?.text ?? null,
        metadataJson: paper as any,
      },
    });
  } catch (err) {
    console.error('Failed to upsert paper:', err);
  }
}

// POST /api/graph/expand
router.post('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paperId, existingNodeIds } = req.body;

    if (!paperId || typeof paperId !== 'string') {
      res.status(400).json({ error: 'paperId is required' });
      return;
    }

    const existingIds = new Set<string>(Array.isArray(existingNodeIds) ? existingNodeIds : []);

    // Fetch references for the target node
    const refs = await getReferences(paperId, 20);

    // Only keep refs not already in the graph
    const newRefIds = refs
      .filter((r) => r.paperId && !existingIds.has(r.paperId))
      .map((r) => r.paperId);

    // Build edges — include all refs (to existing nodes too, they add connectivity)
    const newEdges: ExpandEdge[] = refs
      .filter((r) => r.paperId)
      .map((r) => ({
        source: paperId,
        target: r.paperId,
        isInfluential: r.isInfluential ?? false,
      }));

    // Batch fetch full metadata for new nodes only
    let newNodes: ExpandNode[] = [];
    if (newRefIds.length > 0) {
      const papers = await batchGetPapers(newRefIds);
      for (const paper of papers) {
        if (!paper?.paperId) continue;
        newNodes.push(s2PaperToExpandNode(paper));
        await upsertPaper(paper);
      }
    }

    res.json({ nodes: newNodes, edges: newEdges });
  } catch (err: any) {
    console.error('Expand error:', err?.message ?? err);
    res.status(500).json({ error: 'Failed to expand node' });
  }
});

export default router;
