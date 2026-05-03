import { useState, useEffect, useRef } from 'react';
import { X, ExternalLink, Sparkles, BookOpen, Users, Calendar, Quote, GitBranch, Loader2, CheckCircle2 } from 'lucide-react';
import type { GraphNode } from '../types';
import { streamSummary } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

interface Props {
  node: GraphNode | null;
  onClose: () => void;
  onExpand: (nodeId: string) => void;
  expandingNodeId: string | null;
  expandedNodeIds: Set<string>;
  expandError: string;
}

function MarkdownLine({ text }: { text: string }) {
  // Simple bold rendering: **text** → <strong>
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i} style={{ color: '#a5b4fc' }}>
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function SummaryText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="summary-text text-sm leading-relaxed space-y-1" style={{ color: 'var(--text-primary)' }}>
      {lines.map((line, i) => (
        <p key={i} className={line.startsWith('##') || /^\d+\./.test(line) ? 'mt-3' : ''}>
          <MarkdownLine text={line} />
        </p>
      ))}
    </div>
  );
}

export default function PaperPanel({ node, onClose, onExpand, expandingNodeId, expandedNodeIds, expandError }: Props) {
  const { token, user } = useAuth();
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const cancelRef = useRef<(() => void) | null>(null);

  // Reset summary when node changes
  useEffect(() => {
    setSummary('');
    setSummaryError('');
    setSummaryLoading(false);
    cancelRef.current?.();
  }, [node?.id]);

  if (!node) return null;

  function handleSummarize() {
    if (!token || !node) return;
    setSummaryLoading(true);
    setSummaryError('');
    setSummary('');

    const cancel = streamSummary(
      node.id,
      token,
      (chunk) => setSummary((prev) => prev + chunk),
      () => setSummaryLoading(false),
      (err) => {
        setSummaryError(err);
        setSummaryLoading(false);
      }
    );
    cancelRef.current = cancel;
  }

  const arxivUrl = node.arxivId ? `https://arxiv.org/abs/${node.arxivId}` : null;
  const pdfUrl = node.openAccessPdf ?? (node.arxivId ? `https://arxiv.org/pdf/${node.arxivId}` : null);

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: 'var(--bg-card)',
        borderLeft: '1px solid var(--border)',
        width: '380px',
        minWidth: '320px',
        maxWidth: '420px',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold leading-snug pr-2 flex-1" style={{ color: 'var(--text-primary)' }}>
          {node.title}
        </h2>
        <div className="flex items-center gap-1 shrink-0">
          {/* Expand button */}
          {(() => {
            const isExpanding = expandingNodeId === node.id;
            const isExpanded = expandedNodeIds.has(node.id);
            const isOtherExpanding = !!expandingNodeId && expandingNodeId !== node.id;
            return (
              <button
                onClick={() => !isExpanded && !isExpanding && !isOtherExpanding && onExpand(node.id)}
                disabled={isExpanded || isExpanding || isOtherExpanding}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-opacity"
                style={{
                  background: isExpanded ? '#14532d' : 'var(--bg-secondary)',
                  color: isExpanded ? '#86efac' : isExpanding ? 'var(--accent)' : 'var(--text-secondary)',
                  opacity: isOtherExpanding ? 0.4 : 1,
                  cursor: isExpanded || isExpanding || isOtherExpanding ? 'not-allowed' : 'pointer',
                  border: '1px solid var(--border)',
                }}
                title={isExpanded ? 'Already expanded' : 'Fetch this paper\'s references and add them to the graph'}
              >
                {isExpanding ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : isExpanded ? (
                  <CheckCircle2 size={11} />
                ) : (
                  <GitBranch size={11} />
                )}
                {isExpanding ? 'Expanding…' : isExpanded ? 'Expanded' : 'Expand'}
              </button>
            );
          })()}

          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Expand error */}
      {expandError && expandingNodeId === null && (
        <div className="px-4 pt-2">
          <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#3b1a1a', color: 'var(--danger)' }}>
            {expandError}
          </p>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Metadata badges */}
        <div className="flex flex-wrap gap-2">
          {node.year && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
              <Calendar size={11} />
              {node.year}
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            <Quote size={11} />
            {node.citationCount.toLocaleString()} citations
          </span>
          {node.isSeed && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs"
              style={{ background: '#1e1b4b', color: '#a5b4fc' }}>
              Seed paper
            </span>
          )}
        </div>

        {/* Authors */}
        {node.authors.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Users size={12} style={{ color: 'var(--text-secondary)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Authors</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-primary)' }}>
              {node.authors.slice(0, 6).map((a) => a.name).join(', ')}
              {node.authors.length > 6 && ` +${node.authors.length - 6} more`}
            </p>
          </div>
        )}

        {/* Venue */}
        {node.venue && (
          <div>
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Venue</span>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-primary)' }}>{node.venue}</p>
          </div>
        )}

        {/* Fields of study */}
        {node.fieldsOfStudy && node.fieldsOfStudy.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {node.fieldsOfStudy.map((f) => (
              <span key={f} className="text-xs px-2 py-0.5 rounded"
                style={{ background: '#1a2744', color: '#7dd3fc' }}>
                {f}
              </span>
            ))}
          </div>
        )}

        {/* TLDR */}
        {node.tldr && (
          <div className="rounded-lg p-3" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#a5b4fc' }}>TL;DR</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>{node.tldr}</p>
          </div>
        )}

        {/* Abstract */}
        {node.abstract && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <BookOpen size={12} style={{ color: 'var(--text-secondary)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Abstract</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {node.abstract}
            </p>
          </div>
        )}

        {/* Links */}
        {(arxivUrl || pdfUrl) && (
          <div className="flex gap-2">
            {arxivUrl && (
              <a href={arxivUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                style={{ background: '#b45309', color: '#fff' }}>
                <ExternalLink size={11} />
                arXiv
              </a>
            )}
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                style={{ background: '#166534', color: '#fff' }}>
                <ExternalLink size={11} />
                PDF
              </a>
            )}
          </div>
        )}

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--border)' }} />

        {/* AI Summary section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} style={{ color: '#a5b4fc' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>AI Summary</span>
            </div>
            {!summary && !summaryLoading && (
              <button
                onClick={handleSummarize}
                disabled={!user?.hasApiKey}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity"
                style={{
                  background: user?.hasApiKey ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: user?.hasApiKey ? '#fff' : 'var(--text-secondary)',
                  cursor: user?.hasApiKey ? 'pointer' : 'not-allowed',
                  opacity: user?.hasApiKey ? 1 : 0.6,
                }}
                title={!user?.hasApiKey ? 'Add your Anthropic API key in settings' : ''}
              >
                Summarize
              </button>
            )}
          </div>

          {!user?.hasApiKey && !summary && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Add your Anthropic API key in settings to generate AI summaries.
            </p>
          )}

          {summaryLoading && !summary && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Generating summary…</span>
            </div>
          )}

          {summaryError && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#3b1a1a', color: 'var(--danger)' }}>
              {summaryError}
            </p>
          )}

          {summary && (
            <>
              <SummaryText text={summary} />
              {summaryLoading && (
                <span className="inline-block w-1.5 h-4 ml-0.5 animate-pulse rounded-sm"
                  style={{ background: 'var(--accent)', verticalAlign: 'middle' }} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
