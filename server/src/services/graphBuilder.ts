import {
  searchPapers,
  getPaper,
  getReferences,
  batchGetPapers,
  S2Paper,
} from './semanticScholar';
import { searchArxiv } from './arxiv';
import { prisma } from '../lib/prisma';

export interface GraphNode {
  id: string; // s2 paperId
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
  isSeed: boolean; // is this a top-level search result
}

export interface GraphEdge {
  source: string; // paperId that cites
  target: string; // paperId being cited
  isInfluential: boolean;
}

export interface CitationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  topic: string;
  generatedAt: string;
}

function s2PaperToNode(paper: S2Paper, isSeed: boolean): GraphNode {
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
    isSeed,
  };
}

async function upsertPaperToDb(paper: S2Paper): Promise<void> {
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
    // Non-critical: log and continue
    console.error('Failed to upsert paper to DB:', err);
  }
}

export async function buildCitationGraph(topic: string): Promise<CitationGraph> {
  const nodeMap = new Map<string, GraphNode>();
  const edgeSet = new Set<string>(); // "source->target"
  const edges: GraphEdge[] = [];

  // ── Step 1: Search Semantic Scholar for top papers ──
  const s2Results = await searchPapers(topic, 10);

  // ── Step 2: Search arXiv and cross-reference ──
  const arxivResults = await searchArxiv(topic, 10);

  // Get arXiv papers that aren't already in S2 results
  const s2ArxivIds = new Set(s2Results.map((p) => p.externalIds?.ArXiv).filter(Boolean));
  const newArxivIds = arxivResults
    .map((p) => p.arxivId)
    .filter((id) => !s2ArxivIds.has(id))
    .slice(0, 5);

  // Fetch S2 data for arXiv-only papers
  const arxivS2Papers =
    newArxivIds.length > 0
      ? await batchGetPapers(newArxivIds.map((id) => `ArXiv:${id}`))
      : [];

  // Combine seed papers (deduplicated)
  const allSeedPapers = [...s2Results, ...arxivS2Papers];
  const seedPaperIds = new Set<string>();

  for (const paper of allSeedPapers) {
    if (!paper?.paperId || seedPaperIds.has(paper.paperId)) continue;
    seedPaperIds.add(paper.paperId);
    nodeMap.set(paper.paperId, s2PaperToNode(paper, true));
    await upsertPaperToDb(paper);
  }

  // ── Step 3: Fetch references for each seed paper (1 hop) ──
  const refPaperIds = new Set<string>();

  for (const paperId of seedPaperIds) {
    try {
      const refs = await getReferences(paperId, 20);
      for (const ref of refs) {
        if (!ref.paperId) continue;

        // Add edge: seed → reference
        const edgeKey = `${paperId}->${ref.paperId}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            source: paperId,
            target: ref.paperId,
            isInfluential: ref.isInfluential ?? false,
          });
        }

        // Track reference nodes to fetch full data
        if (!nodeMap.has(ref.paperId)) {
          refPaperIds.add(ref.paperId);
        }
      }
    } catch (err) {
      console.error(`Failed to get references for ${paperId}:`, err);
    }
  }

  // ── Step 4: Batch fetch full data for referenced papers ──
  // Prioritize by citation count (we already have partial data from refs endpoint)
  const refIds = Array.from(refPaperIds).slice(0, 40); // cap at 40 reference nodes
  if (refIds.length > 0) {
    const refPapers = await batchGetPapers(refIds);
    for (const paper of refPapers) {
      if (!paper?.paperId) continue;
      nodeMap.set(paper.paperId, s2PaperToNode(paper, false));
      await upsertPaperToDb(paper);
    }
  }

  // ── Step 5: Filter edges to only include nodes we have ──
  const validEdges = edges.filter(
    (e) => nodeMap.has(e.source) && nodeMap.has(e.target)
  );

  // ── Step 6: Remove isolated reference nodes (no edges) ──
  const connectedNodeIds = new Set<string>();
  for (const edge of validEdges) {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  }
  // Always keep seed nodes
  for (const id of seedPaperIds) connectedNodeIds.add(id);

  const finalNodes = Array.from(nodeMap.values()).filter((n) =>
    connectedNodeIds.has(n.id)
  );

  return {
    nodes: finalNodes,
    edges: validEdges,
    topic,
    generatedAt: new Date().toISOString(),
  };
}
