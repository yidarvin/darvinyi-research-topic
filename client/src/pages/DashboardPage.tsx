import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Network, Calendar, Hash } from 'lucide-react';
import { graphApi } from '../lib/api';
import type { SavedGraph } from '../types';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [graphs, setGraphs] = useState<SavedGraph[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    graphApi
      .list()
      .then((res) => setGraphs(res.data))
      .catch(() => setError('Failed to load saved graphs'))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this graph?')) return;
    try {
      await graphApi.delete(id);
      setGraphs((prev) => prev.filter((g) => g.id !== id));
    } catch {
      alert('Failed to delete graph');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Saved Graphs
        </h1>
        <button
          onClick={() => navigate('/')}
          className="text-sm px-4 py-2 rounded-lg font-medium"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          + New Search
        </button>
      </div>

      {error && (
        <p className="text-sm px-3 py-2 rounded-lg mb-4" style={{ background: '#3b1a1a', color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {graphs.length === 0 && (
        <div className="text-center py-16" style={{ color: 'var(--text-secondary)' }}>
          <Network size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No saved graphs yet.</p>
          <p className="text-xs mt-1">Search a research topic to build your first graph.</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 text-sm px-4 py-2 rounded-lg"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Start exploring
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {graphs.map((graph) => (
          <div
            key={graph.id}
            onClick={() => navigate(`/graph/${graph.id}`)}
            className="group p-4 rounded-xl cursor-pointer transition-colors"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium text-sm leading-snug" style={{ color: 'var(--text-primary)' }}>
                {graph.topic}
              </h3>
              <button
                onClick={(e) => handleDelete(graph.id, e)}
                className="shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: '#3b1a1a', color: 'var(--danger)' }}
                title="Delete graph"
              >
                <Trash2 size={13} />
              </button>
            </div>

            <div className="flex items-center gap-4 mt-3">
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <Network size={11} />
                {graph.nodeCount} papers
              </span>
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <Hash size={11} />
                {graph.edgeCount} citations
              </span>
              <span className="flex items-center gap-1 text-xs ml-auto" style={{ color: 'var(--text-secondary)' }}>
                <Calendar size={11} />
                {new Date(graph.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
