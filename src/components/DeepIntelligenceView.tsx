import React, { useState } from 'react';
import { UserProfile, ScanResult, DarkWebBreachRecord, WebSearchFinding } from '../types';
import { runDarkWebScan, runWebSearchIntelligence, getUserJurisdictionStates } from '../utils/scanEngine';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Globe,
  Database,
  Search,
  ExternalLink,
  AlertTriangle,
  UserCheck,
  FileText,
  MapPin,
  Phone,
  Mail,
  Fingerprint,
  Eye,
  KeyRound,
  Download,
  CheckCircle2,
  Building
} from 'lucide-react';

interface DeepIntelligenceViewProps {
  profile: UserProfile;
  results: ScanResult[];
  onNavigateToTab: (tab: any) => void;
  onOpenPowerOfAttorney: () => void;
}

export const DeepIntelligenceView: React.FC<DeepIntelligenceViewProps> = ({
  profile,
  results,
  onNavigateToTab,
  onOpenPowerOfAttorney,
}) => {
  const [activeVector, setActiveVector] = useState<'all' | 'darkweb' | 'web' | 'identity' | 'jurisdiction'>('all');
  const [showSsnHash, setShowSsnHash] = useState(false);

  const darkWebBreaches: DarkWebBreachRecord[] = runDarkWebScan(profile);
  const webFindings: WebSearchFinding[] = runWebSearchIntelligence(profile);
  const userStates = Array.from(getUserJurisdictionStates(profile));

  const exposedBrokers = results.filter((r) => r.status === 'exposed');
  const criticalBreaches = darkWebBreaches.filter((b) => b.severity === 'Critical');

  const handleExportDossier = () => {
    const reportData = {
      generatedAt: new Date().toISOString(),
      principal: {
        name: `${profile.firstName} ${profile.lastName}`,
        aliases: profile.aliases || [],
        maidenName: profile.maidenName || null,
        currentLocation: `${profile.currentCity}, ${profile.currentState}`,
        statesResided: userStates,
        ssnStatus: profile.ssn?.isProvided ? 'Vault Hash Verified' : 'Not Provided',
        driversLicenseStatus: profile.driversLicense?.isProvided ? `State: ${profile.driversLicense.state}` : 'Not Provided',
      },
      darkWebCompromises: darkWebBreaches,
      clearWebFindings: webFindings,
      brokerExposuresCount: exposedBrokers.length,
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Government_Background_Intelligence_Dossier_${profile.lastName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Top Intelligence Banner */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Fingerprint className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">Government-Grade Background & Dark Web Intelligence</h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Verified Deep Audit
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Cross-references public records registries, criminal data leaks, corporate filings, and underground credential repositories
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportDossier}
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export Intelligence Dossier
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="text-[11px] text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            Dark Web Data Leaks
          </div>
          <div className="text-2xl font-bold text-white">{darkWebBreaches.length}</div>
          <div className="text-[10px] text-red-400 mt-1 font-medium">
            {criticalBreaches.length} Critical SSN/Identity Leaks
          </div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="text-[11px] text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            Clear Web Public Queries
          </div>
          <div className="text-2xl font-bold text-white">{webFindings.length}</div>
          <div className="text-[10px] text-sky-400 mt-1 font-medium">
            Google Dorks & Public PDFs
          </div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="text-[11px] text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            Confirmed Broker Exposures
          </div>
          <div className="text-2xl font-bold text-white">{exposedBrokers.length}</div>
          <div className="text-[10px] text-slate-400 mt-1">
            Filtered by Verified States ({userStates.join(', ')})
          </div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="text-[11px] text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-purple-400" />
            SSN & DL Security Vault
          </div>
          <div className="text-xs font-mono font-bold text-purple-300 mt-2">
            {profile.ssn?.isProvided ? `***-**-${profile.ssn.last4} (Vaulted)` : 'SSN Not Inputted'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {profile.driversLicense?.isProvided ? `DL: ${profile.driversLicense.state} Verified` : 'DL Optional'}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-xs">
        <button
          onClick={() => setActiveVector('all')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
            activeVector === 'all' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-white'
          }`}
        >
          All Intelligence Vectors
        </button>
        <button
          onClick={() => setActiveVector('darkweb')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
            activeVector === 'darkweb' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-white'
          }`}
        >
          Dark Web Breaches ({darkWebBreaches.length})
        </button>
        <button
          onClick={() => setActiveVector('web')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
            activeVector === 'web' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-white'
          }`}
        >
          Clear Web Google Dorks ({webFindings.length})
        </button>
        <button
          onClick={() => setActiveVector('identity')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
            activeVector === 'identity' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-white'
          }`}
        >
          Identity & Associates Dossier
        </button>
      </div>

      {/* Vector 1: Dark Web Compromises */}
      {(activeVector === 'all' || activeVector === 'darkweb') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              Dark Web Data Leaks & Breach Dossiers ({darkWebBreaches.length} Detected)
            </h2>
            <span className="text-xs text-slate-400">
              Cross-checked against verified cybercrime leaks (BreachForums, Telegram, paste sites)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {darkWebBreaches.map((breach) => (
              <div
                key={breach.id}
                className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 relative overflow-hidden"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{breach.breachName}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/20 text-red-300 border border-red-500/30">
                        {breach.severity}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">{breach.domain} • Incident: {breach.breachDate}</span>
                  </div>
                  {breach.darkWebForumSeen && (
                    <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-red-400">
                      Circulating in Forums
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {breach.description}
                </p>

                <div className="space-y-1.5 pt-2 border-t border-slate-800 text-xs">
                  <div className="text-[11px] font-semibold text-slate-400">Compromised Data Points:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {breach.compromisedData.map((d, i) => (
                      <span
                        key={i}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          d.includes('SSN') || d.includes('Password')
                            ? 'bg-red-950/60 text-red-300 border border-red-500/40'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                  <span>Matched On: <strong className="text-white">{breach.matchedEntity}</strong></span>
                  <span className="text-emerald-400 font-medium">Recommends Credit Freeze</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vector 2: Clear Web & Google Dorks */}
      {(activeVector === 'all' || activeVector === 'web') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-sky-400" />
              Clear Web & Google Search Indexing Footprint
            </h2>
            <span className="text-xs text-slate-400">
              Live automated query generators searching open public servers and document repositories
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {webFindings.map((finding) => (
              <div
                key={finding.id}
                className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      {finding.findingType}
                    </span>
                    <h3 className="text-sm font-bold text-white mt-1.5">{finding.title}</h3>
                    <span className="text-xs text-slate-400 font-mono">{finding.sourceDomain}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {finding.snippet}
                </p>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">State Jurisdiction: <strong>{finding.state}</strong></span>
                  <a
                    href={finding.directQueryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 text-xs font-semibold text-sky-300 hover:text-white bg-sky-950/50 hover:bg-sky-900/50 border border-sky-500/30 rounded-lg flex items-center gap-1 transition-colors"
                  >
                    Run Live Query on Google
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vector 3: Identity & Family Graph Dossier */}
      {(activeVector === 'all' || activeVector === 'identity') && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            Verified Government-Grade Identity Dossier
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1: Core Subject Data */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                Core Subject Particulars
              </h3>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-500 block">Full Legal Name:</span>
                  <strong className="text-white">
                    {profile.firstName} {profile.middleName ? profile.middleName + ' ' : ''}{profile.lastName}
                  </strong>
                </div>
                {profile.maidenName && (
                  <div>
                    <span className="text-slate-500 block">Maiden / Prior Legal Name:</span>
                    <span className="text-slate-300">{profile.maidenName}</span>
                  </div>
                )}
                {profile.aliases && profile.aliases.length > 0 && (
                  <div>
                    <span className="text-slate-500 block">Known Aliases / DBAs:</span>
                    <span className="text-slate-300">{profile.aliases.join(', ')}</span>
                  </div>
                )}
                <div>
                  <span className="text-slate-500 block">Date of Birth / Year:</span>
                  <span className="text-slate-300">{profile.birthDate || `Year ${profile.birthYear}`}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Current Legal Domicile:</span>
                  <span className="text-slate-300">
                    {profile.currentStreet ? profile.currentStreet + ', ' : ''}{profile.currentCity}, {profile.currentState} {profile.currentZip || ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Column 2: Cryptographic SSN & DL Vault */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                Cryptographic Credential Vault
              </h3>
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-purple-400" />
                      Social Security Verification:
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      {profile.ssn?.isProvided ? 'SHA-256 Vaulted' : 'Not Inputted'}
                    </span>
                  </div>
                  {profile.ssn?.isProvided ? (
                    <div>
                      <div className="text-base font-mono font-bold text-purple-300">
                        ***-**-{profile.ssn.last4}
                      </div>
                      <button
                        onClick={() => setShowSsnHash(!showSsnHash)}
                        className="text-[10px] text-slate-500 hover:text-slate-300 underline mt-1 block cursor-pointer"
                      >
                        {showSsnHash ? 'Hide cryptographic hash' : 'View cryptographic SHA-256 hash'}
                      </button>
                      {showSsnHash && (
                        <div className="text-[9px] font-mono text-slate-400 bg-slate-900 p-1.5 rounded mt-1 break-all">
                          {profile.ssn.hashSha256}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      No SSN entered. Inputting allows matching against criminal broker leak databases.
                    </p>
                  )}
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
                    <Fingerprint className="w-3.5 h-3.5 text-sky-400" />
                    Driver&apos;s License Registry:
                  </div>
                  {profile.driversLicense?.isProvided ? (
                    <div className="text-slate-200">
                      State: <strong>{profile.driversLicense.state}</strong> • License Record Active
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500">No Driver&apos;s License entered.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Column 3: Family Members & Business Associations */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                Relatives & Business Associations
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-500 text-[11px] block font-semibold mb-1">
                    Family & Known Relatives ({profile.relatives.length}):
                  </span>
                  {profile.relatives.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {profile.relatives.map((rel, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">
                          {rel}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-500 text-[11px]">None specified</span>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <span className="text-slate-500 text-[11px] block font-semibold mb-1 flex items-center gap-1">
                    <Building className="w-3 h-3 text-emerald-400" />
                    Corporate Associations & LLCs ({profile.associations?.length || 0}):
                  </span>
                  {profile.associations && profile.associations.length > 0 ? (
                    <div className="space-y-1">
                      {profile.associations.map((assoc, i) => (
                        <div key={i} className="flex items-center justify-between p-1.5 rounded bg-slate-950 border border-slate-800 text-[11px]">
                          <span className="text-slate-200 font-medium">{assoc.name}</span>
                          <span className="text-slate-400 text-[10px]">{assoc.entityType}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-500 text-[11px]">None specified</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-white">Next Steps for Total Privacy Defense</h4>
          <p className="text-xs text-slate-400">
            Use our Automated Web Bot or Gmail Dispatch to demand immediate suppression of these records.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigateToTab('gmail')}
            className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl transition-colors cursor-pointer shadow-lg shadow-red-600/20"
          >
            Launch Gmail 1-by-1 Dispatcher
          </button>
          <button
            onClick={() => onNavigateToTab('report')}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors cursor-pointer"
          >
            Review 700+ Broker Exposure Report
          </button>
        </div>
      </div>
    </div>
  );
};
