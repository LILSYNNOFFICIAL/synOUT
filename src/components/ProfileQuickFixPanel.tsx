import React, { useMemo, useState } from 'react';
import { ScanResult, UserProfile } from '../types';
import {
  ProfileDiscrepancyItem,
  analyzeProfileDiscrepancies,
  applyAllAutoQuickFixes,
} from '../utils/profileQuickFixEngine';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react';

interface ProfileQuickFixPanelProps {
  profile: UserProfile;
  results: ScanResult[];
  connectedEmail?: string | null;
  onUpdateProfile: (updatedProfile: UserProfile, refreshScan?: boolean) => void;
}

export const ProfileQuickFixPanel: React.FC<ProfileQuickFixPanelProps> = ({
  profile,
  results,
  connectedEmail,
  onUpdateProfile,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [streetInput, setStreetInput] = useState(profile.currentStreet || '');
  const [zipInput, setZipInput] = useState(profile.currentZip || '');
  const [priorLocationInput, setPriorLocationInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [birthYearInput, setBirthYearInput] = useState(profile.birthYear || '');
  const [relativeInput, setRelativeInput] = useState('');
  const [recentActionMessage, setRecentActionMessage] = useState<string | null>(null);

  const audit = useMemo(
    () => analyzeProfileDiscrepancies(profile, results, connectedEmail),
    [profile, results, connectedEmail]
  );

  const handleApplyAutoFixAll = () => {
    const { updatedProfile, appliedFixIds } = applyAllAutoQuickFixes(
      profile,
      results,
      connectedEmail
    );
    if (appliedFixIds.length === 0) return;
    onUpdateProfile(updatedProfile, true);
    setRecentActionMessage(
      `Applied ${appliedFixIds.length} automatic profile normalization${appliedFixIds.length === 1 ? '' : 's'} and refreshed broker match accuracy.`
    );
  };

  const handleApplySingleFix = (item: ProfileDiscrepancyItem) => {
    const inputs: Record<string, string> = {
      street: streetInput,
      zip: zipInput,
      priorLocation: priorLocationInput,
      phone: phoneInput,
      email: emailInput,
      birthYear: birthYearInput,
      relativeName: relativeInput,
    };

    if (item.inputKind === 'street_and_zip') {
      const hasValidStreet = streetInput.trim().length > 3;
      const hasValidZip = /^\d{5}(-\d{4})?$/.test(zipInput.trim());
      if (!hasValidStreet && !hasValidZip) return;
    } else if (item.inputKind === 'prior_location' && !priorLocationInput.trim()) {
      return;
    } else if (item.inputKind === 'phone' && phoneInput.replace(/\D/g, '').length < 10) {
      return;
    } else if (item.inputKind === 'email' && !emailInput.includes('@')) {
      return;
    } else if (item.inputKind === 'birth_year' && !/^\d{4}$/.test(birthYearInput.trim())) {
      return;
    } else if (item.inputKind === 'relative_name' && !relativeInput.trim()) {
      return;
    }

    const updated = item.applyFix(profile, inputs);
    onUpdateProfile(updated, true);

    if (item.inputKind === 'prior_location') setPriorLocationInput('');
    if (item.inputKind === 'phone') setPhoneInput('');
    if (item.inputKind === 'email') setEmailInput('');
    if (item.inputKind === 'relative_name') setRelativeInput('');

    setRecentActionMessage(`Updated "${item.title}" and re-evaluated broker match accuracy.`);
  };

  return (
    <section
      id="synout-quick-fix-panel"
      aria-label="Profile Quick Fix & Match Accuracy Helper"
      className="p-6 glass-panel rounded-2xl space-y-5"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
            <span className="text-emerald-400 font-medium inline-flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5" />
              <span>Quick Fix · Profile Match Accuracy</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Accuracy Score:{' '}
              <strong
                className={
                  audit.accuracyScore >= 85
                    ? 'text-emerald-400 font-mono'
                    : audit.accuracyScore >= 65
                    ? 'text-amber-300 font-mono'
                    : 'text-rose-400 font-mono'
                }
              >
                {audit.accuracyScore}/100
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {audit.discrepancies.length === 0
                ? 'Zero profile discrepancies detected'
                : `${audit.discrepancies.length} suggested update${audit.discrepancies.length === 1 ? '' : 's'}`}
            </span>
            {audit.skippedRealEstateCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-sky-300">
                  {audit.skippedRealEstateCount} Property Brokers Awaiting Street/ZIP
                </span>
              </>
            )}
          </div>

          <h2 className="text-lg font-bold text-white tracking-tight">
            Profile Discrepancy Scanner &amp; Match Accuracy Helper
          </h2>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            Checks for outdated or duplicate prior addresses, unnormalized state codes, missing
            parcel street/ZIP anchors, and unstandardized phone/email formatting so future scans
            and automated opt-out forms match your exact records without false positives.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {audit.autoFixableCount > 0 && (
            <button
              type="button"
              onClick={handleApplyAutoFixAll}
              className="px-4 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Auto-Fix All ({audit.autoFixableCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="px-3.5 py-2 rounded-xl glass-subtle hover:bg-white/[0.06] text-slate-300 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
          >
            <span>
              {isExpanded
                ? 'Hide Suggestions'
                : `Show Suggestions (${audit.discrepancies.length})`}
            </span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {recentActionMessage && (
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-3 text-xs text-emerald-300">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{recentActionMessage}</span>
          </span>
          <button
            type="button"
            onClick={() => setRecentActionMessage(null)}
            className="text-slate-400 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {isExpanded && (
        <div className="pt-3 border-t border-white/[0.07]">
          {audit.discrepancies.length === 0 ? (
            <div className="py-3 flex items-center gap-2.5 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Your profile anchors (addresses, 2-letter state codes, phone formatting, email
                verification, and homonym disambiguators) are fully calibrated for maximum scan
                accuracy.
              </span>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.07]">
              {audit.discrepancies.map((item) => (
                <div
                  key={item.id}
                  className="py-4 first:pt-1 last:pb-0 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 tabular-nums">
                      <span
                        className={
                          item.severity === 'high'
                            ? 'text-rose-400 font-semibold'
                            : item.severity === 'medium'
                            ? 'text-amber-300 font-medium'
                            : 'text-sky-300 font-medium'
                        }
                      >
                        {item.severity === 'high'
                          ? 'High Impact'
                          : item.severity === 'medium'
                          ? 'Medium Impact'
                          : 'Accuracy Boost'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{item.impactLabel}</span>
                    </div>

                    <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>

                    {item.autoFixPreview && (
                      <p className="text-[11px] font-mono text-emerald-300 pt-0.5 break-words">
                        Suggested change: {item.autoFixPreview}
                      </p>
                    )}
                  </div>

                  {/* Action Controls: 1-Click Auto-Fix or Inline Quick Input */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {item.inputKind === 'street_and_zip' && (
                      <>
                        <input
                          type="text"
                          value={streetInput}
                          onChange={(e) => setStreetInput(e.target.value)}
                          placeholder="Street address (e.g. 742 Evergreen Ter)"
                          aria-label="Current street address"
                          className="glass-input rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 w-56"
                        />
                        <input
                          type="text"
                          value={zipInput}
                          maxLength={10}
                          onChange={(e) => setZipInput(e.target.value)}
                          placeholder="ZIP (95814)"
                          aria-label="5-digit ZIP code"
                          className="glass-input rounded-xl px-3 py-2 text-xs text-white font-mono tabular-nums placeholder-slate-500 w-28"
                        />
                      </>
                    )}

                    {item.inputKind === 'prior_location' && (
                      <input
                        type="text"
                        value={priorLocationInput}
                        onChange={(e) => setPriorLocationInput(e.target.value)}
                        placeholder="Prior City, ST (e.g. Denver, CO)"
                        aria-label="Previous city and state"
                        className="glass-input rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 w-56"
                      />
                    )}

                    {item.inputKind === 'phone' && (
                      <input
                        type="tel"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="(916) 555-0144"
                        aria-label="Phone number"
                        className="glass-input rounded-xl px-3 py-2 text-xs text-white font-mono tabular-nums placeholder-slate-500 w-44"
                      />
                    )}

                    {item.inputKind === 'email' && (
                      <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="you@example.com"
                        aria-label="Verification email"
                        className="glass-input rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 w-52"
                      />
                    )}

                    {item.inputKind === 'birth_year' && (
                      <input
                        type="text"
                        maxLength={4}
                        value={birthYearInput}
                        onChange={(e) => setBirthYearInput(e.target.value)}
                        placeholder="1988"
                        aria-label="4-digit birth year"
                        className="glass-input rounded-xl px-3 py-2 text-xs text-white font-mono tabular-nums placeholder-slate-500 w-24"
                      />
                    )}

                    {item.inputKind === 'relative_name' && (
                      <input
                        type="text"
                        value={relativeInput}
                        onChange={(e) => setRelativeInput(e.target.value)}
                        placeholder="Household relative name"
                        aria-label="Household relative full name"
                        className="glass-input rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 w-48"
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => handleApplySingleFix(item)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        item.canAutoFixImmediately
                          ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold'
                          : 'glass-subtle hover:bg-white/[0.09] text-emerald-300 border border-emerald-500/25'
                      }`}
                    >
                      {item.canAutoFixImmediately ? 'Auto-Fix & Refresh' : 'Save & Refresh Scan'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
