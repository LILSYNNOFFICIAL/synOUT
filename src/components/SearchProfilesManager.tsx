import React, { useState, useEffect } from 'react';
import { 
  StoredSearchProfile, 
  MAX_STORED_SEARCHES, 
  getSavedSearches, 
  deleteSearchProfile 
} from '../utils/searchProfiles';
import { 
  Layers, 
  Trash2, 
  PlusCircle, 
  AlertTriangle, 
  Search,
  ChevronRight
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
    <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Search Profiles Engine
            </span>
            <span className="text-xs font-mono text-slate-400">
              {searches.length} of {MAX_STORED_SEARCHES} Quota Used
            </span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Multi-Type Search Memory (10 Search Slots)</h2>
          <p className="text-xs text-slate-400">
            synOUT allows up to 10 distinct search vectors to be actively tracked simultaneously before requiring profile deletion.
          </p>
        </div>

        <button
          onClick={onInitiateNewSearch}
          disabled={isFull}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg ${
            isFull
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          {isFull ? 'Slot Limit Reached (Delete One First)' : 'New Search Type'}
        </button>
      </div>

      {isFull && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>Search Profile Limit Reached (10/10):</strong> The system mandates deleting an existing search profile before a new search type can be initiated.
          </span>
        </div>
      )}

      {searches.length === 0 ? (
        <div className="p-8 text-center bg-slate-950 rounded-2xl border border-slate-800/80 space-y-2">
          <Search className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-xs text-slate-400">No stored search sessions yet.</p>
          <p className="text-[11px] text-slate-500">Run a scan to save results into one of your 10 active search slots.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {searches.map((s) => (
            <div
              key={s.id}
              onClick={() => onSelectProfile(s)}
              className="p-4 bg-slate-950 hover:bg-slate-800/60 border border-slate-800 rounded-2xl transition-all cursor-pointer flex items-center justify-between gap-3 group"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700 truncate">
                    {s.typeLabel}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">{s.timestamp}</span>
                </div>
                <h3 className="text-sm font-bold text-white truncate">{s.name}</h3>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="text-rose-400 font-semibold">{s.exposedCount} Exposed</span>
                  <span>/</span>
                  <span>{s.totalScanned} Scanned</span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={(e) => handleDelete(s.id, e)}
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  title="Delete search profile to free up slot"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
