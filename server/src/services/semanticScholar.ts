import axios from 'axios';

const BASE_URL = 'https://api.semanticscholar.org/graph/v1';
const API_KEY = process.env.SEMANTIC_SCHOLAR_API_KEY;

const PAPER_FIELDS =
  'paperId,title,abstract,year,authors,citationCount,influentialCitationCount,referenceCount,externalIds,isOpenAccess,openAccessPdf,tldr,publicationDate,publicationVenue,fieldsOfStudy';

const s2 = axios.create({
  baseURL: BASE_URL,
  headers: API_KEY ? { 'x-api-key': API_KEY } : {},
  timeout: 15000,
});

// Rate limit: 1 req/sec without key, higher with key
let lastRequest = 0;
async function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  const delay = API_KEY ? 200 : 1100; // ms between requests
  const now = Date.now();
  const wait = delay - (now - lastRequest);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  return fn();
}

export interface S2Paper {
  paperId: string;
  title: string;
  abstract?: string;
  year?: number;
  authors: { authorId?: string; name: string }[];
  citationCount: number;
  influentialCitationCount: number;
  referenceCount: number;
  externalIds?: Record<string, string>;
  isOpenAccess?: boolean;
  openAccessPdf?: { url: string; status: string };
  tldr?: { text: string };
  publicationDate?: string;
  publicationVenue?: { name: string };
  fieldsOfStudy?: string[];
}

export interface S2CitationEdge {
  paperId: string;
  title: string;
  year?: number;
  citationCount: number;
  isInfluential?: boolean;
}

export async function searchPapers(query: string, limit = 20): Promise<S2Paper[]> {
  return rateLimited(async () => {
    const res = await s2.get('/paper/search', {
      params: { query, fields: PAPER_FIELDS, limit },
    });
    return (res.data.data ?? []) as S2Paper[];
  });
}

export async function getPaper(paperId: string): Promise<S2Paper | null> {
  return rateLimited(async () => {
    try {
      const res = await s2.get(`/paper/${paperId}`, {
        params: { fields: PAPER_FIELDS },
      });
      return res.data as S2Paper;
    } catch (err: any) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  });
}

export async function getReferences(paperId: string, limit = 50): Promise<S2CitationEdge[]> {
  return rateLimited(async () => {
    const res = await s2.get(`/paper/${paperId}/references`, {
      params: {
        fields: 'paperId,title,year,citationCount,isInfluential',
        limit,
      },
    });
    return (res.data.data ?? []).map((d: any) => ({
      ...d.citedPaper,
      isInfluential: d.isInfluential,
    })) as S2CitationEdge[];
  });
}

export async function getCitations(paperId: string, limit = 30): Promise<S2CitationEdge[]> {
  return rateLimited(async () => {
    const res = await s2.get(`/paper/${paperId}/citations`, {
      params: {
        fields: 'paperId,title,year,citationCount,isInfluential',
        limit,
      },
    });
    return (res.data.data ?? []).map((d: any) => ({
      ...d.citingPaper,
      isInfluential: d.isInfluential,
    })) as S2CitationEdge[];
  });
}

export async function batchGetPapers(paperIds: string[]): Promise<S2Paper[]> {
  if (paperIds.length === 0) return [];
  // Max 500 per batch request
  const chunks: string[][] = [];
  for (let i = 0; i < paperIds.length; i += 500) {
    chunks.push(paperIds.slice(i, i + 500));
  }
  const results: S2Paper[] = [];
  for (const chunk of chunks) {
    const res = await rateLimited(() =>
      s2.post('/paper/batch', { ids: chunk }, { params: { fields: PAPER_FIELDS } })
    );
    results.push(...((res.data ?? []).filter(Boolean) as S2Paper[]));
  }
  return results;
}
