import axios from 'axios';

const BASE_URL = 'https://export.arxiv.org/api/query';

export interface ArxivPaper {
  arxivId: string;
  title: string;
  abstract: string;
  authors: string[];
  categories: string[];
  published: string;
  updated: string;
  doi?: string;
  pdfUrl?: string;
}

function parseAtomXml(xml: string): ArxivPaper[] {
  const papers: ArxivPaper[] = [];

  // Extract all <entry> blocks
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const get = (tag: string): string => {
      const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`));
      return m ? m[1].trim() : '';
    };

    const getAll = (tag: string): string[] => {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'g');
      const results: string[] = [];
      let m;
      while ((m = regex.exec(entry)) !== null) {
        results.push(m[1].trim());
      }
      return results;
    };

    // arXiv ID: extract from <id> url
    const idUrl = get('id');
    const arxivId = idUrl.replace(/.*abs\//, '').replace(/v\d+$/, '');

    if (!arxivId) continue;

    // Authors: each <author><name>...</name></author>
    const authorBlocks = entry.match(/<author>[\s\S]*?<\/author>/g) ?? [];
    const authors = authorBlocks.map((a) => {
      const m = a.match(/<name>([\s\S]*?)<\/name>/);
      return m ? m[1].trim() : '';
    }).filter(Boolean);

    // Categories: <category term="..." .../>
    const categoryRegex = /<category[^>]+term="([^"]+)"/g;
    const categories: string[] = [];
    let cm;
    while ((cm = categoryRegex.exec(entry)) !== null) {
      categories.push(cm[1]);
    }

    // PDF link
    const pdfLinkMatch = entry.match(/<link[^>]+title="pdf"[^>]+href="([^"]+)"/);
    const pdfUrl = pdfLinkMatch ? pdfLinkMatch[1] : undefined;

    // DOI
    const doiMatch = entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/);
    const doi = doiMatch ? doiMatch[1].trim() : undefined;

    papers.push({
      arxivId,
      title: get('title').replace(/\s+/g, ' '),
      abstract: get('summary').replace(/\s+/g, ' '),
      authors,
      categories,
      published: get('published'),
      updated: get('updated'),
      doi,
      pdfUrl,
    });
  }

  return papers;
}

export async function searchArxiv(query: string, maxResults = 20): Promise<ArxivPaper[]> {
  try {
    const res = await axios.get(BASE_URL, {
      params: {
        search_query: `all:${query}`,
        start: 0,
        max_results: maxResults,
        sortBy: 'relevance',
        sortOrder: 'descending',
      },
      timeout: 15000,
    });
    return parseAtomXml(res.data as string);
  } catch (err) {
    console.error('arXiv search error:', err);
    return [];
  }
}
