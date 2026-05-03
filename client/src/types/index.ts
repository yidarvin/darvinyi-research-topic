export interface User {
  id: string;
  email: string;
  hasApiKey: boolean;
}

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
  // D3 simulation positions (added at runtime)
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  isInfluential: boolean;
}

export interface CitationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  topic: string;
  generatedAt: string;
}

export interface SavedGraph {
  id: string;
  topic: string;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
}
