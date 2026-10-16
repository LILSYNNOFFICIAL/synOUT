import React from 'react';
import { ShieldCheck, BookOpen, Scale, Lock, Globe, FileText, CheckCircle2 } from 'lucide-react';

export const PrivacyGuide: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8 text-xs text-slate-300">
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          Consumer Privacy Rights & Removal Legal Framework
        </h1>
        <p className="text-xs text-slate-400">
          How modern state and international privacy statutes empower consumers to demand complete suppression from data brokers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <Scale className="w-4 h-4" />
            California Consumer Privacy Act (CCPA / CPRA)
          </div>
          <p className="leading-relaxed text-slate-400">
            Cal. Civ. Code § 1798.105 grants consumers the unequivocal right to demand deletion of personal information held by businesses and data brokers, while § 1798.120 guarantees the right to opt-out of data sale or sharing.
          </p>
          <ul className="space-y-1.5 list-disc list-inside text-slate-300 text-[11px]">
            <li>Mandatory compliance deadline: 45 calendar days.</li>
            <li>Requires brokers to cascade deletions to downstream service providers.</li>
          </ul>
        </div>

        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
          <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
            <Globe className="w-4 h-4" />
            Texas Data Privacy & Security Act (TDPSA)
          </div>
          <p className="leading-relaxed text-slate-400">
            Tex. Bus. & Com. Code § 541 provides Texas residents with the right to confirm whether a controller processes their personal data and to delete personal data provided by or obtained about the consumer.
          </p>
          <ul className="space-y-1.5 list-disc list-inside text-slate-300 text-[11px]">
            <li>Strict opt-out of targeted advertising and consumer profiling.</li>
            <li>Enforceable through the Texas Office of the Attorney General.</li>
          </ul>
        </div>

        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <Lock className="w-4 h-4" />
            Fair Credit Reporting Act (FCRA § 609 / 604)
          </div>
          <p className="leading-relaxed text-slate-400">
            Regulates specialty consumer reporting agencies (LexisNexis, ChexSystems, Innovis, CoreLogic). Requires identity disclosure, free dispute resolution, and security freezes.
          </p>
        </div>

        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
          <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
            <FileText className="w-4 h-4" />
            Limited Power of Attorney (Authorized Agent Model)
          </div>
          <p className="leading-relaxed text-slate-400">
            Under CCPA § 1798.130 and Cal. Code Regs. tit. 11 § 7063, consumers may legally designate an authorized agent to submit data deletion requests on their behalf via signed representation agreements.
          </p>
        </div>
      </div>
    </div>
  );
};
