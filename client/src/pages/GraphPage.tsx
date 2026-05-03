import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Search, Save, BookMarked, SlidersHorizontal, X, Loader2 } from 'lucide-react';
import CitationGraph from '../components/CitationGraph';
import PaperPanel from '../components/PaperPanel';
import { graphApi } from '../lib/api';
import type { CitationGraph as CitationGraphType, GraphNode } from '../types';

interface Props {
  initialTopic?: string;
}

export default function GraphPage({ initialTopic }: Props) {
  const { id: savedGraphId } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [topic, setTopic] = useState(initialTopic ?? '');
  const [graph, setGraph] = useState<CitationGraphType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [yearRange, setYearRange] = useState<[number, number]>([1990, new Date().getFullYear()]);
  const [minCitations, setMinCitations] = useState(0);

  // Load saved graph if we have an ID
  useEffect(() => {
    if (!savedGraphId) return;
    setLoading(true);
    graphApi
      .get(savedGraphId)
      .then((res) => {
        setGraph(res.data.graphJson);
        setTopic(res.data.topic);
        setSavedId(savedGraphId);
        // Set year range from data
        const years = res.data.graphJson.nodes.map((n) => n.year).filter(Boolean) as number[];
        if (years.length) {
          setYearRange([Math.min(...years), Math.max(...years)]);
        }
      })
      .catch(() => setError('Failed to load saved graph'))
      .finally(() => setLoading(false));
  }, [savedGraphId]);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = topic.trim();
    if (!q || loading) return;

    setLoading(true);
    setError('');
    setGraph(null);
    setSelectedNode(null);
    setSavedId(null);

    try {
      const res = await graphApi.search(q);
      setGraph(res.data);
      const years = res.data.nodes.map((n) => n.year).filter(Boolean) as number[];
      if (years.length) {
        setYearRange([Math.min(...years), Math.max(...years)]);
      }
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to build graph. Try a more specific topic.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!graph || saving) return;
    setSaving(true);
    try {
      const res = await graphApi.save(topic, graph);
      setSavedId((res.data as any).id);
    } catch {
      alert('Failed to save graph');
    } finally {
      setSaving(false);
    }
  }

  const handleNodeSelect = useCallback((node: GraphNode) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  const graphStats = graph
    ? `${graph.nodes.length} papers · ${graph.edges.length} citations`
    : null;

  const graphYears = graph
    ? (graph.nodes.map((n) => n.year).filter(Boolean) as number[])
    : [];
  const dataMinYear = graphYears.length ? Math.min(...graphYears) : 1990;
  const dataMaxYear = graphYears.length ? Math.max(...graphYears) : new Date().getFullYear();

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div
        className="shrink-0 px-4 py-3 flex items-center gap-3"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}
      >
        {/* Search form */}
        <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2 max-w-2xl">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-secondary)' }}
            />
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. federated learning in medical imaging"
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !topic.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-opacity"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              opacity: loading || !topic.trim() ? 0.6 : 1,
              cursor: loading || !topic.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? 'Building…' : 'Search'}
          </button>
        </form>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {graph && (
            <>
              <button
                onClick={() => setShowFilters((v) => !v)}
                className="p-2 rounded-lg transition-colors"
                style={{
                  background: showFilters ? 'var(--accent)' : 'var(--bg-card)',
                  color: showFilters ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
                title="Filters"
              >
                <SlidersHorizontal size={15} />
              </button>

              <button
                onClick={handleSave}
                disabled={saving || !!savedId}
                className="p-2 rounded-lg transition-colors"
                style={{
                  background: savedId ? '#14532d' : 'var(--bg-card)',
                  color: savedId ? '#86efac' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  opacity: saving ? 0.6 : 1,
                }}
                title={savedId ? 'Saved' : 'Save graph'}
              >
                <Save size={15} />
              </button>
            </>
          )}

          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-lg"
            style={{
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
            title="My saved graphs"
          >
            <BookMarked size={15} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && graph && (
        <div
          className="shrink-0 px-4 py-3 flex items-center gap-6"
          style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Year range
            </span>
            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{yearRange[0]}</span>
            <input
              type="range"
              min={dataMinYear}
              max={dataMaxYear}
              value={yearRange[0]}
              onChange={(e) => setYearRange([+e.target.value, yearRange[1]])}
              className="w-28"
              style={{ accentColor: 'var(--accent)' }}
            />
            <input
              type="range"
              min={dataMinYear}
              max={dataMaxYear}
              value={yearRange[1]}
              onChange={(e) => setYearRange([yearRange[0], +e.target.value])}
              className="w-28"
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{yearRange[1]}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Min citations
            </span>
            <input
              type="range"
              min={0}
              max={500}
              step={10}
              value={minCitations}
              onChange={(e) => setMinCitations(+e.target.value)}
              className="w-28"
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="text-xs w-8" style={{ color: 'var(--text-primary)' }}>{minCitations}</span>
          </div>

          <button onClick={() => { setYearRange([dataMinYear, dataMaxYear]); setMinCitations(0); }}
            className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Reset
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Graph area */}
        <div className="flex-1 relative">
          {/* Empty state */}
          {!graph && !loading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center"
              style={{ color: 'var(--text-secondary)' }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 opacity-20"
                style={{ background: 'var(--accent)' }}>
                <Search size={32} color="white" />
              </div>
              <p className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                Search a research topic
              </p>
              <p className="text-sm mt-1">
                e.g. "attention mechanisms in transformers" or "CRISPR gene editing"
              </p>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Fetching papers and building citation graph…
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                This may take 15–30 seconds
              </p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <p className="text-sm px-4 py-3 rounded-lg" style={{ background: '#3b1a1a', color: 'var(--danger)' }}>
                {error}
              </p>
              <button onClick={() => setError('')} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                <X size={12} className="inline mr-1" />
                Dismiss
              </button>
            </div>
          )}

          {/* Graph */}
          {graph && !loading && (
            <>
              <CitationGraph
                graph={graph}
                selectedNodeId={selectedNode?.id ?? null}
                onNodeSelect={handleNodeSelect}
                yearRange={yearRange}
                minCitations={minCitations}
              />
              {/* Stats overlay */}
              <div
                className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg text-xs"
                style={{
                  background: 'rgba(15,17,23,0.8)',
                  color: 'var(--text-secondary)',
                  backdropFilter: 'blur(4px)',
                  border: '1px solid var(--border)',
                }}
              >
                {graphStats} · {graph.topic}
              </div>
            </>
          )}
        </div>

        {/* Paper detail panel */}
        {selectedNode && (
          <PaperPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
