import axios, { AxiosError } from 'axios';

const BASE_URL = 'https://api.semanticscholar.org/graph/v1';
const API_KEY = process.env.SEMANTIC_SCHOLAR_API_KEY;

const PAPER_FIELDS =
  'paperId,title,abstract,year,authors,citationCount,influentialCitationCount,referenceCount,externalIds,isOpenAccess,openAccessPdf,tldr,publicationDate,publicationVenue,fieldsOfStudy';

// Bulk search endpoint supports a reduced field set (no tldr, no openAccessPdf)
const BULK_PAPER_FIELDS =
  'paperId,title,abstract,year,authors,citationCount,influentialCitationCount,referenceCount,externalIds,isOpenAccess,publicationDate,publicationVenue,fieldsOfStudy';

const s2 = axios.create({
  baseURL: BASE_URL,
  headers: API_KEY ? { 'x-api-key': API_KEY } : {},
  timeout: 20000,
});

// Strict 1 req/sec queue — one request completes before the next is allowed
// Using a promise chain so concurrent callers queue up properly
let requestQueue: Promise<unknown> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  // Each call chains onto the previous, enforcing sequential execution with delay
  const result = requestQueue.then(async () => {
    const res = await fn();
    // Wait 1.1 sec after each request regardless of API key status
    // (S2 free tier is 1 req/sec; with a key it's higher but we stay safe)
    await sleep(API_KEY ? 300 : 1100);
    return res;
  });
  // Update the queue to wait for this call (swallow errors so queue never stalls)
  requestQueue = result.catch(() => {});
  return result;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 429 && attempt < retries) {
        // Back off exponentially on rate limit
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
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
  return rateLimited(() =>
    withRetry(async () => {
      const res = await s2.get('/paper/search', {
        params: { query, fields: PAPER_FIELDS, limit },
      });
      return (res.data.data ?? []) as S2Paper[];
    })
  );
}

// Search by citation count (most-cited papers for a query) using bulk endpoint
export async function searchPapersBycitations(query: string, limit = 25): Promise<S2Paper[]> {
  return rateLimited(() =>
    withRetry(async () => {
      const res = await s2.get('/paper/search/bulk', {
        params: {
          query,
          fields: BULK_PAPER_FIELDS,
          sort: 'citationCount:desc',
        },
      });
      const data = (res.data.data ?? []) as S2Paper[];
      return data.slice(0, limit);
    })
  );
}

export async function getPaper(paperId: string): Promise<S2Paper | null> {
  return rateLimited(() =>
    withRetry(async () => {
      try {
        const res = await s2.get(`/paper/${paperId}`, {
          params: { fields: PAPER_FIELDS },
        });
        return res.data as S2Paper;
      } catch (err: any) {
        if (err.response?.status === 404) return null;
        throw err;
      }
    })
  );
}

export async function getReferences(paperId: string, limit = 30): Promise<S2CitationEdge[]> {
  return rateLimited(() =>
    withRetry(async () => {
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
    })
  );
}

export async function getCitations(paperId: string, limit = 30): Promise<S2CitationEdge[]> {
  return rateLimited(() =>
    withRetry(async () => {
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
    })
  );
}

export async function batchGetPapers(paperIds: string[]): Promise<S2Paper[]> {
  if (paperIds.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < paperIds.length; i += 500) {
    chunks.push(paperIds.slice(i, i + 500));
  }
  const results: S2Paper[] = [];
  for (const chunk of chunks) {
    const res = await rateLimited(() =>
      withRetry(() =>
        s2.post('/paper/batch', { ids: chunk }, { params: { fields: PAPER_FIELDS } })
      )
    );
    results.push(...((res.data ?? []).filter(Boolean) as S2Paper[]));
  }
  return results;
}
