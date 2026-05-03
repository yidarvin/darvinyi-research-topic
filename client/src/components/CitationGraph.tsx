import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { GraphNode, GraphEdge, CitationGraph } from '../types';

interface Props {
  graph: CitationGraph;
  selectedNodeId: string | null;
  onNodeSelect: (node: GraphNode) => void;
  yearRange: [number, number];
  minCitations: number;
}

function yearColor(year: number | undefined, minYear: number, maxYear: number): string {
  if (!year) return '#4b5563';
  const t = maxYear === minYear ? 0.5 : (year - minYear) / (maxYear - minYear);
  return d3.interpolateViridis(0.2 + t * 0.7);
}

function nodeRadius(citationCount: number): number {
  return Math.max(6, Math.min(30, 6 + Math.sqrt(citationCount) * 1.2));
}

export default function CitationGraph({
  graph,
  selectedNodeId,
  onNodeSelect,
  yearRange,
  minCitations,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  // Persists node positions across re-renders so expand doesn't reset layout
  const positionCacheRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  // Track the last generatedAt so we know when a full new search happened
  const prevGeneratedAtRef = useRef<string>('');

  const handleNodeClick = useCallback(
    (node: GraphNode) => onNodeSelect(node),
    [onNodeSelect]
  );

  useEffect(() => {
    if (!svgRef.current || !graph.nodes.length) return;

    // ── New search? Clear position cache so layout resets ──
    if (graph.generatedAt !== prevGeneratedAtRef.current) {
      positionCacheRef.current.clear();
      prevGeneratedAtRef.current = graph.generatedAt;
    }

    // ── Snapshot current positions BEFORE stopping simulation ──
    if (simulationRef.current) {
      simulationRef.current.nodes().forEach((n) => {
        if (n.id && n.x != null && n.y != null) {
          positionCacheRef.current.set(n.id, { x: n.x, y: n.y });
        }
      });
      simulationRef.current.stop();
      simulationRef.current = null;
    }

    const isExpansion = positionCacheRef.current.size > 0;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth || 900;
    const height = svgRef.current.clientHeight || 600;

    // Filter nodes by active filters
    const visibleNodes = graph.nodes.filter(
      (n) =>
        (n.year == null || (n.year >= yearRange[0] && n.year <= yearRange[1])) &&
        n.citationCount >= minCitations
    );
    const visibleIds = new Set(visibleNodes.map((n) => n.id));

    const visibleEdges = graph.edges.filter((e) => {
      const src = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id;
      const tgt = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id;
      return visibleIds.has(src) && visibleIds.has(tgt);
    });

    const years = visibleNodes.map((n) => n.year).filter(Boolean) as number[];
    const minYear = years.length ? Math.min(...years) : 2000;
    const maxYear = years.length ? Math.max(...years) : 2024;

    // Build edge source map so new nodes spawn near their parent
    const edgeSourceMap = new Map<string, string>(); // target → source
    visibleEdges.forEach((e) => {
      const src = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id;
      const tgt = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id;
      if (!edgeSourceMap.has(tgt)) edgeSourceMap.set(tgt, src);
    });

    // Build simulation nodes — restore cached positions for existing, spawn new ones near parent
    const nodes: GraphNode[] = visibleNodes.map((n) => {
      const cached = positionCacheRef.current.get(n.id);
      if (cached) {
        return { ...n, x: cached.x, y: cached.y };
      }
      const parentId = edgeSourceMap.get(n.id);
      const parentPos = parentId ? positionCacheRef.current.get(parentId) : undefined;
      if (parentPos) {
        const angle = Math.random() * 2 * Math.PI;
        const dist = 60 + Math.random() * 60;
        return {
          ...n,
          x: parentPos.x + Math.cos(angle) * dist,
          y: parentPos.y + Math.sin(angle) * dist,
        };
      }
      return { ...n };
    });

    const edges: GraphEdge[] = visibleEdges.map((e) => ({
      ...e,
      source: typeof e.source === 'string' ? e.source : (e.source as GraphNode).id,
      target: typeof e.target === 'string' ? e.target : (e.target as GraphNode).id,
    }));

    // ── Zoom ──
    const g = svg.append('g').attr('class', 'graph-root');
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    // ── Arrow markers ──
    const defs = svg.append('defs');
    defs.append('marker').attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10').attr('refX', 18).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#4b5563');
    defs.append('marker').attr('id', 'arrow-influential')
      .attr('viewBox', '0 -5 10 10').attr('refX', 18).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#6366f1');

    // ── Links ──
    const link = g.append('g')
      .selectAll<SVGLineElement, GraphEdge>('line')
      .data(edges)
      .join('line')
      .attr('class', (d) => `graph-link ${d.isInfluential ? 'influential' : ''}`)
      .attr('stroke-width', (d) => (d.isInfluential ? 1.8 : 1))
      .attr('marker-end', (d) => (d.isInfluential ? 'url(#arrow-influential)' : 'url(#arrow)'));

    // ── Nodes ──
    const node = g.append('g')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodes, (d) => d.id)
      .join('g')
      .attr('class', (d) => `graph-node ${d.id === selectedNodeId ? 'selected' : ''}`)
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulationRef.current?.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on('end', (event, d) => {
            if (!event.active) simulationRef.current?.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      )
      .on('click', (_event, d) => handleNodeClick(d));

    node.append('circle')
      .attr('r', (d) => nodeRadius(d.citationCount))
      .attr('fill', (d) => yearColor(d.year, minYear, maxYear))
      .attr('stroke', (d) => d.id === selectedNodeId ? '#fff' : d.isSeed ? '#ffffff88' : 'transparent')
      .attr('stroke-width', (d) => d.id === selectedNodeId ? 3 : d.isSeed ? 1.5 : 0);

    node.filter((d) => d.isSeed || d.citationCount > 100)
      .append('text')
      .attr('class', 'graph-label')
      .attr('dy', (d) => nodeRadius(d.citationCount) + 12)
      .attr('text-anchor', 'middle')
      .text((d) => {
        const words = d.title.split(' ');
        return words.slice(0, 4).join(' ') + (words.length > 4 ? '…' : '');
      });

    node.append('title').text((d) => `${d.title}\n${d.year ?? '?'} · ${d.citationCount} citations`);

    // ── Simulation ──
    // Gentle alpha for expansions (existing nodes barely move), full alpha for new graphs
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .alpha(isExpansion ? 0.25 : 1)
      .force('link',
        d3.forceLink<GraphNode, GraphEdge>(edges).id((d) => d.id).distance(80).strength(0.3))
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(isExpansion ? 0.01 : 0.1))
      .force('collision', d3.forceCollide<GraphNode>().radius((d) => nodeRadius(d.citationCount) + 4));

    simulationRef.current = simulation;

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0);
      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // Auto-fit only on fresh graph load
    if (!isExpansion) {
      setTimeout(() => {
        if (!svgRef.current) return;
        const bounds = (g.node() as SVGGElement).getBBox();
        if (!bounds.width || !bounds.height) return;
        const scale = Math.min(0.9, 0.9 / Math.max(bounds.width / width, bounds.height / height));
        svg.call(
          zoom.transform,
          d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(scale)
            .translate(-(bounds.x + bounds.width / 2), -(bounds.y + bounds.height / 2))
        );
      }, 2000);
    }

    return () => { simulation.stop(); };
  // NOTE: selectedNodeId intentionally excluded — selection highlighting has its own effect below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, yearRange, minCitations, handleNodeClick]);

  // Highlight selected node without re-running the full D3 effect
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll<SVGGElement, GraphNode>('.graph-node')
      .classed('selected', (d) => d.id === selectedNodeId)
      .select('circle')
      .attr('stroke', (d) => d.id === selectedNodeId ? '#fff' : d.isSeed ? '#ffffff88' : 'transparent')
      .attr('stroke-width', (d) => d.id === selectedNodeId ? 3 : d.isSeed ? 1.5 : 0);
  }, [selectedNodeId]);

  return (
    <svg
      ref={svgRef}
      className="graph-container"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
