import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ScanHistorySnapshot, ScanResult, ScanStats } from '../types';
import { computeInitialBaselineExposureScore } from '../utils/scanEngine';
import { Camera, TrendingDown } from 'lucide-react';

export interface ExposureTrendPoint {
  id: string;
  label: string;
  shortDate: string;
  timestampIso: string;
  exposureScore: number;
  exposedCount: number;
  submittedCount: number;
  removedCount: number;
  kind: 'historical' | 'milestone' | 'current' | 'projected';
  note: string;
}

interface ExposureTrendChartProps {
  snapshots: ScanHistorySnapshot[];
  results: ScanResult[];
  stats: ScanStats;
  onCaptureSnapshot?: () => void;
}

function formatShortDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return 'Snapshot';
  return new Date(parsed).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatDetailedTimestamp(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Pure builder that constructs the chronological Exposure Score series from saved
 * historical vault snapshots, suppression timestamps, current live state, and
 * optional 45-day statutory SLA completion trajectory.
 */
export function buildExposureTrendSeries(
  snapshots: ScanHistorySnapshot[],
  results: ScanResult[],
  stats: ScanStats,
  includeProjectedSla = true
): ExposureTrendPoint[] {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const baselineScore = computeInitialBaselineExposureScore(results);

  const sortedSnapshots = [...snapshots]
    .filter((s) => s && typeof s.timestampIso === 'string' && typeof s.exposureScore === 'number')
    .sort((a, b) => Date.parse(a.timestampIso) - Date.parse(b.timestampIso));

  const points: ExposureTrendPoint[] = [];

  if (sortedSnapshots.length > 0) {
    sortedSnapshots.forEach((snap, idx) => {
      const clampedScore = Math.max(0, Math.min(100, Math.round(snap.exposureScore)));
      points.push({
        id: snap.id || `snap-${idx}`,
        label: idx === 0 ? 'Initial Snapshot' : `Audit #${idx + 1}`,
        shortDate: formatShortDate(snap.timestampIso),
        timestampIso: snap.timestampIso,
        exposureScore: clampedScore,
        exposedCount: snap.exposedBrokerIds.length,
        submittedCount: snap.submittedBrokerIds.length,
        removedCount: snap.removedBrokerIds.length,
        kind: 'historical',
        note: `Recorded vault snapshot (${snap.exposedBrokerIds.length} exposed, ${snap.removedBrokerIds.length} removed)`,
      });
    });
  } else {
    // Derive chronological baseline from earliest recorded action timestamp (or 1h prior to live audit)
    const actionTimestamps = results
      .flatMap((r) => [r.submittedAtIso, r.webFormSubmittedAtIso, r.verifiedRemovedAtIso])
      .filter((t): t is string => Boolean(t && !Number.isNaN(Date.parse(t))))
      .map((t) => Date.parse(t))
      .sort((a, b) => a - b);

    const baselineMs =
      actionTimestamps.length > 0
        ? Math.min(actionTimestamps[0] - 15 * 60 * 1000, nowMs - 60 * 1000)
        : nowMs - 60 * 60 * 1000;
    const baselineIso = new Date(baselineMs).toISOString();

    points.push({
      id: 'derived-initial-baseline',
      label: 'Initial Audit',
      shortDate: formatShortDate(baselineIso),
      timestampIso: baselineIso,
      exposureScore: baselineScore,
      exposedCount: stats.exposedBrokers,
      submittedCount: 0,
      removedCount: 0,
      kind: 'historical',
      note: `Pre-suppression audit baseline across ${stats.totalBrokers} data brokers`,
    });

    // When both submissions and removals exist without manual snapshots, surface intermediate dispatch milestone
    if (stats.removedBrokers > 0 && stats.inProgressRemovals > 0 && actionTimestamps.length > 0) {
      const midIso = new Date(actionTimestamps[0]).toISOString();
      const midScore = Math.max(
        stats.exposureScore,
        Math.round((baselineScore + stats.exposureScore) / 2)
      );
      points.push({
        id: 'derived-dispatch-milestone',
        label: 'Opt-Outs Sent',
        shortDate: formatShortDate(midIso),
        timestampIso: midIso,
        exposureScore: midScore,
        exposedCount: stats.exposedBrokers,
        submittedCount: stats.inProgressRemovals + stats.removedBrokers,
        removedCount: 0,
        kind: 'milestone',
        note: 'Statutory deletion notices & online opt-out forms dispatched',
      });
    }
  }

  // Always include the live real-time posture point
  const activeUnremovedCount = Math.max(0, stats.exposedBrokers - stats.removedBrokers);
  points.push({
    id: 'current-live-posture',
    label: 'Current Live',
    shortDate: 'Now',
    timestampIso: nowIso,
    exposureScore: Math.max(0, Math.min(100, Math.round(stats.exposureScore))),
    exposedCount: activeUnremovedCount,
    submittedCount: stats.inProgressRemovals,
    removedCount: stats.removedBrokers,
    kind: 'current',
    note: `Live dossier state (${activeUnremovedCount} active exposed, ${stats.inProgressRemovals} awaiting SLA, ${stats.removedBrokers} removed)`,
  });

  if (includeProjectedSla) {
    // Calculate projected score at 45-day statutory SLA completion once all in-progress removals finish
    const simulatedResultsAfterSla: ScanResult[] = results.map((r) =>
      r.removalStatus === 'submitted' ? { ...r, removalStatus: 'removed' } : r
    );
    const exposedAfterSla = simulatedResultsAfterSla.filter(
      (r) => r.status === 'exposed' && r.removalStatus !== 'removed'
    );
    let projectedScore = 0;
    if (stats.inProgressRemovals > 0) {
      if (exposedAfterSla.length === 0) {
        projectedScore = 0;
      } else {
        const totalExposed = results.filter((r) => r.status === 'exposed');
        const weightOf = (r: ScanResult) =>
          r.mockListingData.riskLevel === 'Critical'
            ? 8
            : r.mockListingData.riskLevel === 'High'
            ? 4
            : 2;
        const initWeight = totalExposed.reduce((acc, r) => acc + weightOf(r), 0);
        const remWeight = exposedAfterSla.reduce((acc, r) => acc + weightOf(r), 0);
        projectedScore =
          initWeight > 0 ? Math.max(0, Math.round(baselineScore * (remWeight / initWeight))) : 0;
      }
    } else {
      // Show target 0 score if user dispatches remaining unactioned brokers
      projectedScore = 0;
    }

    const slaDateIso = new Date(nowMs + 45 * 24 * 60 * 60 * 1000).toISOString();
    points.push({
      id: 'projected-45d-sla',
      label: '+45d SLA Target',
      shortDate: formatShortDate(slaDateIso),
      timestampIso: slaDateIso,
      exposureScore: projectedScore,
      exposedCount: stats.inProgressRemovals > 0 ? exposedAfterSla.length : 0,
      submittedCount: 0,
      removedCount:
        stats.inProgressRemovals > 0
          ? stats.removedBrokers + stats.inProgressRemovals
          : stats.exposedBrokers,
      kind: 'projected',
      note:
        stats.inProgressRemovals > 0
          ? `Projected score once ${stats.inProgressRemovals} in-progress statutory removal(s) complete within 45 days`
          : `Projected score after full batch opt-out across all ${stats.exposedBrokers} exposed brokers`,
    });
  }

  return points;
}

export const ExposureTrendChart: React.FC<ExposureTrendChartProps> = ({
  snapshots,
  results,
  stats,
  onCaptureSnapshot,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(860);
  const [showProjection, setShowProjection] = useState<boolean>(true);
  const [selectedPointId, setSelectedPointId] = useState<string>('current-live-posture');

  const series = useMemo(
    () => buildExposureTrendSeries(snapshots, results, stats, showProjection),
    [snapshots, results, stats, showProjection]
  );

  const activePoint = useMemo(
    () =>
      series.find((p) => p.id === selectedPointId) ||
      series.find((p) => p.kind === 'current') ||
      series[series.length - 1],
    [series, selectedPointId]
  );

  const baselineScore = series[0]?.exposureScore ?? stats.exposureScore;
  const currentScore =
    series.find((p) => p.kind === 'current')?.exposureScore ?? stats.exposureScore;
  const scoreDelta = currentScore - baselineScore;

  // Responsive width observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const updateSize = () => {
      const nextWidth = Math.max(320, Math.floor(el.getBoundingClientRect().width));
      setContainerWidth(nextWidth);
    };
    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Render D3 interactive exposure trend SVG
  useEffect(() => {
    const svgNode = svgRef.current;
    if (!svgNode || series.length === 0) return;

    const height = 224;
    const margin = { top: 22, right: 28, bottom: 40, left: 42 };
    const innerWidth = Math.max(220, containerWidth - margin.left - margin.right);
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgNode);
    svg.selectAll('*').remove();
    svg
      .attr('viewBox', `0 0 ${containerWidth} ${height}`)
      .attr('width', containerWidth)
      .attr('height', height);

    const defs = svg.append('defs');

    const areaGradient = defs
      .append('linearGradient')
      .attr('id', 'synout-exposure-area-grad')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    areaGradient
      .append('stop')
      .attr('offset', '0%')
      .attr('stop-color', currentScore >= 60 ? '#fb7185' : '#34d399')
      .attr('stop-opacity', 0.28);

    areaGradient
      .append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#0f172a')
      .attr('stop-opacity', 0.02);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scalePoint<string>()
      .domain(series.map((d) => d.id))
      .range([0, innerWidth])
      .padding(0.18);

    const yScale = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]);

    // Horizontal threshold gridlines
    const yTicks = [0, 25, 50, 75, 100];
    g.append('g')
      .selectAll('line.grid-line')
      .data(yTicks)
      .join('line')
      .attr('class', 'grid-line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', 'rgba(255, 255, 255, 0.07)')
      .attr('stroke-dasharray', (d) => (d === 0 ? 'none' : '3,4'));

    // Y-axis score labels
    const yAxis = d3
      .axisLeft(yScale)
      .tickValues(yTicks)
      .tickSize(0)
      .tickPadding(10);

    const yAxisGroup = g.append('g').call(yAxis);
    yAxisGroup.select('.domain').remove();
    yAxisGroup
      .selectAll('text')
      .attr('fill', '#94a3b8')
      .attr('font-size', '11px')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace');

    // X-axis point labels
    const labelById = new Map(
      series.map((p) => [p.id, `${p.label} (${p.shortDate})`])
    );
    const xAxis = d3
      .axisBottom(xScale)
      .tickFormat((id) => labelById.get(id) || id)
      .tickSize(0)
      .tickPadding(14);

    const xAxisGroup = g
      .append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis);
    xAxisGroup.select('.domain').remove();
    xAxisGroup
      .selectAll('text')
      .attr('fill', (d) =>
        d === 'projected-45d-sla'
          ? '#34d399'
          : d === 'current-live-posture'
          ? '#f8fafc'
          : '#94a3b8'
      )
      .attr('font-size', '11px')
      .attr('font-weight', (d) => (d === 'current-live-posture' ? '600' : '400'));

    const actualSeries = series.filter((d) => d.kind !== 'projected');
    const projectedPoint = series.find((d) => d.kind === 'projected');
    const currentPoint = series.find((d) => d.kind === 'current');

    // Area fill under recorded + live series
    const areaGen = d3
      .area<ExposureTrendPoint>()
      .x((d) => xScale(d.id) ?? 0)
      .y0(innerHeight)
      .y1((d) => yScale(d.exposureScore))
      .curve(d3.curveMonotoneX);

    if (actualSeries.length >= 2) {
      g.append('path')
        .datum(actualSeries)
        .attr('fill', 'url(#synout-exposure-area-grad)')
        .attr('d', areaGen);

      const lineGen = d3
        .line<ExposureTrendPoint>()
        .x((d) => xScale(d.id) ?? 0)
        .y((d) => yScale(d.exposureScore))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(actualSeries)
        .attr('fill', 'none')
        .attr('stroke', currentScore >= 60 ? '#fb7185' : '#38bdf8')
        .attr('stroke-width', 2.5)
        .attr('d', lineGen);
    }

    // Dashed 45-Day SLA projection segment
    if (currentPoint && projectedPoint) {
      const projLine = d3
        .line<ExposureTrendPoint>()
        .x((d) => xScale(d.id) ?? 0)
        .y((d) => yScale(d.exposureScore));

      g.append('path')
        .datum([currentPoint, projectedPoint])
        .attr('fill', 'none')
        .attr('stroke', '#34d399')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6,4')
        .attr('d', projLine);
    }

    // Vertical focus guide on active selected point
    if (activePoint) {
      const activeX = xScale(activePoint.id);
      if (typeof activeX === 'number') {
        g.append('line')
          .attr('x1', activeX)
          .attr('x2', activeX)
          .attr('y1', 0)
          .attr('y2', innerHeight)
          .attr('stroke', 'rgba(148, 163, 184, 0.22)')
          .attr('stroke-dasharray', '2,3');
      }
    }

    // Interactive data point nodes
    const nodes = g
      .append('g')
      .selectAll('g.trend-node')
      .data(series)
      .join('g')
      .attr('class', 'trend-node')
      .attr(
        'transform',
        (d) => `translate(${xScale(d.id) ?? 0},${yScale(d.exposureScore)})`
      )
      .style('cursor', 'pointer')
      .on('mouseenter', (_event, d) => {
        setSelectedPointId(d.id);
      })
      .on('click', (_event, d) => {
        setSelectedPointId(d.id);
      });

    // Outer halo on active node
    nodes
      .filter((d) => d.id === activePoint?.id)
      .append('circle')
      .attr('r', 10)
      .attr('fill', (d) =>
        d.kind === 'projected'
          ? 'rgba(52, 211, 153, 0.18)'
          : d.exposureScore >= 60
          ? 'rgba(251, 113, 133, 0.22)'
          : 'rgba(56, 189, 248, 0.22)'
      );

    // Primary circle marker
    nodes
      .append('circle')
      .attr('r', (d) => (d.id === activePoint?.id ? 5.5 : 4.5))
      .attr('fill', (d) => {
        if (d.kind === 'projected') return '#10b981';
        if (d.exposureScore >= 65) return '#fb7185';
        if (d.exposureScore >= 35) return '#fbbf24';
        return '#34d399';
      })
      .attr('stroke', '#020617')
      .attr('stroke-width', 2);

    // Numeric score label above each node
    nodes
      .append('text')
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .attr('fill', (d) => (d.kind === 'projected' ? '#6ee7b7' : '#e2e8f0'))
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
      .text((d) => `${d.exposureScore}`);

    // Larger transparent hit target for accessible touch & pointer hover
    nodes
      .append('circle')
      .attr('r', 18)
      .attr('fill', 'transparent');
  }, [series, containerWidth, activePoint, currentScore]);

  return (
    <section
      aria-label="Historical Exposure Score Trend"
      className="p-6 glass-panel rounded-2xl space-y-4"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
            <span className="font-medium text-emerald-400 inline-flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5" /> Historical Exposure Trend
            </span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span>
              Current Score: <strong className="text-white font-mono">{currentScore}/100</strong>
            </span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span>
              {scoreDelta < 0
                ? `${Math.abs(scoreDelta)} pt reduction from baseline`
                : scoreDelta > 0
                ? `+${scoreDelta} pt increase from baseline`
                : `Baseline ${baselineScore}/100`}
            </span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span>{snapshots.length} saved vault snapshot{snapshots.length === 1 ? '' : 's'}</span>
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">
            Exposure Score Trajectory &amp; 45-Day Statutory SLA Forecast
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center p-1 glass-subtle rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setShowProjection(true)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                showProjection
                  ? 'bg-white/[0.1] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              With 45d Forecast
            </button>
            <button
              type="button"
              onClick={() => setShowProjection(false)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                !showProjection
                  ? 'bg-white/[0.1] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Recorded Only
            </button>
          </div>

          {onCaptureSnapshot && (
            <button
              type="button"
              onClick={onCaptureSnapshot}
              className="px-3.5 py-2 rounded-xl glass-card text-slate-200 hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Save a timestamped exposure score snapshot to your historical trend"
            >
              <Camera className="w-3.5 h-3.5 text-sky-400" />
              <span>Record Snapshot</span>
            </button>
          )}
        </div>
      </div>

      {/* Responsive D3 SVG Canvas */}
      <div ref={containerRef} className="w-full overflow-hidden pt-1">
        <svg
          ref={svgRef}
          role="img"
          aria-label="D3 line chart showing historical exposure score trend from 0 to 100"
          className="w-full block select-none"
        />
      </div>

      {/* Interactive Point Inspection Strip (Clean Hairline Layout, Zero Nested Boxes) */}
      {activePoint && (
        <div className="pt-3 border-t border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs tabular-nums">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2 text-slate-200">
              <strong className="font-semibold text-white">{activePoint.label}</strong>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="text-slate-400 font-mono">
                {formatDetailedTimestamp(activePoint.timestampIso)}
              </span>
            </div>
            <p className="text-slate-400">{activePoint.note}</p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-slate-300 font-mono shrink-0">
            <span>
              Score: <strong className="text-white">{activePoint.exposureScore}/100</strong>
            </span>
            <span className="text-slate-600" aria-hidden="true">/</span>
            <span>
              Exposed: <strong className="text-rose-400">{activePoint.exposedCount}</strong>
            </span>
            <span className="text-slate-600" aria-hidden="true">/</span>
            <span>
              Submitted: <strong className="text-sky-300">{activePoint.submittedCount}</strong>
            </span>
            <span className="text-slate-600" aria-hidden="true">/</span>
            <span>
              Removed: <strong className="text-emerald-400">{activePoint.removedCount}</strong>
            </span>
          </div>
        </div>
      )}
    </section>
  );
};
