import React, { useState } from 'react';
import { UserProfile, PowerOfAttorneyData } from '../types';
import { X, ShieldCheck, FileCheck, Check, Sparkles, AlertCircle } from 'lucide-react';

interface PowerOfAttorneyModalProps {
  profile: UserProfile;
  onClose: () => void;
  onSavePOA: (poa: PowerOfAttorneyData) => void;
}

export const PowerOfAttorneyModal: React.FC<PowerOfAttorneyModalProps> = ({
  profile,
  onClose,
  onSavePOA,
}) => {
  const [signature, setSignature] = useState(`${profile.firstName} ${profile.lastName}`);
  const [agreed, setAgreed] = useState(false);

  const authCode = `POA-SYN-${Date.now().toString().slice(-6)}`;
  const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const handleSign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) return;

    const poa: PowerOfAttorneyData = {
      fullName: signature.trim(),
      address: `${profile.currentCity}, ${profile.currentState}`,
      state: profile.currentState,
      signedDate: currentDate,
      isSigned: true,
      authCode,
      agentName: 'synOUT Privacy Automation Representative',
      scopeOfAuthority: 'Limited authorization strictly to exercise consumer data opt-out, deletion, and suppression rights under CCPA/CPRA, TDPSA, VCDPA, and federal privacy statutes.',
    };

    onSavePOA(poa);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative my-8">
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Limited Power of Attorney Designation</h2>
              <p className="text-xs text-slate-400">Authorized Agent Model (CCPA § 1798.130 & Cal. Code Regs. § 7063)</p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs text-slate-300 space-y-3 leading-relaxed">
          <p>
            <strong>APPOINTMENT OF AUTHORIZED AGENT:</strong> I, the undersigned consumer, hereby appoint <strong>synOUT Privacy Technologies</strong> as my Authorized Representative solely for the limited purpose of submitting data deletion, opt-out of sale, and suppression demands to third-party data brokers, commercial aggregators, and people search directories.
          </p>
          <p className="text-[11px] text-slate-400">
            <strong>LIMITATION OF POWER:</strong> This authorization is strictly limited to statutory privacy compliance. The agent possesses zero power over financial assets, medical records, or contractual liabilities.
          </p>
        </div>

        <form onSubmit={handleSign} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="text-slate-400 font-medium">Digital Signature (Full Legal Name):</label>
            <input
              type="text"
              required
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              required
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 rounded border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
            />
            <span>
              I declare under penalty of perjury that I am the consumer named above and authorize synOUT to submit data removal requests on my behalf.
            </span>
          </label>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button type="button" onClick={onClose} className="px-4 py-2 font-semibold text-slate-400 hover:text-white cursor-pointer">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!agreed}
              className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              Sign & Authorize Agent
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
