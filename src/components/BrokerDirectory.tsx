import React, { useState } from 'react';
import { DataBroker, ScanResult } from '../types';
import { getExhaustiveBrokerRegistry } from '../utils/dynamicBrokerRegistry';
import { hasVerifiedEmailReceipt } from '../services/emailConnectionStore';
import {
  Search,
  ExternalLink,
  Clock,
  Mail,
  Send,
  CheckCircle2,
} from 'lucide-react';

interface BrokerDirectoryProps {
  scanResults?: ScanResult[];
  onSendBrokerOptOut?: (broker: DataBroker) => void;
}

export const BrokerDirectory: React.FC<BrokerDirectoryProps> = ({
  scanResults = [],
  onSendBrokerOptOut,
}) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [risk, setRisk] = useState('all');

  const registry = getExhaustiveBrokerRegistry();

  const filtered = registry.filter((b) => {
    const q = search.toLowerCase();
    const matchesSearch =
      b.name.toLowerCase().includes(q) ||
      b.domain.toLowerCase().includes(q) ||
      (b.privacyEmail && b.privacyEmail.toLowerCase().includes(q)) ||
      b.dataExposedList.some((d) => d.toLowerCase().includes(q));

    const matchesCat = category === 'all' || b.category === category;
    const matchesRisk = risk === 'all' || b.risk === risk;

    return matchesSearch && matchesCat && matchesRisk;
  });

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-6">
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="text-emerald-400 font-semibold">Verified Registry</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{registry.length} Active Clearinghouses Indexed</span>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            Showing {filtered.length} of {registry.length}
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          700+ Data Broker &amp; Clearinghouse Directory
        </h1>
        <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
          Search our catalog of commercial data brokers, advertising aggregators, and public record indexes. Send a statutory CCPA/CPRA opt-out demand directly from your connected email or open the broker&apos;s official suppression portal.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 max-w-md w-full">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search brokers by name, domain, or privacy email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="People Search">People Search</option>
            <option value="Financial & Credit Marketing">Financial &amp; Credit</option>
            <option value="Real Estate & Property">Property &amp; Deeds</option>
            <option value="Arrest & Court Records">Court Records</option>
            <option value="Marketing & Advertising">Marketing &amp; Ad Networks</option>
          </select>

          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="all">All Risks</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
          </select>
        </div>
      </div>

      {/* Empty Search State */}
      {filtered.length === 0 ? (
        <div className="p-10 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-2">
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
            className="mt-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((broker) => {
            const existingResult = scanResults.find((r) => r.brokerId === broker.id);
            const emailSent = existingResult ? hasVerifiedEmailReceipt(existingResult) : false;

            return (
              <div
                key={broker.id}
                className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 hover:border-slate-700 transition-colors flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Unboxed metadata kicker */}
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                    <span className="text-slate-400 truncate">{broker.category}</span>
                    <span
                      className={`font-semibold shrink-0 ${
                        broker.risk === 'Critical'
                          ? 'text-rose-400'
                          : broker.risk === 'High'
                          ? 'text-amber-400'
                          : 'text-sky-400'
                      }`}
                    >
                      {broker.risk} Risk
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white">{broker.name}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-mono mt-0.5">
                      <span>{broker.domain}</span>
                      {broker.privacyEmail && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-400 truncate">{broker.privacyEmail}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{broker.overview}</p>

                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    <span className="text-slate-500 font-medium">Exposed PII: </span>
                    <span className="text-slate-300">{broker.dataExposedList.join(' · ')}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{broker.removalTime}</span>
                    </span>
                    {emailSent && (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Demand Sent</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={broker.optOutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <span>Portal</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>

                    {broker.privacyEmail && onSendBrokerOptOut && (
                      <button
                        type="button"
                        onClick={() => onSendBrokerOptOut(broker)}
                        className="flex-1 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
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
