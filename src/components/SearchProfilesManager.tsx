import React, { useState, useEffect } from 'react';
import {
  StoredSearchProfile,
  MAX_STORED_SEARCHES,
  getSavedSearches,
  deleteSearchProfile,
} from '../utils/searchProfiles';
import {
  Trash2,
  PlusCircle,
  AlertTriangle,
  Search,
  ChevronRight,
} from 'lucide-react';

interface SearchProfilesManagerProps {
  onSelectProfile: (profile: StoredSearchProfile) => void;
  onInitiateNewSearch: () => void;
}

export const SearchProfilesManager: React.FC<SearchProfilesManagerProps> = ({
  onSelectProfile,
  onInitiateNewSearch,
}) => {
  const [searches, setSearches] = useState<StoredSearchProfile[]>([]);

  useEffect(() => {
    setSearches(getSavedSearches());
  }, []);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = deleteSearchProfile(id);
    setSearches(updated);
  };

  const isFull = searches.length >= MAX_STORED_SEARCHES;

  return (
    <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400 tabular-nums">
            <span className="text-emerald-400 font-semibold">Saved Search Vectors</span>
            <span aria-hidden="true">·</span>
            <span>
              {searches.length} of {MAX_STORED_SEARCHES} Slots Active
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Multi-Type Search Memory ({MAX_STORED_SEARCHES} Slots)
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Store up to 10 distinct identity search vectors simultaneously and switch between saved exposure audits at any time.
          </p>
        </div>

        <button
          onClick={onInitiateNewSearch}
          disabled={isFull}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
            isFull
              ? 'glass-subtle text-slate-500 cursor-not-allowed'
              : 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          <span>{isFull ? 'Slot Limit Reached (Delete One First)' : 'New Search Vector'}</span>
        </button>
      </div>

      {isFull && (
        <div className="p-4 glass-subtle border-amber-500/30 rounded-xl text-amber-200 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Search Profile Limit Reached (10/10):</strong> Delete an existing search slot below before starting a new search vector.
          </span>
        </div>
      )}

      {searches.length === 0 ? (
        <div className="p-10 text-center glass-subtle rounded-xl space-y-2">
          <Search className="w-7 h-7 text-slate-500 mx-auto" />
          <p className="text-xs text-slate-300 font-medium">No stored search sessions yet.</p>
          <p className="text-xs text-slate-500">
            Run an exposure audit to save results into one of your 10 active search slots.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 tabular-nums">
          {searches.map((s) => (
            <div
              key={s.id}
              onClick={() => onSelectProfile(s)}
              className="p-4 glass-card rounded-xl cursor-pointer flex items-center justify-between gap-3 group"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-slate-400">
                  <span className="text-emerald-400 font-medium truncate">{s.typeLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-500">{s.timestamp}</span>
                </div>
                <h3 className="text-sm font-semibold text-white truncate">{s.name}</h3>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="text-rose-400 font-medium">{s.exposedCount} Exposed</span>
                  <span aria-hidden="true">·</span>
                  <span>{s.totalScanned} Scanned</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => handleDelete(s.id, e)}
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  title="Delete search profile to free up slot"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
