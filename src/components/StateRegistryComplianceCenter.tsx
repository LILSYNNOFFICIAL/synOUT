import React, { useState, useMemo } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import {
  REGULATOR_AGENCIES,
  RegulatorAgencyTarget,
  RegulatorComplaintPacket,
  StateRegistryJurisdiction,
  generateRegulatorComplaintPacket,
  getSynchronizedStateBrokerRegistry,
} from '../utils/stateRegistryEngine';
import { resolveBrokerPlaybook } from '../utils/brokerAdapterCatalog';
import { computeBrokerSlaStatus } from '../utils/statutorySlaEngine';
import { useEmailConnection } from '../services/emailConnectionStore';
import { sessionFetch } from '../services/sessionClient';
import { copyTextToClipboard, downloadFile } from '../utils/exportEngines';
import {
  Scale,
  Search,
  Download,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  FileCode2,
  Send,
  ShieldCheck,
} from 'lucide-react';

interface StateRegistryComplianceCenterProps {
  profile: UserProfile;
  results: ScanResult[];
  onSendBrokerOptOut?: (broker: DataBroker) => void;
  onOpenWebFormWorkbench?: (broker?: DataBroker) => void;
}

interface GpcAuditResult {
  loading: boolean;
  gpcWellKnownSupported?: boolean;
  portalReachable?: boolean;
  portalHttpStatus?: number;
  complianceSummary?: string;
}

export const StateRegistryComplianceCenter: React.FC<StateRegistryComplianceCenterProps> = ({
  profile,
  results,
  onSendBrokerOptOut,
  onOpenWebFormWorkbench,
}) => {
  const { activeConnectedEmail } = useEmailConnection();
  const [jurisdictionFilter, setJurisdictionFilter] = useState<'ALL' | StateRegistryJurisdiction>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgencyId, setSelectedAgencyId] = useState<RegulatorAgencyTarget['id']>('CPPA');
  const [selectedBrokerIds, setSelectedBrokerIds] = useState<string[]>([]);
  const [generatedPacket, setGeneratedPacket] = useState<RegulatorComplaintPacket | null>(null);
  const [isGeneratingPacket, setIsGeneratingPacket] = useState(false);
  const [packetCopied, setPacketCopied] = useState(false);
  const [gpcAudits, setGpcAudits] = useState<Record<string, GpcAuditResult>>({});

  const synchronizedRegistry = useMemo(() => getSynchronizedStateBrokerRegistry(), []);
  const resultsByBrokerId = useMemo(
    () => new Map(results.map((r) => [r.brokerId, r])),
    [results]
  );

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return synchronizedRegistry.filter((rec) => {
      if (jurisdictionFilter !== 'ALL' && !rec.registries.includes(jurisdictionFilter)) {
        return false;
      }
      if (!q) return true;
      return (
        rec.broker.name.toLowerCase().includes(q) ||
        rec.broker.domain.toLowerCase().includes(q) ||
        rec.cppaRegistrationCode.toLowerCase().includes(q)
      );
    });
  }, [synchronizedRegistry, jurisdictionFilter, searchQuery]);

  const toggleSelectBroker = (brokerId: string) => {
    setSelectedBrokerIds((prev) =>
      prev.includes(brokerId) ? prev.filter((id) => id !== brokerId) : [...prev, brokerId]
    );
  };

  const handleAuditBrokerGpc = async (broker: DataBroker) => {
    setGpcAudits((prev) => ({ ...prev, [broker.id]: { loading: true } }));
    try {
      const res = await sessionFetch('/api/registries/audit-broker-gpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: broker.domain,
          optOutUrl: broker.optOutUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setGpcAudits((prev) => ({
        ...prev,
        [broker.id]: {
          loading: false,
          gpcWellKnownSupported: Boolean(data.gpcWellKnownSupported),
          portalReachable: Boolean(data.portalReachable),
          portalHttpStatus: data.portalHttpStatus,
          complianceSummary: data.complianceSummary || 'Audit completed.',
        },
      }));
    } catch {
      setGpcAudits((prev) => ({
        ...prev,
        [broker.id]: {
          loading: false,
          complianceSummary: 'Live compliance probe failed.',
        },
      }));
    }
  };

  const handleBuildComplaintPacket = async () => {
    setIsGeneratingPacket(true);
    try {
      const pkt = await generateRegulatorComplaintPacket({
        agencyId: selectedAgencyId,
        profile,
        results,
        selectedBrokerIds: selectedBrokerIds.length > 0 ? selectedBrokerIds : undefined,
        senderEmail: activeConnectedEmail || undefined,
      });
      setGeneratedPacket(pkt);
    } finally {
      setIsGeneratingPacket(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Header & Regulator Packet Builder */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
              <span className="text-emerald-400 font-medium">State Data Broker Registries</span>
              <span aria-hidden="true">·</span>
              <span>{synchronizedRegistry.length} Registered Entities</span>
              <span aria-hidden="true">·</span>
              <span>CA CPPA · TX Ch. 509 · OR DCBS · VT SOS</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight [text-wrap:balance]">
              Statutory Registry Sync &amp; Regulator Enforcement Packets
            </h1>
            <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
              Cross-references commercial brokers against California Delete Act (CPPA), Texas, Oregon,
              and Vermont registries, audits Global Privacy Control (<code className="text-emerald-300">Sec-GPC: 1</code>)
              readiness, and compiles SHA-256 chain-of-custody enforcement packets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <select
              value={selectedAgencyId}
              onChange={(e) => setSelectedAgencyId(e.target.value as RegulatorAgencyTarget['id'])}
              className="glass-input rounded-xl px-3.5 py-2.5 text-xs text-slate-200 cursor-pointer"
            >
              {REGULATOR_AGENCIES.map((ag) => (
                <option key={ag.id} value={ag.id} className="bg-slate-950 text-white">
                  {ag.shortLabel}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleBuildComplaintPacket}
              disabled={isGeneratingPacket}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap tabular-nums"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>
                {isGeneratingPacket
                  ? 'Building Packet...'
                  : selectedBrokerIds.length > 0
                  ? `Generate Packet (${selectedBrokerIds.length} Selected)`
                  : 'Generate Regulator Packet'}
              </span>
            </button>
          </div>
        </div>

        {/* Generated Enforcement Dossier Preview */}
        {generatedPacket && (
          <div className="glass-subtle rounded-2xl p-5 space-y-4 border border-emerald-400/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                  <span className="text-emerald-300">{generatedPacket.packetId}</span>
                  <span aria-hidden="true">·</span>
                  <span>SHA-256 {generatedPacket.manifest.manifestSha256.slice(0, 16)}…</span>
                  <span aria-hidden="true">·</span>
                  <span>{generatedPacket.targetBrokers.length} Respondent(s)</span>
                </div>
                <h2 className="text-sm font-semibold text-white">
                  {generatedPacket.agency.name}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await copyTextToClipboard(generatedPacket.formalComplaintText);
                    setPacketCopied(true);
                    setTimeout(() => setPacketCopied(false), 2000);
                  }}
                  className="px-3 py-1.5 rounded-lg glass-card text-xs text-slate-200 hover:text-white inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {packetCopied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{packetCopied ? 'Copied Narrative' : 'Copy Narrative'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    downloadFile(
                      generatedPacket.markdownDossier,
                      `${generatedPacket.packetId.toLowerCase()}.md`,
                      'text/markdown;charset=utf-8'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg glass-card text-xs text-slate-200 hover:text-white inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .MD</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    downloadFile(
                      generatedPacket.jsonPayload,
                      `${generatedPacket.packetId.toLowerCase()}-evidence.json`,
                      'application/json;charset=utf-8'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg glass-card text-xs text-slate-200 hover:text-white inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>JSON Manifest</span>
                </button>

                <a
                  href={generatedPacket.agency.filingPortalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span>Open {generatedPacket.agency.shortLabel} Portal</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <pre className="max-h-56 overflow-y-auto rounded-xl bg-slate-950/70 border border-white/[0.06] p-4 text-[11px] text-slate-300 font-mono whitespace-pre-wrap">
              {generatedPacket.formalComplaintText}
            </pre>
          </div>
        )}
      </div>

      {/* Filter & Jurisdiction Segmented Controls */}
      <div className="glass-panel rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-950/60 border border-white/[0.06]">
          {(
            [
              { id: 'ALL', label: 'All Registries' },
              { id: 'CA_CPPA', label: 'California CPPA' },
              { id: 'TX_SOS', label: 'Texas Ch. 509' },
              { id: 'OR_DCBS', label: 'Oregon DCBS' },
              { id: 'VT_SOS', label: 'Vermont SOS' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setJurisdictionFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                jurisdictionFilter === tab.id
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by broker, domain, or CPPA ID..."
            className="w-full glass-input rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500"
          />
        </div>
      </div>

      {/* High-Density Glassmorphic Registry Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] text-slate-400 font-medium">
                <th className="py-3.5 px-4 w-10">Select</th>
                <th className="py-3.5 px-4">Registered Data Broker</th>
                <th className="py-3.5 px-4">Registry Filings</th>
                <th className="py-3.5 px-4">Adapter &amp; GPC Audit</th>
                <th className="py-3.5 px-4">Queue / SLA</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filteredRecords.map((rec) => {
                const scanItem = resultsByBrokerId.get(rec.broker.id);
                const sla = scanItem ? computeBrokerSlaStatus(scanItem) : null;
                const playbook = resolveBrokerPlaybook(rec.broker.domain);
                const gpc = gpcAudits[rec.broker.id];
                const isSelected = selectedBrokerIds.includes(rec.broker.id);

                return (
                  <tr
                    key={rec.broker.id}
                    className="hover:bg-white/[0.025] transition-colors"
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectBroker(rec.broker.id)}
                        aria-label={`Select ${rec.broker.name} for regulator complaint packet`}
                        className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500/40 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{rec.broker.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                        {rec.broker.domain} · {rec.cppaRegistrationCode}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-300 tabular-nums">
                      <div>{rec.registries.join(' · ').replace(/_/g, ' ')}</div>
                      <div className="text-[11px] text-slate-500">{rec.txFilingStatus}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-300">
                        {playbook ? (
                          <span className="text-emerald-300 font-medium inline-flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                            <span>Dedicated Multi-Step Playbook</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">Semantic DOM Mapper</span>
                        )}
                      </div>
                      {gpc?.complianceSummary && (
                        <div className="text-[11px] text-slate-400 mt-0.5 max-w-xs">
                          {gpc.complianceSummary}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-[11px]">
                      {scanItem ? (
                        <span
                          className={
                            scanItem.removalStatus === 'removed'
                              ? 'text-emerald-400'
                              : sla?.state === 'overdue'
                              ? 'text-rose-400'
                              : scanItem.removalStatus === 'submitted'
                              ? 'text-amber-300'
                              : 'text-slate-300'
                          }
                        >
                          {scanItem.removalStatus === 'removed'
                            ? 'Purged'
                            : scanItem.removalStatus === 'submitted'
                            ? `Submitted (${sla?.daysRemaining ?? 45}d left)`
                            : 'Exposed'}
                        </span>
                      ) : (
                        <span className="text-slate-500">Not Scanned</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAuditBrokerGpc(rec.broker)}
                          disabled={gpc?.loading}
                          className="px-2.5 py-1.5 rounded-lg glass-subtle hover:border-white/20 text-slate-300 hover:text-white inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          title="Audit live opt-out portal & .well-known/gpc.json"
                        >
                          <RefreshCw
                            className={`w-3 h-3 ${gpc?.loading ? 'animate-spin' : ''}`}
                          />
                          <span>Audit GPC</span>
                        </button>

                        {onOpenWebFormWorkbench && (
                          <button
                            type="button"
                            onClick={() => onOpenWebFormWorkbench(rec.broker)}
                            className="px-2.5 py-1.5 rounded-lg glass-subtle hover:border-emerald-400/30 text-emerald-300 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <FileCode2 className="w-3 h-3" />
                            <span>Form</span>
                          </button>
                        )}

                        {onSendBrokerOptOut && (
                          <button
                            type="button"
                            onClick={() => onSendBrokerOptOut(rec.broker)}
                            className="px-2.5 py-1.5 rounded-lg glass-subtle hover:border-white/20 text-slate-200 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <Send className="w-3 h-3" />
                            <span>Demand</span>
                          </button>
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
