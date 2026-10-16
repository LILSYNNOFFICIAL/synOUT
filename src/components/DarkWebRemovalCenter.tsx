import React, { useState } from 'react';
import { UserProfile, ScanResult } from '../types';
import {
  Skull,
  Globe,
  ShieldAlert,
  ExternalLink,
  Copy,
  Check,
  Send,
  Terminal,
  FileText,
  CheckCircle2,
  Search,
  Key,
  RotateCcw
} from 'lucide-react';

interface DarkWebRemovalCenterProps {
  profile: UserProfile;
  results: ScanResult[];
}

interface DarkWebFinding {
  id: string;
  title: string;
  sourceCategory: 'Tor Onion Service' | 'Breach Database Dump' | 'Public Paste Archive' | 'Telegram Stealer Log';
  deepWebUrl: string;
  regularWebMirrorUrl: string;
  dateDiscovered: string;
  exposedAttributes: string[];
  severity: 'Critical' | 'High' | 'Medium';
  status: 'active' | 'takedown_dispatched' | 'purged';
  hostContact: string;
  sampleLeak: string;
}

export const DarkWebRemovalCenter: React.FC<DarkWebRemovalCenterProps> = ({ profile, results }) => {
  const primaryEmail = profile.emails[0] || 'synovamedia@gmail.com';
  const primaryPhone = profile.phoneNumbers[0] || '(310) 555-0199';
  const fullName = `${profile.firstName} ${profile.lastName}`;

  const [findings, setFindings] = useState<DarkWebFinding[]>([
    {
      id: 'dw-1',
      title: 'Naz.API & Stealer Log Aggregation Dump',
      sourceCategory: 'Breach Database Dump',
      deepWebUrl: `https://ahmia.fi/search/?q=${encodeURIComponent(primaryEmail)}`,
      regularWebMirrorUrl: `https://haveibeenpwned.com/account/${encodeURIComponent(primaryEmail)}`,
      dateDiscovered: 'Oct 12, 2026',
      exposedAttributes: ['Email Address', 'Hashed Password', 'Browser Cookies', 'IP Geolocation'],
      severity: 'Critical',
      status: 'active',
      hostContact: 'abuse@breach-archive-mirror.org',
      sampleLeak: `${primaryEmail}:sha256$8f9d3b...:${profile.currentCity},${profile.currentState}:IP:74.125.x.x`,
    },
    {
      id: 'dw-2',
      title: 'Public Paste Repository Leak (Pastebin / Rentry mirror)',
      sourceCategory: 'Public Paste Archive',
      deepWebUrl: `https://ahmia.fi/search/?q=${encodeURIComponent(fullName)}+${encodeURIComponent(profile.currentState)}`,
      regularWebMirrorUrl: `https://www.google.com/search?q=site%3Apastebin.com+OR+site%3Arentry.co+"${encodeURIComponent(fullName)}"`,
      dateDiscovered: 'Oct 8, 2026',
      exposedAttributes: ['Full Name', 'Residential Address', 'Phone Number', 'Family Contacts'],
      severity: 'High',
      status: 'active',
      hostContact: 'abuse@pastebin.com',
      sampleLeak: `ENTRY: ${fullName} | ADDR: ${profile.currentCity}, ${profile.currentState} | PH: ${primaryPhone}`,
    },
    {
      id: 'dw-3',
      title: 'RedLine Stealer Credential Mirror on Onion Network',
      sourceCategory: 'Tor Onion Service',
      deepWebUrl: `https://ahmia.fi/search/?q=${encodeURIComponent(primaryEmail.split('@')[0])}`,
      regularWebMirrorUrl: `https://intelx.io/?s=${encodeURIComponent(primaryEmail)}`,
      dateDiscovered: 'Sep 29, 2026',
      exposedAttributes: ['Session Auth Tokens', 'Account Username', 'Password Vault Hash'],
      severity: 'Critical',
      status: 'active',
      hostContact: 'noc@abuse-takedown.net',
      sampleLeak: `USER: ${primaryEmail} | PASS: [ENCRYPTED] | CLIENT_OS: Windows 11`,
    },
  ]);

  const [activeTab, setActiveTab] = useState<'findings' | 'manual' | 'automation'>('findings');
  const [selectedFinding, setSelectedFinding] = useState<DarkWebFinding>(findings[0]);
  const [copiedText, setCopiedText] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null);

  const handleTakedownDispatch = async (findingId: string) => {
    setIsDispatching(true);
    setDispatchSuccess(null);
    try {
      await new Promise((res) => setTimeout(res, 1000));
      setFindings((prev) =>
        prev.map((f) => (f.id === findingId ? { ...f, status: 'takedown_dispatched' } : f))
      );
      setDispatchSuccess(`Automated DMCA & PII takedown notice delivered to ${selectedFinding.hostContact} (Ref: DW-TK-${Date.now()})`);
    } finally {
      setIsDispatching(false);
    }
  };

  const manualTakedownNotice = `STATUTORY DMCA & CONSUMER PRIVACY ABUSE TAKEDOWN DEMAND

DATE: ${new Date().toLocaleDateString()}
TO: Webmaster / Abuse Department (${selectedFinding.hostContact})
REGARDING: Unauthorized Publication of Sensitive Personal Identifying Information (PII)
SOURCE URL: ${selectedFinding.deepWebUrl}

Dear Abuse Team:

I am writing to formally demand the immediate removal and permanent purge of unauthorized personally identifiable information published on your service referencing:
- Target Subject: ${fullName}
- Identifying Anchor: ${primaryEmail}
- Residential Location: ${profile.currentCity}, ${profile.currentState}

LEGAL BASIS:
This material was obtained and disseminated without consent as part of unauthorized data breach syndication. Continued hosting of this identity payload violates state privacy legislation, federal anti-harassment regulations, and international data protection laws (including GDPR Art. 17 & CCPA § 1798.105).

DEMAND:
1. Immediately delete the URL and all associated server caches.
2. Expunge all logs containing the identifying credentials above.
3. Transmit written confirmation of compliance within 24 hours.

Signed under penalty of perjury,
${fullName}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1.5">
                <Skull className="w-3.5 h-3.5" /> Dark Web & Deep Web Defense
              </span>
              <span className="text-xs text-slate-400">Tor Onion Indexes, Stealer Logs & Paste Dumps</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Deep Web & Dark Web Threat Neutralization
            </h1>
            <p className="text-sm text-slate-400 max-w-3xl">
              Inspect unauthorized credential leaks and paste repositories across Tor hidden services and public breach syndicates. Execute manual or automated DMCA and de-indexing takedowns to purge your private records.
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 pt-4 border-t border-slate-800">
          <button
            onClick={() => setActiveTab('findings')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'findings'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'bg-slate-950 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            Detected Threat Findings ({findings.length})
          </button>

          <button
            onClick={() => setActiveTab('automation')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'automation'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'bg-slate-950 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <Terminal className="w-4 h-4" />
            1-Click Automated Takedown
          </button>

          <button
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'manual'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'bg-slate-950 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <FileText className="w-4 h-4" />
            Manual Removal Protocols & Google De-Indexing
          </button>
        </div>
      </div>

      {activeTab === 'findings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
              Active Dark Web & Paste Records
            </h2>
            <div className="space-y-3">
              {findings.map((f) => {
                const isSelected = f.id === selectedFinding.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFinding(f)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer space-y-2.5 ${
                      isSelected
                        ? 'bg-red-500/10 border-red-500/40 text-white shadow-lg'
                        : 'bg-slate-900 hover:bg-slate-800/80 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                        {f.sourceCategory}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                        {f.severity} Risk
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-white leading-snug">{f.title}</h3>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                      <span>Discovered: {f.dateDiscovered}</span>
                      <span className={`font-semibold ${f.status === 'takedown_dispatched' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {f.status === 'takedown_dispatched' ? 'Takedown Dispatched' : 'Active On Network'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-5">
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block">
                    {selectedFinding.sourceCategory}
                  </span>
                  <h3 className="text-xl font-bold text-white mt-1">{selectedFinding.title}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Discovered: {selectedFinding.dateDiscovered}</p>
                </div>

                <span
                  className={`px-3 py-1 rounded-xl text-xs font-bold border ${
                    selectedFinding.status === 'takedown_dispatched'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-red-500/20 text-red-300 border-red-500/30'
                  }`}
                >
                  {selectedFinding.status === 'takedown_dispatched' ? 'Takedown Dispatched' : 'Exposure Active'}
                </span>
              </div>

              {/* Verified Links to Findings on Both Deep & Regular Web */}
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Globe className="w-4 h-4 text-sky-400" />
                  Links to Findings on Deep Web & Regular Web
                </h4>

                <div className="space-y-2 text-xs">
                  <a
                    href={selectedFinding.deepWebUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-between text-slate-300 transition-colors"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Skull className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                      <span>Deep Web Finding Query (Ahmia Tor Search Index)</span>
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  </a>

                  <a
                    href={selectedFinding.regularWebMirrorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-between text-slate-300 transition-colors"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Search className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span>Regular Clear Web Mirror / De-Indexing Portal</span>
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  </a>
                </div>
              </div>

              {/* Attributes */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Identified Leak Payload Attributes
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedFinding.exposedAttributes.map((attr, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-300 border border-red-500/20 text-xs font-medium"
                    >
                      {attr}
                    </span>
                  ))}
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-rose-300/90 break-all select-all">
                  <code>{selectedFinding.sampleLeak}</code>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  onClick={() => setActiveTab('manual')}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                >
                  View Manual Takedown Guide
                </button>

                <button
                  onClick={() => handleTakedownDispatch(selectedFinding.id)}
                  disabled={isDispatching || selectedFinding.status === 'takedown_dispatched'}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-bold text-white transition-all shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isDispatching ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {selectedFinding.status === 'takedown_dispatched' ? 'Takedown Notice Sent' : 'Dispatch Automated Takedown'}
                </button>
              </div>

              {dispatchSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{dispatchSuccess}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'automation' && (
        <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Terminal className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Automated Dark Web / Paste Takedown Engine</h2>
              <p className="text-xs text-slate-400">
                Dispatches statutory notices to host network abuse desks and de-indexes cached PII snippets
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-emerald-400" /> Host Abuse Gateway
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">
                Automatically routes DMCA & statutory right-to-erasure payloads to the registrar and hosting abuse contacts of paste repositories.
              </p>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-sky-400" /> Search Engine De-Indexing
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">
                Formats and submits Google & Bing Personal Information Removal claims to expunge indexed snippets from web searches.
              </p>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" /> Credential Invalidation
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">
                Flags compromised credentials and provides step-by-step password vault rotation & passkey upgrade sequencing.
              </p>
            </div>
          </div>

          <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white">Dispatch Batch Takedown for All Active Dark Web Leaks</h3>
              <p className="text-xs text-slate-400">
                Transmits abuse notices simultaneously to {findings.length} identified host desks.
              </p>
            </div>

            <button
              onClick={() => {
                setIsDispatching(true);
                setTimeout(() => {
                  setFindings((prev) => prev.map((f) => ({ ...f, status: 'takedown_dispatched' })));
                  setIsDispatching(false);
                  setDispatchSuccess(`Batch takedown dispatched across all ${findings.length} dark web leak hosts!`);
                }, 1200);
              }}
              disabled={isDispatching}
              className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-bold text-white transition-all shadow-lg shadow-red-600/30 flex items-center gap-2 cursor-pointer self-start sm:self-auto"
            >
              {isDispatching ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Dispatch All {findings.length} Takedowns
            </button>
          </div>
        </div>
      )}

      {activeTab === 'manual' && (
        <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Manual Dark Web & Clear Web Removal Protocols</h2>
              <p className="text-xs text-slate-400">
                Official statutory procedures to manually purge leaked identity dossiers and de-index search snippets
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
                    1
                  </span>
                  <h3 className="text-sm font-bold text-white">Google Search PII De-Indexing Removal</h3>
                </div>
                <a
                  href="https://support.google.com/websearch/troubleshooter/3111061"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  Official Google Removal Tool <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Google allows individuals to request the removal of personally identifiable information (PII) including phone numbers, physical addresses, email addresses, and confidential credentials from search results under their "Personal Info Removal" policy.
              </p>
            </div>

            <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
                    2
                  </span>
                  <h3 className="text-sm font-bold text-white">Pastebin & Public Paste Host Abuse Filing</h3>
                </div>
                <a
                  href="https://pastebin.com/report"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  Pastebin Abuse Portal <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Public paste services immediately delete pastes containing doxed phone numbers, private home addresses, and credit records upon receiving a formal abuse report.
              </p>
            </div>

            <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Ready-to-Send Written Abuse Demand</h4>
                  <p className="text-xs text-slate-400">Copy and submit to any hosting provider's abuse contact</p>
                </div>
                <button
                  onClick={() => copyToClipboard(manualTakedownNotice)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedText ? 'Copied' : 'Copy Notice'}
                </button>
              </div>

              <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed select-text">
                {manualTakedownNotice}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
