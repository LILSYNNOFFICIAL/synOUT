import React, { useState } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import { X, Copy, Check, ExternalLink, CheckCircle, Shield, Mail, Phone, FileText, AlertCircle } from 'lucide-react';

interface DiyOptOutAssistantModalProps {
  broker: DataBroker;
  result: ScanResult;
  profile: UserProfile;
  onClose: () => void;
  onMarkSubmitted: (brokerId: string) => void;
}

export const DiyOptOutAssistantModal: React.FC<DiyOptOutAssistantModalProps> = ({
  broker,
  result,
  profile,
  onClose,
  onMarkSubmitted,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const fullName = `${profile.firstName} ${profile.lastName}`;
  const primaryEmail = profile.emails[0] || '';
  const primaryPhone = profile.phoneNumbers[0] || '';
  const location = `${profile.currentCity}, ${profile.currentState} ${profile.currentZip || ''}`.trim();
  const profileUrl = result.mockListingData.profiles[0] || `https://${broker.domain}`;

  const emailSubject = encodeURIComponent(`Formal Data Deletion & Opt-Out Request - ${fullName}`);
  const emailBody = encodeURIComponent(
    `TO: Privacy Officer, ${broker.name}\n\n` +
    `I am writing to exercise my rights to delete my personal information and opt out of any sale, sharing, or processing of my data pursuant to applicable privacy legislation (including CCPA § 1798.105 & § 1798.120).\n\n` +
    `IDENTIFYING INFORMATION FOR SUPPRESSION:\n` +
    `- Full Legal Name: ${fullName}\n` +
    `- Primary Jurisdiction: ${location}\n` +
    `- Primary Phone: ${primaryPhone || 'On file'}\n` +
    `- Primary Email: ${primaryEmail || 'On file'}\n\n` +
    `Please confirm deletion and suppression in writing within statutory deadlines.\n\n` +
    `Sincerely,\n${fullName}`
  );
  const mailtoUrl = `mailto:${broker.privacyEmail}?subject=${emailSubject}&body=${emailBody}`;

  const writtenDeclaration = 
`FORMAL WRITTEN CONSUMER DEMAND FOR DATA EXPUNGEMENT & SUPPRESSION

DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
TO: Privacy & Compliance Division, ${broker.name} (${broker.domain})

Pursuant to consumer protection and privacy statutes, I hereby demand permanent suppression and expungement of my consumer file from your repositories.

CONSUMER IDENTIFICATION:
- Full Legal Name: ${fullName}
- Primary Address: ${location}
- Contact Phone: ${primaryPhone || 'Unlisted'}
- Contact Email: ${primaryEmail || 'N/A'}

I declare under penalty of perjury that I am the individual identified above and demand compliance within 30-45 calendar days.

Signature: ___________________________
Printed Name: ${fullName}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative my-8">
        {/* Header */}
        <div className="p-6 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Opt-Out Assistant: {broker.name}</h3>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-emerald-400">
                  {broker.removalMethod}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                1-click removal guidance & clipboard pre-fill for {broker.domain}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Methodology Banner */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Methodology:</span>
              <span className="font-semibold text-white">{broker.removalMethod}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Est. Time:</span>
              <span className="font-mono text-emerald-400 font-medium">{broker.removalTime}</span>
            </div>
          </div>

          {/* Special Action for Email CCPA Demand */}
          {broker.removalMethod === 'Email CCPA Demand' && (
            <div className="p-4 bg-indigo-950/30 border border-indigo-800/40 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
                <Mail className="w-4 h-4 text-indigo-400" />
                <span>Email CCPA Demand Workflow</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                This entity accepts direct suppression requests via compliance email. You can dispatch an official deletion notice with 1-click:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={mailtoUrl}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Launch Email to {broker.privacyEmail}</span>
                </a>
                <button
                  type="button"
                  onClick={() => copyToClipboard(broker.privacyEmail, 'pEmail')}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {copiedField === 'pEmail' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy DPO Email</span>
                </button>
              </div>
            </div>
          )}

          {/* Special Action for Mail-in Notarized Demand */}
          {broker.removalMethod === 'Mail-in Notarized Demand' && (
            <div className="p-4 bg-amber-950/30 border border-amber-800/40 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                <FileText className="w-4 h-4 text-amber-400" />
                <span>Written / Notarized Postal Demand</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                This institution requires a written declaration to freeze consumer payroll and employment archives:
              </p>
              <button
                type="button"
                onClick={() => copyToClipboard(writtenDeclaration, 'decl')}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedField === 'decl' ? <Check className="w-3.5 h-3.5 text-slate-950" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copy Ready-to-Print Postal Declaration</span>
              </button>
            </div>
          )}

          {/* Quick-Copy Pre-fill Fields */}
          <div>
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              1-Click Copy Fields (Paste into {broker.name}):
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Full Name */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 block">Full Name</span>
                  <span className="font-mono text-white font-medium">{fullName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(fullName, 'name')}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                  title="Copy Full Name"
                >
                  {copiedField === 'name' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              {/* Primary Email */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 block">Email Address</span>
                  <span className="font-mono text-white font-medium truncate max-w-[170px] block">{primaryEmail || 'No email entered'}</span>
                </div>
                {primaryEmail && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(primaryEmail, 'email')}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                    title="Copy Email"
                  >
                    {copiedField === 'email' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
              </div>

              {/* Primary Phone */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 block">Phone Number</span>
                  <span className="font-mono text-white font-medium">{primaryPhone || 'No phone entered'}</span>
                </div>
                {primaryPhone && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(primaryPhone, 'phone')}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                    title="Copy Phone"
                  >
                    {copiedField === 'phone' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
              </div>

              {/* Residence */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 block">Location</span>
                  <span className="font-mono text-white font-medium">{location}</span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(location, 'location')}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                  title="Copy Location"
                >
                  {copiedField === 'location' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Broker Instructions */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Official Removal Steps for {broker.domain}:
            </div>
            <ol className="list-decimal list-inside space-y-2 text-xs text-slate-300 bg-slate-950 p-4 rounded-xl border border-slate-800">
              {broker.instructions.map((step, idx) => (
                <li key={idx} className="leading-relaxed">
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800/80 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => {
              onMarkSubmitted(broker.id);
              onClose();
            }}
            className="px-4 py-2.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Mark Actioned in Tracker</span>
          </button>

          <a
            href={broker.optOutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
          >
            <span>Open {broker.name} Official Opt-Out</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-950" />
          </a>
        </div>
      </div>
    </div>
  );
};
