import React, { useState } from 'react';
import { DATA_BROKERS } from '../data/brokers';
import { getExhaustiveBrokerRegistry } from '../utils/dynamicBrokerRegistry';
import { 
  Building2, 
  Search, 
  ExternalLink, 
  Shield, 
  Clock, 
  Mail, 
  Filter, 
  ChevronRight 
} from 'lucide-react';

export const BrokerDirectory: React.FC = () => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [risk, setRisk] = useState('all');

  const registry = getExhaustiveBrokerRegistry();

  const filtered = registry.filter((b) => {
    const matchesSearch =
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.domain.toLowerCase().includes(search.toLowerCase()) ||
      b.dataExposedList.some((d) => d.toLowerCase().includes(search.toLowerCase()));

    const matchesCat = category === 'all' || b.category === category;
    const matchesRisk = risk === 'all' || b.risk === risk;

    return matchesSearch && matchesCat && matchesRisk;
  });

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-6">
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          700+ Data Broker & Clearinghouse Directory
        </h1>
        <p className="text-xs text-slate-400 max-w-3xl">
          Search our catalog of commercial data brokers, advertising aggregators, and public record indexes with verified official opt-out procedures.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 max-w-sm w-full">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search brokers by name or domain..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-white placeholder-slate-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="People Search">People Search</option>
            <option value="Financial & Credit Marketing">Financial & Credit</option>
            <option value="Real Estate & Property">Property & Deeds</option>
            <option value="Arrest & Court Records">Court Records</option>
            <option value="Marketing & Advertising">Marketing & Ad Networks</option>
          </select>

          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="all">All Risks</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((broker) => (
          <div
            key={broker.id}
            className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                    {broker.category}
                  </span>
                  <h3 className="text-base font-bold text-white mt-1.5">{broker.name}</h3>
                  <p className="text-xs text-slate-500 font-mono">{broker.domain}</p>
                </div>

                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    broker.risk === 'Critical'
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}
                >
                  {broker.risk} Risk
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{broker.overview}</p>

              <div className="space-y-1">
                <span className="text-[11px] text-slate-400 font-medium">Exposed PII:</span>
                <div className="flex flex-wrap gap-1">
                  {broker.dataExposedList.map((d, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md bg-slate-950 text-[10px] font-medium text-slate-300 border border-slate-800"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {broker.removalTime}
              </span>

              <a
                href={broker.optOutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 font-semibold flex items-center gap-1 transition-colors"
              >
                Opt-Out Procedure
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
