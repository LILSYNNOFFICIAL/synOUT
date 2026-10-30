import React, { useMemo, useState } from 'react';
import * as d3 from 'd3';
import {
  ArrowRight,
  Bot,
  Copy,
  Check,
  Download,
  ExternalLink,
  Mail,
  Network,
  Search,
} from 'lucide-react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import {
  buildSupplyChainGraph,
  exportSupplyChainPlanMarkdown,
  NodeExposureState,
  SupplyChainNode,
} from '../utils/supplyChainGraphEngine';
import { findBrokerById } from '../services/emailConnectionStore';
import { copyTextToClipboard } from '../utils/exportEngines';

interface SupplyChainNetworkCenterProps {
  profile: UserProfile;
  results: ScanResult[];
  onStartScan: () => void;
  onSendBrokerOptOut: (broker: DataBroker) => void;
  onOpenWebFormWorkbench: (broker?: DataBroker) => void;
  onOpenAutomatedNavigator?: (broker: DataBroker, result: ScanResult) => void;
}

type TopologyFilter = 'all' | 'exposed_only' | 'upstream_only';

function downloadTextArtifact(filename: string, content: string, mimeType: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatExposureLabel(state: NodeExposureState): string {
  switch (state) {
    case 'exposed':
      return 'Exposed';
    case 'submitted':
      return 'Opt-Out Pending';
    case 'removed':
      return 'Suppressed';
    default:
      return 'Clean';
  }
}

function formatTierLabel(tier: SupplyChainNode['tier']): string {
  switch (tier) {
    case 'clearinghouse':
      return 'Tier 0 · Wholesale Clearinghouse';
    case 'parent_network':
      return 'Tier 1 · Parent Broker Network';
    default:
      return 'Tier 2 · Downstream Directory';
  }
}

export const SupplyChainNetworkCenter: React.FC<SupplyChainNetworkCenterProps> = ({
  profile,
  results,
  onStartScan,
  onSendBrokerOptOut,
  onOpenWebFormWorkbench,
  onOpenAutomatedNavigator,
}) => {
  const [filterMode, setFilterMode] = useState<TopologyFilter>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPlan, setCopiedPlan] = useState(false);

  const graph = useMemo(() => buildSupplyChainGraph(results), [results]);

  const activeNode = useMemo(() => {
    if (selectedNodeId) {
      const found = graph.nodes.find((n) => n.id === selectedNodeId);
      if (found) return found;
    }
    return graph.nodes.find((n) => n.exposureState === 'exposed') || graph.nodes[0] || null;
  }, [graph.nodes, selectedNodeId]);

  const visibleNodes = useMemo(() => {
    return graph.nodes.filter((n) => {
      if (filterMode === 'exposed_only') {
        return n.exposureState === 'exposed' || n.downstreamExposedCount > 0;
      }
      if (filterMode === 'upstream_only') {
        return n.tierIndex < 2;
      }
      return true;
    });
  }, [graph.nodes, filterMode]);

  const visibleNodeIdSet = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);

  const visibleLinks = useMemo(
    () =>
      graph.links.filter(
        (l) => visibleNodeIdSet.has(l.sourceId) && visibleNodeIdSet.has(l.targetId)
      ),
    [graph.links, visibleNodeIdSet]
  );

  // Compute deterministic 3-column D3 topology coordinates (960 x 560 SVG viewBox)
  const layout = useMemo(() => {
    const svgWidth = 960;
    const svgHeight = 560;
    const colX: Record<0 | 1 | 2, number> = {
      0: 155,
      1: 475,
      2: 805,
    };

    const tierGroups: Record<0 | 1 | 2, SupplyChainNode[]> = {
      0: visibleNodes.filter((n) => n.tierIndex === 0),
      1: visibleNodes.filter((n) => n.tierIndex === 1),
      2: visibleNodes.filter((n) => n.tierIndex === 2),
    };

    const coords = new Map<string, { x: number; y: number }>();

    ([0, 1, 2] as const).forEach((tierIdx) => {
      const group = tierGroups[tierIdx];
      const scaleY = d3
        .scalePoint<string>()
        .domain(group.map((n) => n.id))
        .range([64, svgHeight - 44])
        .padding(0.45);

      for (const node of group) {
        coords.set(node.id, {
          x: colX[tierIdx],
          y: scaleY(node.id) ?? svgHeight / 2,
        });
      }
    });

    const linkGen = d3
      .linkHorizontal<{ source: [number, number]; target: [number, number] }, [number, number]>()
      .x((d) => d[0])
      .y((d) => d[1]);

    const renderedLinks = visibleLinks
      .map((l) => {
        const src = coords.get(l.sourceId);
        const tgt = coords.get(l.targetId);
        if (!src || !tgt) return null;
        const dPath = linkGen({
          source: [src.x + 76, src.y],
          target: [tgt.x - 76, tgt.y],
        });
        return {
          ...l,
          pathData: dPath || '',
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item && item.pathData));

    const renderedNodes = visibleNodes.map((n) => {
      const pt = coords.get(n.id) || { x: colX[n.tierIndex], y: svgHeight / 2 };
      return {
        ...n,
        x: pt.x,
        y: pt.y,
      };
    });

    return {
      svgWidth,
      svgHeight,
      colX,
      renderedLinks,
      renderedNodes,
    };
  }, [visibleNodes, visibleLinks]);

  const filteredPlan = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return graph.suppressionPlan;
    return graph.suppressionPlan.filter(
      (step) =>
        step.name.toLowerCase().includes(q) ||
        step.domain.toLowerCase().includes(q) ||
        step.tier.toLowerCase().includes(q)
    );
  }, [graph.suppressionPlan, searchQuery]);

  const handleTriggerNodeAction = (
    brokerId: string | undefined,
    channel: 'auto_form' | 'email'
  ) => {
    if (!brokerId) return;
    const broker = findBrokerById(brokerId);
    if (!broker) return;

    if (channel === 'email') {
      onSendBrokerOptOut(broker);
      return;
    }

    const existingResult = results.find((r) => r.brokerId === broker.id);
    if (onOpenAutomatedNavigator && existingResult) {
      onOpenAutomatedNavigator(broker, existingResult);
    } else {
      onOpenWebFormWorkbench(broker);
    }
  };

  const subjectFullName = `${profile.firstName} ${profile.lastName}`.trim();

  const handleCopyMarkdownPlan = async () => {
    const md = exportSupplyChainPlanMarkdown(graph, subjectFullName);
    const copied = await copyTextToClipboard(md);
    if (copied) {
      setCopiedPlan(true);
      setTimeout(() => setCopiedPlan(false), 2500);
    } else {
      downloadTextArtifact('synout-supply-chain-plan.md', md, 'text/markdown;charset=utf-8');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header & Summary Strip */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
              <span className="text-emerald-400 font-medium">Root-to-Leaf Data Syndication Map</span>
              <span aria-hidden="true">·</span>
              <span>{graph.stats.totalNodes} Mapped Entities</span>
              <span aria-hidden="true">·</span>
              <span>{graph.stats.totalLinks} Upstream Data Feeds</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white [text-wrap:balance]">
              Upstream Supply-Chain &amp; Cascade Suppression Graph
            </h1>
            <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
              Downstream people-search directories re-populate deleted profiles within 30–60 days
              unless you cut off their wholesale clearinghouse and parent-network feeds first.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {results.length === 0 && (
              <button
                type="button"
                onClick={onStartScan}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Run Audit to Populate Live Graph</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleCopyMarkdownPlan}
              className="px-4 py-2 rounded-xl glass-subtle hover:border-white/20 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {copiedPlan ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied Plan</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy Plan</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() =>
                downloadTextArtifact(
                  `synout-supply-chain-plan-${new Date().toISOString().slice(0, 10)}.md`,
                  exportSupplyChainPlanMarkdown(graph, subjectFullName),
                  'text/markdown;charset=utf-8'
                )
              }
              className="px-4 py-2 rounded-xl glass-subtle hover:border-white/20 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export Plan (.md)</span>
            </button>
          </div>
        </div>

        {/* 4-Column Quantitative KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-white/[0.08] tabular-nums">
          <div className="space-y-1">
            <div className="text-xs text-slate-400">Exposed Upstream Feeders</div>
            <div className="text-2xl font-extrabold font-mono text-rose-400">
              {graph.stats.exposedUpstreamCount}
            </div>
            <div className="text-[11px] text-slate-500">Clearinghouses &amp; parent networks</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-400">Exposed Downstream Mirrors</div>
            <div className="text-2xl font-extrabold font-mono text-amber-300">
              {graph.stats.exposedDownstreamCount}
            </div>
            <div className="text-[11px] text-slate-500">Retail people-search portals</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-400">Active Re-Hydration Flows</div>
            <div className="text-2xl font-extrabold font-mono text-sky-300">
              {graph.stats.activeSyndicationFlows}
            </div>
            <div className="text-[11px] text-slate-500">Live feeder-to-mirror links</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-400">Top Keystone Target</div>
            <div className="text-base sm:text-lg font-bold text-emerald-300 truncate">
              {graph.stats.topKeystoneName || 'All Clear'}
            </div>
            <div className="text-[11px] text-slate-500">Highest cascade suppression leverage</div>
          </div>
        </div>
      </div>

      {/* Interactive D3 3-Tier Supply-Chain Topology + Node Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 glass-panel rounded-3xl p-5 sm:p-6 flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Network className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Interactive Syndication Topology (Click Any Node to Inspect)</span>
            </div>

            {/* Functional Segmented Filter Controls */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/70 border border-white/[0.08]">
              {(
                [
                  { id: 'all', label: 'All Tiers' },
                  { id: 'exposed_only', label: 'Active Exposure Paths' },
                  { id: 'upstream_only', label: 'Upstream Only' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterMode(tab.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    filterMode === tab.id
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="w-full overflow-x-auto rounded-2xl bg-slate-950/60 border border-white/[0.06] p-2">
            <svg
              viewBox={`0 0 ${layout.svgWidth} ${layout.svgHeight}`}
              role="img"
              aria-label="Data broker upstream clearinghouse to downstream directory syndication graph"
              className="w-full min-w-[680px] h-auto select-none"
            >
              {/* Column Headers */}
              <text
                x={layout.colX[0]}
                y={26}
                textAnchor="middle"
                className="fill-slate-400 text-[11px] font-semibold"
              >
                Tier 0 · Wholesale Clearinghouses
              </text>
              <text
                x={layout.colX[1]}
                y={26}
                textAnchor="middle"
                className="fill-slate-400 text-[11px] font-semibold"
              >
                Tier 1 · Parent Networks
              </text>
              <text
                x={layout.colX[2]}
                y={26}
                textAnchor="middle"
                className="fill-slate-400 text-[11px] font-semibold"
              >
                Tier 2 · Downstream Mirrors
              </text>

              {/* Directed Syndication Edges */}
              {layout.renderedLinks.map((lnk) => {
                const isConnectedToSelected =
                  activeNode &&
                  (lnk.sourceId === activeNode.id || lnk.targetId === activeNode.id);
                const strokeClass = isConnectedToSelected
                  ? lnk.activeExposureFlow
                    ? 'stroke-rose-400'
                    : 'stroke-emerald-400'
                  : lnk.activeExposureFlow
                  ? 'stroke-rose-500/45'
                  : 'stroke-slate-700/55';

                return (
                  <path
                    key={lnk.id}
                    d={lnk.pathData}
                    fill="none"
                    strokeWidth={isConnectedToSelected ? 2.2 : 1.2}
                    className={`${strokeClass} transition-opacity duration-150`}
                  />
                );
              })}

              {/* Graph Nodes */}
              {layout.renderedNodes.map((node) => {
                const isSelected = activeNode?.id === node.id;
                const boxFill =
                  node.exposureState === 'exposed'
                    ? 'fill-rose-950/90'
                    : node.exposureState === 'submitted'
                    ? 'fill-amber-950/90'
                    : node.exposureState === 'removed'
                    ? 'fill-emerald-950/90'
                    : 'fill-slate-900/95';

                const boxStroke = isSelected
                  ? 'stroke-white'
                  : node.exposureState === 'exposed'
                  ? 'stroke-rose-400/80'
                  : node.exposureState === 'submitted'
                  ? 'stroke-amber-400/75'
                  : node.exposureState === 'removed'
                  ? 'stroke-emerald-400/80'
                  : 'stroke-slate-700';

                const labelText =
                  node.label.length > 20 ? `${node.label.slice(0, 19)}…` : node.label;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x - 76}, ${node.y - 14})`}
                    onClick={() => setSelectedNodeId(node.id)}
                    className="cursor-pointer"
                  >
                    <rect
                      width={152}
                      height={28}
                      rx={8}
                      strokeWidth={isSelected ? 2 : 1.2}
                      className={`${boxFill} ${boxStroke}`}
                    />
                    <text
                      x={10}
                      y={17}
                      className="fill-slate-100 text-[10.5px] font-semibold"
                    >
                      {labelText}
                    </text>
                    <text
                      x={142}
                      y={17}
                      textAnchor="end"
                      className={`text-[9.5px] font-mono ${
                        node.exposureState === 'exposed'
                          ? 'fill-rose-300'
                          : node.exposureState === 'submitted'
                          ? 'fill-amber-300'
                          : node.exposureState === 'removed'
                          ? 'fill-emerald-300'
                          : 'fill-slate-400'
                      }`}
                    >
                      {node.tierIndex < 2 ? `+${node.downstreamBrokerIds.length}` : formatExposureLabel(node.exposureState).slice(0, 4)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>
              Legend: Red border = Exposed · Amber = Opt-Out Pending · Emerald = Suppressed · Slate = Clean
            </span>
            <span className="font-mono tabular-nums">
              Right-edge badge (+N) = Downstream directories fed
            </span>
          </div>
        </div>

        {/* Selected Node Inspector Panel */}
        <div className="lg:col-span-4 glass-panel rounded-3xl p-6 flex flex-col justify-between space-y-5">
          {activeNode ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="text-xs text-slate-400 tabular-nums">
                  <span>{formatTierLabel(activeNode.tier)}</span>
                  <span aria-hidden="true"> · </span>
                  <span
                    className={
                      activeNode.exposureState === 'exposed'
                        ? 'text-rose-400 font-semibold'
                        : activeNode.exposureState === 'submitted'
                        ? 'text-amber-300 font-semibold'
                        : activeNode.exposureState === 'removed'
                        ? 'text-emerald-400 font-semibold'
                        : 'text-slate-300'
                    }
                  >
                    {formatExposureLabel(activeNode.exposureState)}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white">{activeNode.label}</h2>
                <div className="text-xs font-mono text-slate-400">{activeNode.domain}</div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {activeNode.feedDescription}
              </p>

              <div className="py-3 border-y border-white/[0.08] space-y-2 text-xs tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Keystone Leverage Score</span>
                  <span className="font-mono font-bold text-emerald-300">
                    {activeNode.keystonePriorityScore} pts
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Downstream Mirrors Supplied</span>
                  <span className="font-mono text-white">
                    {activeNode.downstreamBrokerIds.length} directories
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Exposed Mirrors Fed Right Now</span>
                  <span className="font-mono text-rose-300 font-semibold">
                    {activeNode.downstreamExposedCount} active
                  </span>
                </div>
              </div>

              {activeNode.downstreamBrokerIds.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-200">
                    Downstream Mirrors Cut Off by Suppressing {activeNode.label}:
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {activeNode.downstreamBrokerIds
                      .map((id) => findBrokerById(id)?.name || id)
                      .join(' · ')}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-400">Select any node on the graph to inspect its syndication impact.</div>
          )}

          {activeNode && (
            <div className="space-y-2.5 pt-2">
              {activeNode.brokerId && findBrokerById(activeNode.brokerId) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTriggerNodeAction(activeNode.brokerId, 'auto_form')}
                    className="px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>Auto-Fill Form</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTriggerNodeAction(activeNode.brokerId, 'email')}
                    className="px-3.5 py-2.5 rounded-xl glass-subtle hover:border-white/20 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Mail className="w-3.5 h-3.5 text-sky-400" />
                    <span>Legal Notice</span>
                  </button>
                </div>
              )}
              <a
                href={activeNode.optOutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-slate-200 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <span>Open Official Suppression Portal</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Ordered Root-to-Leaf Keystone Suppression Queue Table */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg sm:text-xl font-bold text-white">
              Ordered Root-to-Leaf Suppression Sequence
            </h2>
            <p className="text-xs text-slate-400">
              Work from Step 1 downward so wholesale feeders are locked before scrubbing retail mirrors.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter clearinghouses or mirrors..."
              className="w-full glass-input rounded-xl pl-8 pr-3 py-2 text-xs text-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs tabular-nums">
            <thead>
              <tr className="border-b border-white/[0.08] text-slate-400">
                <th className="py-2.5 pr-3 font-medium">Step</th>
                <th className="py-2.5 px-3 font-medium">Entity &amp; Domain</th>
                <th className="py-2.5 px-3 font-medium">Supply Tier</th>
                <th className="py-2.5 px-3 font-medium">Status</th>
                <th className="py-2.5 px-3 font-medium text-right">Mirrors Fed</th>
                <th className="py-2.5 px-3 font-medium text-right">Leverage</th>
                <th className="py-2.5 pl-3 font-medium text-right">Execute</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filteredPlan.map((step) => {
                const linkedBroker = step.brokerId ? findBrokerById(step.brokerId) : undefined;
                return (
                  <tr
                    key={step.nodeId}
                    onClick={() => setSelectedNodeId(step.nodeId)}
                    className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                  >
                    <td className="py-3 pr-3 font-mono font-bold text-slate-300">
                      #{step.order}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-white">{step.name}</div>
                      <div className="text-[11px] font-mono text-slate-400">{step.domain}</div>
                    </td>
                    <td className="py-3 px-3 text-slate-300">
                      {step.tier === 'clearinghouse'
                        ? 'Wholesale Clearinghouse'
                        : step.tier === 'parent_network'
                        ? 'Parent Network'
                        : 'Downstream Mirror'}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={
                          step.exposureState === 'exposed'
                            ? 'text-rose-400 font-semibold'
                            : step.exposureState === 'submitted'
                            ? 'text-amber-300 font-semibold'
                            : step.exposureState === 'removed'
                            ? 'text-emerald-400 font-semibold'
                            : 'text-slate-400'
                        }
                      >
                        {formatExposureLabel(step.exposureState)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-200">
                      {step.downstreamExposedCount}/{step.totalDownstreamCount}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-300 font-semibold">
                      {step.keystonePriorityScore}
                    </td>
                    <td
                      className="py-3 pl-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {linkedBroker ? (
                          <button
                            type="button"
                            onClick={() => handleTriggerNodeAction(linkedBroker.id, 'auto_form')}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <span>Suppress</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ) : (
                          <a
                            href={step.optOutUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 font-medium inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <span>Portal</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
