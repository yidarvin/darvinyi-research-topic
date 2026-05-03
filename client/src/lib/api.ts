import axios from 'axios';
import type { CitationGraph, SavedGraph, User } from '../types';

const api = axios.create({
  baseURL: '/api',
});

// Attach JWT from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Auth ──
export const authApi = {
  signup: (email: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/signup', { email, password }),
  login: (email: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/login', { email, password }),
  me: () => api.get<{ user: User }>('/auth/me'),
  saveApiKey: (apiKey: string) => api.put('/user/apikey', { apiKey }),
  deleteApiKey: () => api.delete('/user/apikey'),
};

// ── Graph ──
export const graphApi = {
  search: (topic: string) =>
    api.post<CitationGraph>('/graph/search', { topic }),
  save: (topic: string, graphJson: CitationGraph) =>
    api.post<{ id: string }>('/graph/save', { topic, graphJson }),
  list: () => api.get<SavedGraph[]>('/graph/list'),
  get: (id: string) => api.get<{ graphJson: CitationGraph; topic: string }>(`/graph/${id}`),
  delete: (id: string) => api.delete(`/graph/${id}`),
};

// ── Paper summary (SSE streaming) ──
export function streamSummary(
  s2Id: string,
  token: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void
): () => void {
  const controller = new AbortController();

  fetch(`/api/paper/${s2Id}/summarize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const data = await res.json();
        onError(data.error ?? 'Failed to start summary');
        return;
      }

      const contentType = res.headers.get('content-type') ?? '';

      // Non-streaming cached response
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data.summary) {
          onChunk(data.summary);
          onDone();
        }
        return;
      }

      // SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) { onError(parsed.error); return; }
            if (parsed.done) { onDone(); return; }
            if (parsed.text) onChunk(parsed.text);
          } catch {
            // ignore parse errors
          }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(err.message ?? 'Stream error');
    });

  return () => controller.abort();
}
