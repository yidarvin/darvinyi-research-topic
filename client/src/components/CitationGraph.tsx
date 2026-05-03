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

// Year → color using a sequential scale
function yearColor(year: number | undefined, minYear: number, maxYear: number): string {
  if (!year) return '#4b5563';
  const t = maxYear === minYear ? 0.5 : (year - minYear) / (maxYear - minYear);
  // Interpolate from muted blue (#4f6bbd) to bright indigo/violet (#a78bfa)
  return d3.interpolateViridis(0.2 + t * 0.7);
}

function nodeRadius(citationCount: number): number {
  // log scale, min 6, max 30
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

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      onNodeSelect(node);
    },
    [onNodeSelect]
  );

  useEffect(() => {
    if (!svgRef.current || !graph.nodes.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth || 900;
    const height = svgRef.current.clientHeight || 600;

    // Filter nodes
    const visibleNodes = graph.nodes.filter(
      (n) =>
        (n.year == null || (n.year >= yearRange[0] && n.year <= yearRange[1])) &&
        n.citationCount >= minCitations
    );
    const visibleIds = new Set(visibleNodes.map((n) => n.id));

    // Filter edges to only include visible nodes
    const visibleEdges = graph.edges.filter((e) => {
      const src = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id;
      const tgt = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id;
      return visibleIds.has(src) && visibleIds.has(tgt);
    });

    const years = visibleNodes.map((n) => n.year).filter(Boolean) as number[];
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    // Deep copy nodes/edges for simulation (D3 mutates them)
    const nodes: GraphNode[] = visibleNodes.map((n) => ({ ...n }));
    const edges: GraphEdge[] = visibleEdges.map((e) => ({
      ...e,
      source: typeof e.source === 'string' ? e.source : (e.source as GraphNode).id,
      target: typeof e.target === 'string' ? e.target : (e.target as GraphNode).id,
    }));

    // ── Zoom container ──
    const g = svg.append('g').attr('class', 'graph-root');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    // ── Arrow marker ──
    svg
      .append('defs')
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#4b5563');

    svg
      .append('defs')
      .append('marker')
      .attr('id', 'arrow-influential')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#6366f1');

    // ── Links ──
    const link = g
      .append('g')
      .selectAll<SVGLineElement, GraphEdge>('line')
      .data(edges)
      .join('line')
      .attr('class', (d) => `graph-link ${d.isInfluential ? 'influential' : ''}`)
      .attr('stroke-width', (d) => (d.isInfluential ? 1.8 : 1))
      .attr('marker-end', (d) => (d.isInfluential ? 'url(#arrow-influential)' : 'url(#arrow)'));

    // ── Nodes ──
    const node = g
      .append('g')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodes, (d) => d.id)
      .join('g')
      .attr('class', (d) => `graph-node ${d.id === selectedNodeId ? 'selected' : ''}`)
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulationRef.current?.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulationRef.current?.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on('click', (_event, d) => handleNodeClick(d));

    node
      .append('circle')
      .attr('r', (d) => nodeRadius(d.citationCount))
      .attr('fill', (d) => yearColor(d.year, minYear, maxYear))
      .attr('stroke', (d) => (d.isSeed ? '#fff' : 'transparent'))
      .attr('stroke-width', (d) => (d.isSeed ? 1.5 : 0));

    // Label — only for seed nodes or high citation nodes
    node
      .filter((d) => d.isSeed || d.citationCount > 100)
      .append('text')
      .attr('class', 'graph-label')
      .attr('dy', (d) => nodeRadius(d.citationCount) + 12)
      .attr('text-anchor', 'middle')
      .text((d) => {
        const words = d.title.split(' ');
        const short = words.slice(0, 4).join(' ');
        return short + (words.length > 4 ? '…' : '');
      });

    // Tooltip
    node.append('title').text((d) => `${d.title}\n${d.year ?? '?'} · ${d.citationCount} citations`);

    // ── Force simulation ──
    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphEdge>(edges)
          .id((d) => d.id)
          .distance(80)
          .strength(0.3)
      )
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(width / 2, height / 2))
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

    // Fit graph to view after settling
    setTimeout(() => {
      const bounds = (g.node() as SVGGElement).getBBox();
      const dx = bounds.width;
      const dy = bounds.height;
      const x = bounds.x + dx / 2;
      const y = bounds.y + dy / 2;
      const scale = Math.min(0.9, 0.9 / Math.max(dx / width, dy / height));
      svg.call(
        zoom.transform,
        d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(scale)
          .translate(-x, -y)
      );
    }, 2000);

    return () => {
      simulation.stop();
    };
  }, [graph, yearRange, minCitations, handleNodeClick, selectedNodeId]);

  // Highlight selected node without re-running simulation
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll<SVGGElement, GraphNode>('.graph-node')
      .classed('selected', (d) => d.id === selectedNodeId)
      .select('circle')
      .attr('stroke', (d) =>
        d.id === selectedNodeId ? '#fff' : d.isSeed ? '#ffffff88' : 'transparent'
      )
      .attr('stroke-width', (d) =>
        d.id === selectedNodeId ? 3 : d.isSeed ? 1.5 : 0
      );
  }, [selectedNodeId]);

  return (
    <svg
      ref={svgRef}
      className="graph-container"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
