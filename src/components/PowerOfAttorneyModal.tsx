import React, { useState } from 'react';
import { UserProfile, PowerOfAttorneyData } from '../types';
import { X, FileCheck } from 'lucide-react';

interface PowerOfAttorneyModalProps {
  profile: UserProfile | null;
  onClose: () => void;
  onSavePOA: (
    poa: PowerOfAttorneyData,
    fallbackIdentity?: { fullName: string; city: string; state: string }
  ) => void;
}

export const PowerOfAttorneyModal: React.FC<PowerOfAttorneyModalProps> = ({
  profile,
  onClose,
  onSavePOA,
}) => {
  const initialName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : '';
  const [signature, setSignature] = useState(initialName);
  const [city, setCity] = useState(profile?.currentCity || 'Sacramento');
  const [stateCode, setStateCode] = useState(profile?.currentState || 'CA');
  const [agreed, setAgreed] = useState(false);

  const authCode = `POA-SYN-${Date.now().toString().slice(-6)}`;
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handleSign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed || !signature.trim()) return;

    const cleanName = signature.trim();
    const cleanCity = city.trim() || 'Sacramento';
    const cleanState = stateCode.trim().toUpperCase() || 'CA';

    const poa: PowerOfAttorneyData = {
      fullName: cleanName,
      address: `${cleanCity}, ${cleanState}`,
      state: cleanState,
      signedDate: currentDate,
      isSigned: true,
      authCode,
      agentName: 'synOUT Privacy Automation Representative',
      scopeOfAuthority:
        'Limited authorization strictly to exercise consumer data opt-out, deletion, and suppression rights under CCPA/CPRA, TDPSA, VCDPA, and federal privacy statutes.',
    };

    onSavePOA(poa, { fullName: cleanName, city: cleanCity, state: cleanState });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-popover rounded-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative my-8">
        <div className="flex items-start justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl glass-subtle text-emerald-400 flex items-center justify-center shrink-0">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Limited Power of Attorney Designation
              </h2>
              <p className="text-xs text-slate-400">
                Authorized Agent Model · CCPA § 1798.130 &amp; Cal. Code Regs. tit. 11 § 7063
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 glass-subtle rounded-xl text-xs text-slate-300 space-y-3 leading-relaxed">
          <p>
            <strong>Appointment of Authorized Agent:</strong> I, the undersigned consumer, hereby designate <strong>synOUT</strong> to transmit statutory data deletion, opt-out of sale/sharing, and suppression demands to commercial data brokers, people-search clearinghouses, and ad-tech syndicates on my behalf.
          </p>
          <p className="text-[11px] text-slate-400">
            <strong>Limitation of Power:</strong> This authorization is strictly limited to statutory privacy compliance and appends your signed verification code to outbound legal demands. It confers zero authority over financial accounts, medical files, or contractual obligations.
          </p>
        </div>

        <form onSubmit={handleSign} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="text-slate-300 font-medium">Digital Signature (Full Legal Name)</label>
            <input
              type="text"
              required
              placeholder="e.g. Jane Doe"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              className="w-full glass-input rounded-xl px-3.5 py-2.5 text-white font-mono placeholder-slate-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-slate-300 font-medium">Primary City</label>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full glass-input rounded-xl px-3.5 py-2 text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-300 font-medium">State (2-Letter)</label>
              <input
                type="text"
                required
                maxLength={2}
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value.toUpperCase())}
                className="w-full glass-input rounded-xl px-3.5 py-2 text-white font-mono uppercase"
              />
            </div>
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
              I declare under penalty of perjury that I am the consumer named above and authorize synOUT to include this signed representation notice in my data removal demands.
            </span>
          </label>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 font-semibold text-slate-400 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!agreed || !signature.trim()}
              className="px-6 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 text-slate-950 font-semibold cursor-pointer whitespace-nowrap"
            >
              Sign &amp; Authorize Agent
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
