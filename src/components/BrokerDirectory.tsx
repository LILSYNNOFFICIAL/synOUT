import React, { useState } from 'react';
import { DataBroker, ScanResult } from '../types';
import { getExhaustiveBrokerRegistry } from '../utils/dynamicBrokerRegistry';
import { hasVerifiedEmailReceipt } from '../services/emailConnectionStore';
import {
  resolveBrokerContactProfile,
  useBrokerContactOverrides,
} from '../utils/brokerContactResolver';
import { hasWebFormSubmission } from '../utils/optOutFormEngine';
import { resolveBrokerPlaybook } from '../utils/brokerAdapterCatalog';
import {
  Search,
  ExternalLink,
  Clock,
  Mail,
  Send,
  CheckCircle2,
  Flame,
  FileCode2,
  Bot,
} from 'lucide-react';

interface BrokerDirectoryProps {
  scanResults?: ScanResult[];
  onSendBrokerOptOut?: (broker: DataBroker) => void;
  onOpenNukeAll?: () => void;
  onOpenWebFormWorkbench?: (broker?: DataBroker) => void;
}

export const BrokerDirectory: React.FC<BrokerDirectoryProps> = ({
  scanResults = [],
  onSendBrokerOptOut,
  onOpenNukeAll,
  onOpenWebFormWorkbench,
}) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [risk, setRisk] = useState('all');
  const overrides = useBrokerContactOverrides();

  const registry = getExhaustiveBrokerRegistry();

  const filtered = registry.filter((b) => {
    const q = search.toLowerCase();
    const contact = resolveBrokerContactProfile(b, overrides);
    const matchesSearch =
      b.name.toLowerCase().includes(q) ||
      b.domain.toLowerCase().includes(q) ||
      (contact.effectivePrimaryEmail && contact.effectivePrimaryEmail.toLowerCase().includes(q)) ||
      (b.parentEntity && b.parentEntity.toLowerCase().includes(q)) ||
      b.dataExposedList.some((d) => d.toLowerCase().includes(q));

    const matchesCat = category === 'all' || b.category === category;
    const matchesRisk = risk === 'all' || b.risk === risk;

    return matchesSearch && matchesCat && matchesRisk;
  });

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Glassmorphic Header */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
            <span className="text-emerald-400 font-medium">Verified Registry</span>
            <span aria-hidden="true">·</span>
            <span>{registry.length} Clearinghouses Indexed</span>
            <span aria-hidden="true">·</span>
            <span>Showing {filtered.length}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight tabular-nums">
            Verified Data Broker Directory ({registry.length} Indexed)
          </h1>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            Search verified people-search aggregators, B2B intelligence networks, and public-record
            clearinghouses. Launch dedicated multi-step Playwright form playbooks or send statutory
            deletion demands directly.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onOpenWebFormWorkbench && (
            <button
              type="button"
              onClick={() => onOpenWebFormWorkbench()}
              className="px-4 py-2.5 rounded-xl glass-subtle hover:border-emerald-400/35 text-emerald-300 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileCode2 className="w-4 h-4 text-emerald-400" />
              <span>Web-Form Runner</span>
            </button>
          )}
          {onOpenNukeAll && (
            <button
              type="button"
              onClick={onOpenNukeAll}
              className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white border border-red-400/30 text-xs font-bold inline-flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition-colors cursor-pointer shrink-0 whitespace-nowrap tabular-nums"
            >
              <Flame className="w-4 h-4" />
              <span>NUKE ALL ({registry.length} Brokers)</span>
            </button>
          )}
        </div>
      </div>

      {/* Glassmorphic Filter Bar */}
      <div className="glass-panel rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="relative max-w-md w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search brokers by name, domain, or privacy email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full glass-input rounded-xl pl-10 pr-3.5 py-2 text-white placeholder-slate-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="glass-input rounded-xl px-3 py-2 text-slate-300 cursor-pointer"
          >
            <option value="all" className="bg-slate-950">All Categories</option>
            <option value="People Search" className="bg-slate-950">People Search</option>
            <option value="Financial & Credit Marketing" className="bg-slate-950">Financial &amp; Credit</option>
            <option value="Real Estate & Property" className="bg-slate-950">Property &amp; Deeds</option>
            <option value="Arrest & Court Records" className="bg-slate-950">Court Records</option>
            <option value="Marketing & Advertising" className="bg-slate-950">Marketing &amp; Ad Networks</option>
          </select>

          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            className="glass-input rounded-xl px-3 py-2 text-slate-300 cursor-pointer"
          >
            <option value="all" className="bg-slate-950">All Risks</option>
            <option value="Critical" className="bg-slate-950">Critical</option>
            <option value="High" className="bg-slate-950">High</option>
            <option value="Medium" className="bg-slate-950">Medium</option>
          </select>
        </div>
      </div>

      {/* Empty Search State */}
      {filtered.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-white">No matching brokers found</p>
          <p className="text-xs text-slate-400">
            Adjust your search query or clear category and risk filters to view all indexed clearinghouses.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setCategory('all');
              setRisk('all');
            }}
            className="mt-2 px-4 py-2 rounded-xl glass-subtle text-xs font-medium text-white cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((broker) => {
            const existingResult = scanResults.find((r) => r.brokerId === broker.id);
            const emailSent = existingResult ? hasVerifiedEmailReceipt(existingResult) : false;
            const formSent = existingResult ? hasWebFormSubmission(existingResult) : false;
            const contact = resolveBrokerContactProfile(broker, overrides);
            const playbook = resolveBrokerPlaybook(broker.domain);

            return (
              <div
                key={broker.id}
                className="glass-card rounded-2xl p-5 space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Unboxed metadata line */}
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                    <span className="text-slate-400 truncate">
                      {broker.category} · {broker.removalMethod}
                    </span>
                    <span
                      className={`font-semibold shrink-0 ${
                        broker.risk === 'Critical'
                          ? 'text-rose-400'
                          : broker.risk === 'High'
                          ? 'text-amber-400'
                          : 'text-sky-400'
                      }`}
                    >
                      {broker.risk}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white">{broker.name}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 font-mono mt-0.5">
                      <span>{broker.domain}</span>
                      {contact.effectivePrimaryEmail && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-300 truncate">
                            {contact.effectivePrimaryEmail}
                          </span>
                        </>
                      )}
                    </div>
                    {playbook && (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 mt-1">
                        <Bot className="w-3.5 h-3.5 shrink-0" />
                        <span>Multi-Step Playbook Ready</span>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                    {broker.overview}
                  </p>

                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    <span className="text-slate-500">Exposed: </span>
                    <span className="text-slate-300">{broker.dataExposedList.join(' · ')}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/[0.06] space-y-2.5 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{broker.removalTime}</span>
                    </span>
                    {(emailSent || formSent) && (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {emailSent && formSent
                            ? 'Form + Email Sent'
                            : formSent
                            ? 'Form Submitted'
                            : 'Demand Sent'}
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={contact.optOutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-2 rounded-xl glass-subtle hover:border-white/20 text-slate-300 font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                    >
                      <span>Portal</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>

                    {onOpenWebFormWorkbench && (
                      <button
                        type="button"
                        onClick={() => onOpenWebFormWorkbench(broker)}
                        className="px-2.5 py-2 rounded-xl glass-subtle hover:border-emerald-400/35 text-emerald-300 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                        title="Open Autonomous Web-Form Runner"
                      >
                        <FileCode2 className="w-3.5 h-3.5" />
                        <span>Form</span>
                      </button>
                    )}

                    {broker.privacyEmail && onSendBrokerOptOut && (
                      <button
                        type="button"
                        onClick={() => onSendBrokerOptOut(broker)}
                        className="flex-1 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {emailSent ? (
                          <>
                            <Mail className="w-3.5 h-3.5" />
                            <span>Re-Send Email</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>Send Opt-Out Email</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
