import {
  searchPapers,
  searchPapersBycitations,
  getReferences,
  S2Paper,
} from './semanticScholar';
import { prisma } from '../lib/prisma';

export interface GraphNode {
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

export interface GraphEdge {
  source: string;
  target: string;
  isInfluential: boolean;
}

export interface CitationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  topic: string;
  generatedAt: string;
}

function s2PaperToNode(paper: S2Paper): GraphNode {
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
    isSeed: true,
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
    console.error('Failed to upsert paper to DB:', err);
  }
}

export async function buildCitationGraph(topic: string): Promise<CitationGraph> {
  // ── Step 1: Fetch up to 50 papers via two passes ──
  // Pass A: relevance-ranked (best semantic match for the query), up to 25
  // Pass B: most-cited papers for the query (bulk endpoint, sorted by citationCount desc), up to 25
  // Together they give a good mix of canonical foundational papers + recent relevant work.
  const passA = await searchPapers(topic, 25);
  const passB = await searchPapersBycitations(topic, 25);

  // Deduplicate by paperId, keeping up to 50
  const seen = new Set<string>();
  const allPapers: S2Paper[] = [];
  for (const paper of [...passA, ...passB]) {
    if (!paper?.paperId || seen.has(paper.paperId)) continue;
    seen.add(paper.paperId);
    allPapers.push(paper);
    if (allPapers.length >= 50) break;
  }

  // ── Step 2: Upsert all papers to DB and build node map ──
  const seedIds = new Set<string>(allPapers.map((p) => p.paperId));
  const nodes: GraphNode[] = [];

  for (const paper of allPapers) {
    nodes.push(s2PaperToNode(paper));
    await upsertPaperToDb(paper);
  }

  // ── Step 3: Discover edges between seed papers ──
  // For each seed, fetch its references. Only keep edges where BOTH
  // source and target are in the seed set (no new nodes added here).
  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];

  for (const paper of allPapers) {
    try {
      const refs = await getReferences(paper.paperId, 50);
      for (const ref of refs) {
        if (!ref.paperId || !seedIds.has(ref.paperId)) continue;
        const key = `${paper.paperId}->${ref.paperId}`;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        edges.push({
          source: paper.paperId,
          target: ref.paperId,
          isInfluential: ref.isInfluential ?? false,
        });
      }
    } catch (err) {
      console.error(`Failed to get references for ${paper.paperId}:`, err);
    }
  }

  console.log(`Graph built: ${nodes.length} nodes, ${edges.length} intra-set edges`);

  return {
    nodes,
    edges,
    topic,
    generatedAt: new Date().toISOString(),
  };
}
