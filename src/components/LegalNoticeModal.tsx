import React, { useState } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import { X, Copy, Check, Sparkles, Send, FileText, RotateCcw } from 'lucide-react';

interface LegalNoticeModalProps {
  broker: DataBroker;
  result: ScanResult;
  profile: UserProfile;
  onClose: () => void;
  onMarkSubmitted: (brokerId: string) => void;
}

export const LegalNoticeModal: React.FC<LegalNoticeModalProps> = ({
  broker,
  result,
  profile,
  onClose,
  onMarkSubmitted,
}) => {
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [letterContent, setLetterContent] = useState<string>(() => {
    return `DATE: ${new Date().toLocaleDateString()}
TO: Privacy Officer / Compliance Department, ${broker.name} (${broker.domain})
RE: FORMAL STATUTORY DATA SUPPRESSION & DELETION NOTICE

Pursuant to the California Consumer Privacy Act (Cal. Civ. Code § 1798.105) and applicable state data privacy laws, I hereby demand immediate deletion and suppression of all personal records relating to:

Name: ${profile.firstName} ${profile.lastName}
Location: ${profile.currentCity}, ${profile.currentState}
Phone: ${profile.phoneNumbers[0] || 'On record'}
Email: ${profile.emails[0] || 'On record'}

Please confirm permanent removal within statutory timelines (45 calendar days).

Sincerely,
${profile.firstName} ${profile.lastName}`;
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(letterContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAiRefine = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: `${profile.firstName} ${profile.lastName}`,
          userEmail: profile.emails[0] || '',
          userPhone: profile.phoneNumbers[0] || '',
          userCity: profile.currentCity,
          userState: profile.currentState,
          brokerName: broker.name,
          brokerDomain: broker.domain,
          statute: profile.currentState === 'TX' ? 'TDPSA' : 'CCPA',
          exposedData: broker.dataExposedList,
        }),
      });
      const data = await res.json();
      if (data.letter) {
        setLetterContent(data.letter);
      }
    } catch {
      // Fallback remains
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative my-8">
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
              CCPA / CPRA / TDPSA Legal Demand
            </span>
            <h2 className="text-xl font-bold text-white mt-1.5">Custom Deletion Letter: {broker.name}</h2>
            <p className="text-xs text-slate-500">Official recipient: {broker.privacyEmail}</p>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={handleAiRefine}
            disabled={isGenerating}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-400 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            {isGenerating ? 'Drafting Statutory Clause...' : 'Refine with Legal AI'}
          </button>

          <button
            onClick={handleCopy}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy Notice'}
          </button>
        </div>

        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed select-text">
          {letterContent}
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer">
            Close
          </button>
          <button
            onClick={() => {
              onMarkSubmitted(broker.id);
              onClose();
            }}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 cursor-pointer"
          >
            Mark Dispatched to Broker
          </button>
        </div>
      </div>
    </div>
  );
};
