import React, { useState, useMemo, useEffect } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import { DATA_BROKERS } from '../data/brokers';
import { getBrokerRecordSearchUrl } from '../utils/scanEngine';
import { initAuth, googleSignIn, getAccessToken, auth } from '../services/googleAuth';
import { sendGmailMessage, searchBrokerVerificationEmails, GmailMessageSummary } from '../services/gmailApi';
import { signOut, User } from 'firebase/auth';
import {
  Mail,
  Send,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  Search,
  RefreshCw,
  AlertTriangle,
  FileText,
  UserCheck,
  Lock,
  Inbox,
  Sparkles,
  Link2,
  ChevronRight
} from 'lucide-react';

interface GmailDispatchCenterProps {
  results: ScanResult[];
  profile: UserProfile;
  onMarkDispatched: (brokerId: string, messageId: string) => void;
  onOpenPowerOfAttorney: () => void;
}

export const GmailDispatchCenter: React.FC<GmailDispatchCenterProps> = ({
  results,
  profile,
  onMarkDispatched,
  onOpenPowerOfAttorney,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Selected broker for dispatch
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  // Sending status
  const [isSending, setIsSending] = useState(false);
  const [sendSuccessMsg, setSendSuccessMsg] = useState<string | null>(null);
  const [sendErrorMsg, setSendErrorMsg] = useState<string | null>(null);

  // Verification inbox scanner
  const [inboxEmails, setInboxEmails] = useState<GmailMessageSummary[]>([]);
  const [isSearchingInbox, setIsSearchingInbox] = useState(false);
  const [inboxSearched, setInboxSearched] = useState(false);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        setAccessToken(token);
        setAuthError(null);
      },
      () => {
        setCurrentUser(null);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Filter exposed brokers that have opt-out emails
  const exposedBrokers = useMemo(() => {
    const exposedMap = new Map(results.filter((r) => r.status === 'exposed').map((r) => [r.brokerId, r]));
    return DATA_BROKERS.filter((b) => exposedMap.has(b.id) && b.privacyEmail).map((b) => ({
      broker: b,
      result: exposedMap.get(b.id)!,
    }));
  }, [results]);

  // Set default selected broker if none selected
  useEffect(() => {
    if (!selectedBrokerId && exposedBrokers.length > 0) {
      setSelectedBrokerId(exposedBrokers[0].broker.id);
    }
  }, [exposedBrokers, selectedBrokerId]);

  const activeBroker = useMemo(() => {
    return DATA_BROKERS.find((b) => b.id === selectedBrokerId);
  }, [selectedBrokerId]);

  const activeResult = useMemo(() => {
    return results.find((r) => r.brokerId === selectedBrokerId);
  }, [results, selectedBrokerId]);

  // Generate legal statutory demand notice
  const statutoryNotice = useMemo(() => {
    if (!activeBroker) return { subject: '', body: '' };

    const subject = `LEGAL NOTICE: Statutory CCPA/CPRA/GDPR Data Expungement & Opt-Out Demand - ${profile.firstName} ${profile.lastName}`;
    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const primaryEmail = profile.emails[0] || 'user@privacy.shield';
    const primaryPhone = profile.phoneNumbers[0] || 'On file';
    const previousLocs = profile.previousLocations.length > 0 ? profile.previousLocations.join('; ') : 'None listed';

    const body = `DATE: ${dateStr}
TO: Privacy Officer & Legal Compliance, ${activeBroker.name} (${activeBroker.privacyEmail || 'privacy@broker'})
FROM: ${profile.firstName} ${profile.lastName} <${primaryEmail}>
RE: MANDATORY PERSONAL IDENTIFIABLE INFORMATION (PII) EXPUNGEMENT DEMAND
LEGAL CITATION: California Consumer Privacy Act (Cal. Civ. Code § 1798.100 et seq.), CPRA, and Applicable US State Privacy Statutes

To Whom It May Concern,

I am writing to exercise my statutory privacy rights to DELETE all personal information, consumer profiles, tracking dossiers, and public records associated with my identity from ${activeBroker.name} and all affiliated data networks, affiliates, and sub-processors.

IDENTIFYING INFORMATION FOR SEARCH & EXPUNGEMENT:
- Full Legal Name: ${profile.firstName} ${profile.lastName}
- Primary Email Address: ${primaryEmail}
- Primary Phone Number: ${primaryPhone}
- Current Residence: ${profile.currentCity}, ${profile.currentState}
- Previous Residences: ${previousLocs}
- Associated Record URL: ${getBrokerRecordSearchUrl(activeBroker, profile)}

STATUTORY DIRECTIVE:
1. Permanently delete and purge all records, dossiers, contact lists, and marketing segments containing my personal information.
2. Direct all data brokers, downstream buyers, and syndicates with whom you shared my data to delete it pursuant to statutory mandates.
3. Place my identifying attributes onto your permanent suppress / do-not-re-acquire list so my profile is never regenerated.
4. Provide written confirmation of compliance to ${primaryEmail} within the statutorily allotted timeframe (45 days maximum).

Failure to comply constitutes a willful violation of statutory data protection legislation and may be referred to the State Attorney General or California Privacy Protection Agency (CPPA) for civil enforcement.

Sincerely,
${profile.firstName} ${profile.lastName}
Authorized Consumer & Data Subject
Dispatched via synOUT Autonomous Privacy Gateway (Ref: synOUT-${activeBroker.id.toUpperCase()}-${Date.now().toString(36)})`;

    return { subject, body };
  }, [activeBroker, profile]);

  // Synchronize generated email body with editor when broker changes
  useEffect(() => {
    setCustomSubject(statutoryNotice.subject);
    setCustomBody(statutoryNotice.body);
    setSendSuccessMsg(null);
    setSendErrorMsg(null);
  }, [statutoryNotice]);

  const handleSignIn = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setCurrentUser(res.user);
        setAccessToken(res.accessToken);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Google authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
      setAccessToken(null);
    } catch (err: any) {
      console.error('Sign out error', err);
    }
  };

  const handleSendViaGmailApi = async () => {
    if (!activeBroker?.privacyEmail) {
      setSendErrorMsg('This broker does not have an automated email endpoint.');
      return;
    }
    const token = accessToken || (await getAccessToken());
    if (!token) {
      setSendErrorMsg('Please connect your Google Workspace / Gmail account to dispatch directly.');
      return;
    }

    setIsSending(true);
    setSendErrorMsg(null);
    setSendSuccessMsg(null);

    try {
      const response = await sendGmailMessage(
        token,
        activeBroker.privacyEmail,
        customSubject,
        customBody
      );
      setSendSuccessMsg(`Notice dispatched successfully via Gmail! ID: ${response.id}`);
      onMarkDispatched(activeBroker.id, response.id);
    } catch (err: any) {
      setSendErrorMsg(err.message || 'Failed to dispatch email via Gmail API.');
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyNotice = () => {
    navigator.clipboard.writeText(`${customSubject}\n\n${customBody}`);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleScanInboxForReplies = async () => {
    const token = accessToken || (await getAccessToken());
    if (!token) {
      setSendErrorMsg('Connect Google Account first to check incoming verification replies.');
      return;
    }

    setIsSearchingInbox(true);
    try {
      const emails = await searchBrokerVerificationEmails(token, activeBroker?.domain);
      setInboxEmails(emails);
      setInboxSearched(true);
    } catch (err: any) {
      setSendErrorMsg(err.message || 'Failed to check Gmail inbox for broker replies.');
    } finally {
      setIsSearchingInbox(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Top Banner */}
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 font-mono">
                <Mail className="w-3.5 h-3.5" /> Official Gmail API Dispatcher
              </span>
              <span className="text-xs text-slate-400">
                {exposedBrokers.length} Brokers with Statutory Opt-Out Inboxes
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Direct Statutory Deletion Dispatch Center
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              Authenticate securely with your Google Workspace / Gmail account to dispatch binding CCPA & CPRA deletion demands directly from your address and auto-detect incoming broker verification confirmation links.
            </p>
          </div>

          {/* Google Auth Status / Connect Button */}
          <div className="flex items-center gap-3">
            {currentUser ? (
              <div className="flex items-center gap-3 bg-slate-950 border border-slate-800 p-2.5 rounded-2xl">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'Google User'}
                    className="w-8 h-8 rounded-full border border-emerald-500/30"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                    {currentUser.email?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-left pr-2">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{currentUser.displayName || 'Authorized'}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]">
                    {currentUser.email}
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="px-2.5 py-1 text-[10px] font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                disabled={isAuthenticating}
                className="px-5 py-3 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs flex items-center gap-2.5 shadow-lg shadow-white/10 transition-all cursor-pointer disabled:opacity-50"
              >
                {isAuthenticating ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-900" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>Connect Google Workspace / Gmail</span>
              </button>
            )}

            <button
              onClick={onOpenPowerOfAttorney}
              className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
            >
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>Power of Attorney</span>
            </button>
          </div>
        </div>

        {authError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{authError}</span>
          </div>
        )}
      </div>

      {/* Main 2-Column Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Exposed Broker Queue */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Broker Inboxes ({exposedBrokers.length})
            </h2>
            <div className="relative w-44">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter brokers..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
            {exposedBrokers
              .filter(({ broker }) =>
                broker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                broker.domain.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map(({ broker, result }) => {
                const isSelected = broker.id === selectedBrokerId;
                return (
                  <button
                    key={broker.id}
                    onClick={() => setSelectedBrokerId(broker.id)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="space-y-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white truncate">{broker.name}</span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                            broker.risk === 'Critical'
                              ? 'bg-rose-500/20 text-rose-300'
                              : broker.risk === 'High'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          {broker.risk}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono truncate">
                        {broker.privacyEmail}
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isSelected ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                      )}
                    </div>
                  </button>
                );
              })}

            {exposedBrokers.length === 0 && (
              <div className="p-8 text-center bg-slate-900/50 border border-slate-800 rounded-2xl text-xs text-slate-500">
                No exposed brokers with opt-out email endpoints in the current scan results.
              </div>
            )}
          </div>
        </div>

        {/* Right: Statutory Notice Editor & Dispatch Controls */}
        <div className="lg:col-span-8 space-y-6">
          {activeBroker ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
              {/* Target Broker Summary */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                    Recipient Entity
                  </span>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-white">{activeBroker.name}</h3>
                    <a
                      href={`https://${activeBroker.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-400 hover:text-emerald-400 flex items-center gap-1 font-mono"
                    >
                      <span>{activeBroker.domain}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="text-xs text-emerald-400 font-mono flex items-center gap-1.5 pt-0.5">
                    <Mail className="w-3.5 h-3.5" />
                    <span>Statutory Recipient: {activeBroker.privacyEmail}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={getBrokerRecordSearchUrl(activeBroker, profile)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center gap-1.5 transition-colors"
                  >
                    <Search className="w-3.5 h-3.5 text-sky-400" />
                    <span>View Live Record</span>
                  </a>
                </div>
              </div>

              {/* Status / Feedback Notifications */}
              {sendSuccessMsg && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300 flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="space-y-0.5">
                    <span className="font-bold block">Notice Successfully Transmitted</span>
                    <span className="font-mono text-[11px] text-emerald-400">{sendSuccessMsg}</span>
                  </div>
                </div>
              )}

              {sendErrorMsg && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                  <span>{sendErrorMsg}</span>
                </div>
              )}

              {/* Email Content Inputs */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Statutory Subject Line</label>
                  <input
                    type="text"
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      Binding Legal Expungement Demand
                    </label>
                    <button
                      onClick={handleCopyNotice}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Letter</span>
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    rows={12}
                    value={customBody}
                    onChange={(e) => setCustomBody(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-emerald-500/50 resize-y"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleScanInboxForReplies}
                    disabled={isSearchingInbox || !currentUser}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {isSearchingInbox ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Inbox className="w-3.5 h-3.5 text-sky-400" />
                    )}
                    <span>Check Gmail for Broker Replies</span>
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {currentUser ? (
                    <button
                      onClick={handleSendViaGmailApi}
                      disabled={isSending}
                      className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSending ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                          <span>Transmitting via Gmail API...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5 text-slate-950" />
                          <span>Dispatch Statutory Notice via Gmail</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handleSignIn}
                      disabled={isAuthenticating}
                      className="px-6 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-white/20 transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                      <span>Connect Gmail to Dispatch</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Inbox Verification Results */}
              {inboxSearched && (
                <div className="pt-6 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <Inbox className="w-4 h-4 text-sky-400" />
                      Detected Responses & Verification Links ({inboxEmails.length})
                    </h4>
                  </div>

                  {inboxEmails.length > 0 ? (
                    <div className="space-y-2">
                      {inboxEmails.map((msg) => (
                        <div
                          key={msg.id}
                          className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-white">{msg.subject || 'No Subject'}</span>
                            <span className="text-[10px] text-slate-500 font-mono">{msg.date}</span>
                          </div>
                          <p className="text-[11px] text-slate-400">{msg.snippet}</p>
                          {msg.verificationLinks.length > 0 && (
                            <div className="space-y-1 pt-1">
                              <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase block">
                                Extracted Confirmation / Opt-Out Link:
                              </span>
                              {msg.verificationLinks.map((link, idx) => (
                                <a
                                  key={idx}
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-sky-400 hover:underline flex items-center gap-1 font-mono break-all"
                                >
                                  <Link2 className="w-3 h-3 shrink-0" />
                                  <span>{link}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-xl text-xs text-slate-500 text-center">
                      No matching confirmation or opt-out verification messages found in Gmail for{' '}
                      <strong>{activeBroker.name}</strong> yet. Most brokers take 24–72 hours to respond.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500">
              Select a broker from the left queue to view and dispatch their statutory deletion notice.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
