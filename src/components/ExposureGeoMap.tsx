import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ScanResult, UserProfile } from '../types';
import { US_STATES_GEOJSON, US_STATE_METADATA } from '../data/usStatesGeoJson';
import {
  StateExposureDatum,
  computeGeographicExposureDistribution,
} from '../utils/geoExposureEngine';
import { Globe, LayoutGrid, MapPin, ShieldCheck, X } from 'lucide-react';

interface ExposureGeoMapProps {
  results: ScanResult[];
  profile: UserProfile;
  selectedStateCode: string | null;
  onSelectStateCode: (stateCode: string | null) => void;
}

type GeoMapDisplayMode = 'albers' | 'grid';

export const ExposureGeoMap: React.FC<ExposureGeoMapProps> = ({
  results,
  profile,
  selectedStateCode,
  onSelectStateCode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(880);
  const [displayMode, setDisplayMode] = useState<GeoMapDisplayMode>('albers');
  const [hoveredStateCode, setHoveredStateCode] = useState<string | null>(null);

  const summary = useMemo(
    () => computeGeographicExposureDistribution(results, profile),
    [results, profile]
  );

  // Measure responsive SVG width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 240) {
        setContainerWidth(Math.floor(rect.width));
      }
    };
    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateSize());
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const inspectedDatum: StateExposureDatum | null = useMemo(() => {
    const code = hoveredStateCode || selectedStateCode || summary.topStates[0]?.meta.code || profile.currentState;
    if (!code) return null;
    return summary.statesByCode[code.toUpperCase()] || null;
  }, [hoveredStateCode, selectedStateCode, summary, profile.currentState]);

  // Render D3 geographic choropleth or 51-state D3 cartogram grid
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const width = Math.max(320, containerWidth);
    const height = displayMode === 'albers' ? Math.max(290, Math.min(430, Math.round(width * 0.48))) : 310;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%').attr('height', height);

    const maxRecs = Math.max(1, summary.maxStateRecords);
    const colorScale = d3
      .scaleLinear<string>()
      .domain([0, 1, Math.max(2, Math.ceil(maxRecs * 0.45)), Math.max(3, maxRecs)])
      .range(['#0f172a', '#065f46', '#d97706', '#e11d48'])
      .clamp(true);

    const radiusScale = d3
      .scaleSqrt()
      .domain([1, Math.max(2, maxRecs)])
      .range([4, Math.min(16, Math.max(9, width * 0.017))])
      .clamp(true);

    if (displayMode === 'albers') {
      const projection = d3
        .geoAlbersUsa()
        .fitExtent(
          [
            [14, 12],
            [width - 14, height - 12],
          ],
          US_STATES_GEOJSON
        );

      const pathGen = d3.geoPath().projection(projection);
      const mapGroup = svg.append('g').attr('class', 'us-albers-layer');

      // State polygons
      mapGroup
        .selectAll('path.us-state-shape')
        .data(US_STATES_GEOJSON.features)
        .join('path')
        .attr('class', 'us-state-shape cursor-pointer transition-opacity')
        .attr('d', (feat) => pathGen(feat) || '')
        .attr('fill', (feat) => {
          const code = feat.properties.code;
          const datum = summary.statesByCode[code];
          if (!datum || datum.exposedRecordsCount === 0) {
            return '#0f172a';
          }
          return colorScale(datum.exposedRecordsCount);
        })
        .attr('fill-opacity', (feat) => {
          const code = feat.properties.code;
          if (selectedStateCode && selectedStateCode !== code) return 0.42;
          return 0.92;
        })
        .attr('stroke', (feat) => {
          const code = feat.properties.code;
          if (selectedStateCode === code) return '#34d399';
          if (hoveredStateCode === code) return '#f8fafc';
          const datum = summary.statesByCode[code];
          return datum && datum.exposedRecordsCount > 0
            ? 'rgba(255,255,255,0.28)'
            : 'rgba(148,163,184,0.2)';
        })
        .attr('stroke-width', (feat) => {
          const code = feat.properties.code;
          if (selectedStateCode === code) return 2.2;
          if (hoveredStateCode === code) return 1.6;
          return 0.9;
        })
        .on('mouseenter', (_event, feat) => {
          setHoveredStateCode(feat.properties.code);
        })
        .on('mouseleave', () => {
          setHoveredStateCode(null);
        })
        .on('click', (_event, feat) => {
          const code = feat.properties.code;
          onSelectStateCode(selectedStateCode === code ? null : code);
        });

      // Proportional exposure bubbles & state labels at projected centroids
      const centroidNodes = US_STATES_GEOJSON.features
        .map((feat) => {
          const centroid = pathGen.centroid(feat);
          if (!centroid || Number.isNaN(centroid[0]) || Number.isNaN(centroid[1])) {
            return null;
          }
          const code = feat.properties.code;
          const datum = summary.statesByCode[code];
          return {
            code,
            cx: centroid[0],
            cy: centroid[1],
            datum,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      const bubbleGroup = svg.append('g').attr('class', 'us-state-bubbles pointer-events-none');

      bubbleGroup
        .selectAll('circle.exposure-bubble')
        .data(centroidNodes.filter((n) => (n.datum?.exposedRecordsCount || 0) > 0))
        .join('circle')
        .attr('class', 'exposure-bubble')
        .attr('cx', (d) => d.cx)
        .attr('cy', (d) => d.cy)
        .attr('r', (d) => radiusScale(d.datum?.exposedRecordsCount || 1))
        .attr('fill', (d) =>
          (d.datum?.criticalRiskCount || 0) > 0 ? 'rgba(251,113,133,0.32)' : 'rgba(52,211,153,0.28)'
        )
        .attr('stroke', (d) =>
          (d.datum?.criticalRiskCount || 0) > 0 ? '#fb7185' : '#34d399'
        )
        .attr('stroke-width', 1.2);

      bubbleGroup
        .selectAll('text.state-code-label')
        .data(centroidNodes)
        .join('text')
        .attr('class', 'state-code-label')
        .attr('x', (d) => d.cx)
        .attr('y', (d) => d.cy + 3)
        .attr('text-anchor', 'middle')
        .attr('font-size', width < 560 ? '8px' : '9.5px')
        .attr('font-family', 'JetBrains Mono, ui-monospace, monospace')
        .attr('font-weight', (d) => ((d.datum?.exposedRecordsCount || 0) > 0 ? '700' : '500'))
        .attr('fill', (d) =>
          (d.datum?.exposedRecordsCount || 0) > 0 ? '#ffffff' : 'rgba(148,163,184,0.62)'
        )
        .text((d) => d.code);
    } else {
      // 51-State Cartogram Grid Mode (11 columns x 8 rows)
      const cols = 11;
      const rows = 8;
      const padX = 14;
      const padY = 12;
      const gap = 5;
      const cellW = Math.floor((width - padX * 2 - gap * (cols - 1)) / cols);
      const cellH = Math.floor((height - padY * 2 - gap * (rows - 1)) / rows);

      const gridGroup = svg.append('g').attr('class', 'us-grid-cartogram');

      const cells = gridGroup
        .selectAll('g.state-tile')
        .data(US_STATE_METADATA)
        .join('g')
        .attr('class', 'state-tile cursor-pointer')
        .attr(
          'transform',
          (m) => `translate(${padX + m.gridCol * (cellW + gap)}, ${padY + m.gridRow * (cellH + gap)})`
        )
        .on('mouseenter', (_event, m) => setHoveredStateCode(m.code))
        .on('mouseleave', () => setHoveredStateCode(null))
        .on('click', (_event, m) => {
          onSelectStateCode(selectedStateCode === m.code ? null : m.code);
        });

      cells
        .append('rect')
        .attr('width', cellW)
        .attr('height', cellH)
        .attr('rx', 6)
        .attr('fill', (m) => {
          const d = summary.statesByCode[m.code];
          if (!d || d.exposedRecordsCount === 0) return '#0f172a';
          return colorScale(d.exposedRecordsCount);
        })
        .attr('fill-opacity', (m) => {
          if (selectedStateCode && selectedStateCode !== m.code) return 0.45;
          return 0.94;
        })
        .attr('stroke', (m) => {
          if (selectedStateCode === m.code) return '#34d399';
          if (hoveredStateCode === m.code) return '#f8fafc';
          const d = summary.statesByCode[m.code];
          return d && d.exposedRecordsCount > 0
            ? 'rgba(255,255,255,0.28)'
            : 'rgba(148,163,184,0.18)';
        })
        .attr('stroke-width', (m) => (selectedStateCode === m.code ? 2 : 1));

      cells
        .append('text')
        .attr('x', cellW / 2)
        .attr('y', cellH / 2 - (cellH >= 30 ? 3 : -3))
        .attr('text-anchor', 'middle')
        .attr('font-size', cellW < 34 ? '9px' : '10.5px')
        .attr('font-family', 'JetBrains Mono, ui-monospace, monospace')
        .attr('font-weight', '700')
        .attr('fill', (m) => {
          const d = summary.statesByCode[m.code];
          return d && d.exposedRecordsCount > 0 ? '#ffffff' : 'rgba(148,163,184,0.72)';
        })
        .text((m) => m.code);

      if (cellH >= 30) {
        cells
          .append('text')
          .attr('x', cellW / 2)
          .attr('y', cellH / 2 + 10)
          .attr('text-anchor', 'middle')
          .attr('font-size', '8.5px')
          .attr('font-family', 'JetBrains Mono, ui-monospace, monospace')
          .attr('fill', (m) => {
            const d = summary.statesByCode[m.code];
            return d && d.exposedRecordsCount > 0 ? '#e2e8f0' : 'rgba(100,116,139,0.6)';
          })
          .text((m) => {
            const recs = summary.statesByCode[m.code]?.exposedRecordsCount || 0;
            return recs > 0 ? `${recs} rec` : '0';
          });
      }
    }
  }, [
    containerWidth,
    displayMode,
    hoveredStateCode,
    onSelectStateCode,
    selectedStateCode,
    summary,
  ]);

  return (
    <section
      aria-label="US Geographic Data Exposure Map"
      className="glass-panel rounded-2xl p-6 sm:p-7 space-y-5"
    >
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
            <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-emerald-400 font-medium">US Jurisdiction Exposure Map</span>
            <span aria-hidden="true">·</span>
            <span>{summary.affectedStatesCount} Affected State(s)</span>
            <span aria-hidden="true">·</span>
            <span>{summary.totalAttributedRecords.toLocaleString()} Attributed Record(s)</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            Geographic Distribution of Exposed Personal Records
          </h2>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            Maps where commercial clearinghouses index your current residence, prior addresses, and
            state registry records across all 50 US states and DC. Click any state to filter the
            broker cards below.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {selectedStateCode && (
            <button
              type="button"
              onClick={() => onSelectStateCode(null)}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-emerald-300 hover:bg-emerald-500/25 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <span>Filtering: {selectedStateCode}</span>
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Segmented Map Mode Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/60 border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setDisplayMode('albers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                displayMode === 'albers'
                  ? 'bg-white/[0.1] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Geographic Map</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                displayMode === 'grid'
                  ? 'bg-white/[0.1] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>51-State Grid</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Split: D3 Map Canvas + Top Exposed States / Selected State Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div ref={containerRef} className="lg:col-span-8 space-y-3">
          <div className="rounded-xl border border-white/[0.07] bg-slate-950/50 p-2 overflow-hidden">
            <svg
              ref={svgRef}
              role="img"
              aria-label="D3 United States map of exposed personal data records by state"
              className="w-full block select-none"
            />
          </div>

          {/* Clean Unboxed Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400 px-1 tabular-nums">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-900 border border-slate-700 inline-block" />
                <span>0 Records</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-800 inline-block" />
                <span>Low Density</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-600 inline-block" />
                <span>Moderate</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-600 inline-block" />
                <span>High Concentration</span>
              </span>
            </div>
            <span>Click any state polygon or tile to filter broker cards</span>
          </div>
        </div>

        {/* Right Column: Selected / Hovered Jurisdiction Breakdown + Top States */}
        <div className="lg:col-span-4 space-y-4">
          {inspectedDatum && (
            <div className="rounded-xl border border-white/[0.08] bg-slate-950/45 p-4 space-y-3 text-xs">
              <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-white/[0.06]">
                <div>
                  <div className="text-[11px] text-slate-400">
                    {inspectedDatum.meta.region} Region · {inspectedDatum.meta.code}
                  </div>
                  <h3 className="text-base font-bold text-white mt-0.5">
                    {inspectedDatum.meta.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onSelectStateCode(
                      selectedStateCode === inspectedDatum.meta.code
                        ? null
                        : inspectedDatum.meta.code
                    )
                  }
                  className="px-2.5 py-1 rounded-lg glass-subtle hover:bg-white/[0.08] text-emerald-300 font-medium cursor-pointer whitespace-nowrap"
                >
                  {selectedStateCode === inspectedDatum.meta.code ? 'Clear Filter' : 'Filter Cards'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-0.5 tabular-nums">
                <div>
                  <div className="text-[11px] text-slate-400">Brokers</div>
                  <div className="text-base font-bold font-mono text-white">
                    {inspectedDatum.exposedBrokerCount}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Records</div>
                  <div className="text-base font-bold font-mono text-emerald-300">
                    {inspectedDatum.exposedRecordsCount}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Actioned</div>
                  <div className="text-base font-bold font-mono text-sky-300">
                    {inspectedDatum.submittedCount + inspectedDatum.removedCount}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-white/[0.06] space-y-1">
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Applicable Framework</span>
                </div>
                <div className="text-slate-200 leading-snug">
                  {inspectedDatum.meta.statuteLabel}
                </div>
              </div>

              {inspectedDatum.connectionSources.length > 0 && (
                <div className="pt-2 border-t border-white/[0.06] text-[11px] text-slate-400">
                  <span className="text-slate-500">Attribution: </span>
                  {inspectedDatum.connectionSources.join(' · ')}
                </div>
              )}

              {inspectedDatum.brokers.length > 0 ? (
                <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                  <div className="text-[11px] text-slate-400">
                    Top Exposed Clearinghouses in {inspectedDatum.meta.code}
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                    {inspectedDatum.brokers.slice(0, 5).map((b) => (
                      <div
                        key={b.brokerId}
                        className="flex items-center justify-between gap-2 text-[11px] text-slate-300 tabular-nums"
                      >
                        <span className="truncate font-medium text-white">{b.brokerName}</span>
                        <span className="text-slate-400 font-mono shrink-0">
                          {b.recordsCount} rec · {b.risk}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="pt-2 border-t border-white/[0.06] text-[11px] text-slate-500">
                  No exposed personal records attributed to {inspectedDatum.meta.name} in the
                  current scan.
                </p>
              )}
            </div>
          )}

          {/* Quick State Ranking List */}
          {summary.topStates.length > 0 && (
            <div className="rounded-xl border border-white/[0.07] bg-slate-950/35 p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Highest-Exposure States</span>
                <span className="font-mono">Records / Brokers</span>
              </div>
              <div className="divide-y divide-white/[0.05]">
                {summary.topStates.slice(0, 5).map((st) => {
                  const isSelected = selectedStateCode === st.meta.code;
                  return (
                    <button
                      key={st.meta.code}
                      type="button"
                      onClick={() =>
                        onSelectStateCode(isSelected ? null : st.meta.code)
                      }
                      className={`w-full py-2 px-1.5 flex items-center justify-between gap-2 text-left rounded-lg transition-colors cursor-pointer tabular-nums ${
                        isSelected
                          ? 'bg-emerald-500/15 text-emerald-200'
                          : 'hover:bg-white/[0.04] text-slate-200'
                      }`}
                    >
                      <span className="truncate">
                        <span className="font-mono font-bold mr-1.5">{st.meta.code}</span>
                        <span className="text-slate-300">{st.meta.name}</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 shrink-0">
                        {st.exposedRecordsCount} rec · {st.exposedBrokerCount} brk
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
