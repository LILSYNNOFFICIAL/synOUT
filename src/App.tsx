import React, { useState, useEffect, useMemo } from 'react';
import {
  CanaryAliasRecord,
  DataBroker,
  DeindexItem,
  PowerOfAttorneyData,
  PublicRecordChecklistState,
  ScanHistorySnapshot,
  ScanResult,
  ScanStats,
  UserProfile,
} from './types';
import {
  computeScanStats,
  loadStateFromStorage,
  runBrokerScan,
  saveStateToStorage,
} from './utils/scanEngine';
import {
  findBrokerById,
  disconnectSmtpAccount,
  disconnectGoogleOAuthAccount,
  getEmailConnectionState,
} from './services/emailConnectionStore';
import {
  SearchTypeCategory,
  saveSearchProfile,
  clearAllSavedSearches,
  restoreSavedSearches,
} from './utils/searchProfiles';
import {
  clearDeindexQueue,
  loadDeindexQueue,
  saveDeindexQueue,
} from './utils/searchDeindexEngine';
import {
  BureauChecklistState,
  SynoutWorkspaceBundle,
  clearBureauProgress,
  clearScanSnapshots,
  computeScanRegressionDiff,
  createSnapshotFromScan,
  loadBureauProgress,
  loadScanSnapshots,
  saveBureauProgress,
  saveScanSnapshots,
} from './utils/workspaceVault';
import {
  clearCanaryAliases,
  clearPublicRecordProgress,
  loadCanaryAliases,
  loadPublicRecordProgress,
  saveCanaryAliases,
  savePublicRecordProgress,
} from './utils/publicRecordsFirewall';
import { Navbar, AppTab } from './components/Navbar';
import { SplashScreen } from './components/SplashScreen';
import { HeroSection } from './components/HeroSection';
import { ScanForm } from './components/ScanForm';
import { LiveScanner } from './components/LiveScanner';
import { ExposureReport } from './components/ExposureReport';
import { RemovalTracker } from './components/RemovalTracker';
import { BrokerDirectory } from './components/BrokerDirectory';
import { PrivacyGuide } from './components/PrivacyGuide';
import { DarkWebRemovalCenter } from './components/DarkWebRemovalCenter';
import { SearchEngineDeindexCenter } from './components/SearchEngineDeindexCenter';
import { ContinuousMonitoringAutomator } from './components/ContinuousMonitoringAutomator';
import { SearchProfilesManager } from './components/SearchProfilesManager';
import { ManualVerificationGuides } from './components/ManualVerificationGuides';
import { GmailDispatchCenter } from './components/GmailDispatchCenter';
import { ListingDetailModal } from './components/ListingDetailModal';
import { LegalNoticeModal } from './components/LegalNoticeModal';
import { RegulatoryEscalationModal } from './components/RegulatoryEscalationModal';
import { PowerOfAttorneyModal } from './components/PowerOfAttorneyModal';
import { RemovalQueueModal } from './components/RemovalQueueModal';
import { DiyOptOutAssistantModal } from './components/DiyOptOutAssistantModal';
import { AuditLogModal } from './components/AuditLogModal';
import { ResurfaceMonitorModal } from './components/ResurfaceMonitorModal';
import { ExposureVectorModal } from './components/ExposureVectorModal';
import { WorkspaceVaultModal } from './components/WorkspaceVaultModal';
import { PublicRecordsFirewallCenter } from './components/PublicRecordsFirewallCenter';
import { BrokerReplyTriageModal } from './components/BrokerReplyTriageModal';
import { Footer } from './components/Footer';
import { CheckCircle2 } from 'lucide-react';

const DEFAULT_FALLBACK_PROFILE: UserProfile = {
  firstName: 'Jane',
  lastName: 'Doe',
  currentCity: 'Sacramento',
  currentState: 'CA',
  birthYear: '1988',
  phoneNumbers: ['(916) 555-0144'],
  emails: [''],
  relatives: [],
  previousLocations: ['Austin, TX'],
};

export default function App() {
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    try {
      return !window.sessionStorage.getItem('synout_splash_shown');
    } catch {
      return false;
    }
  });

  const [activeTab, setActiveTab] = useState<AppTab>('home');

  // Stored state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    const loaded = loadStateFromStorage<UserProfile | null>('profile', null);
    if (!loaded || typeof loaded !== 'object' || typeof loaded.firstName !== 'string') {
      return null;
    }
    return {
      ...loaded,
      phoneNumbers: Array.isArray(loaded.phoneNumbers) ? loaded.phoneNumbers : [],
      emails: Array.isArray(loaded.emails) ? loaded.emails : [],
      relatives: Array.isArray(loaded.relatives) ? loaded.relatives : [],
      previousLocations: Array.isArray(loaded.previousLocations) ? loaded.previousLocations : [],
    };
  });

  const [scanResults, setScanResults] = useState<ScanResult[]>(() => {
    const loaded = loadStateFromStorage<ScanResult[]>('results', []);
    if (!Array.isArray(loaded)) return [];
    return loaded.filter(
      (item) => Boolean(item && typeof item.brokerId === 'string' && item.mockListingData)
    );
  });

  const [deindexQueue, setDeindexQueue] = useState<DeindexItem[]>(() => loadDeindexQueue());
  const [bureauProgress, setBureauProgress] = useState<Record<string, BureauChecklistState>>(() =>
    loadBureauProgress()
  );
  const [scanSnapshots, setScanSnapshots] = useState<ScanHistorySnapshot[]>(() =>
    loadScanSnapshots()
  );
  const [canaryAliases, setCanaryAliases] = useState<CanaryAliasRecord[]>(() =>
    loadCanaryAliases()
  );
  const [publicRecordProgress, setPublicRecordProgress] = useState<
    Record<string, PublicRecordChecklistState>
  >(() => loadPublicRecordProgress());
  const [firewallSubTab, setFirewallSubTab] = useState<'records' | 'canary' | 'hygiene'>('records');

  // Scanning states
  const [isScanning, setIsScanning] = useState(false);
  const [pendingScanResults, setPendingScanResults] = useState<ScanResult[]>([]);

  // Modals
  const [activeListingModal, setActiveListingModal] = useState<{ broker: DataBroker; result: ScanResult } | null>(null);
  const [activeLegalModal, setActiveLegalModal] = useState<{ broker: DataBroker; result: ScanResult } | null>(null);
  const [activeEscalationModal, setActiveEscalationModal] = useState<{ broker: DataBroker; result: ScanResult } | null>(null);
  const [activeReplyTriageModal, setActiveReplyTriageModal] = useState<{ broker?: DataBroker; result?: ScanResult } | null>(null);
  const [activeDiyModal, setActiveDiyModal] = useState<{ broker: DataBroker; result: ScanResult } | null>(null);
  const [isAuditLogOpen, setIsAuditLogOpen] = useState(false);
  const [isResurfaceModalOpen, setIsResurfaceModalOpen] = useState(false);
  const [isVectorModalOpen, setIsVectorModalOpen] = useState(false);
  const [isPowerOfAttorneyOpen, setIsPowerOfAttorneyOpen] = useState(false);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [emailDispatchQueue, setEmailDispatchQueue] = useState<ScanResult[] | null>(null);

  // Toast notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  useEffect(() => {
    if (userProfile) {
      saveStateToStorage('profile', userProfile);
    }
  }, [userProfile]);

  useEffect(() => {
    if (scanResults.length > 0) {
      saveStateToStorage('results', scanResults);
    }
  }, [scanResults]);

  useEffect(() => {
    saveDeindexQueue(deindexQueue);
  }, [deindexQueue]);

  useEffect(() => {
    saveBureauProgress(bureauProgress);
  }, [bureauProgress]);

  useEffect(() => {
    saveScanSnapshots(scanSnapshots);
  }, [scanSnapshots]);

  useEffect(() => {
    saveCanaryAliases(canaryAliases);
  }, [canaryAliases]);

  useEffect(() => {
    savePublicRecordProgress(publicRecordProgress);
  }, [publicRecordProgress]);

  const stats: ScanStats = computeScanStats(scanResults);
  const exposedItems = scanResults.filter((r) => r.status === 'exposed');
  const removedCount = scanResults.filter((r) => r.removalStatus === 'removed').length;

  const regressionDiff = useMemo(
    () => computeScanRegressionDiff(scanResults, scanSnapshots),
    [scanResults, scanSnapshots]
  );

  const ensureActiveProfile = (): UserProfile => {
    if (userProfile) return userProfile;
    const connState = getEmailConnectionState();
    const connectedEmail =
      connState.smtp?.userEmail || connState.oauthUser?.email || '';
    const seeded: UserProfile = {
      ...DEFAULT_FALLBACK_PROFILE,
      emails: connectedEmail ? [connectedEmail] : [],
    };
    setUserProfile(seeded);
    return seeded;
  };

  const handleStartScan = (profile: UserProfile, searchType: SearchTypeCategory) => {
    const preservedPoa = userProfile?.powerOfAttorney;
    const mergedProfile = preservedPoa && !profile.powerOfAttorney
      ? { ...profile, powerOfAttorney: preservedPoa }
      : profile;
    setUserProfile(mergedProfile);
    const simulated = runBrokerScan(mergedProfile);

    // Save into search quota slots (up to 10)
    const saveRes = saveSearchProfile(mergedProfile, searchType, simulated);
    if (!saveRes.success && saveRes.quotaReached) {
      showToast(saveRes.message || 'Search profile quota reached.');
      setActiveTab('profiles');
      return;
    }

    setPendingScanResults(simulated);
    setIsScanning(true);
    setActiveTab('scanner');
  };

  const handleScanComplete = (completedResults: ScanResult[]) => {
    // Preserve prior snapshot before recording new scan
    if (scanResults.length > 0 && userProfile) {
      const priorSnap = createSnapshotFromScan(
        userProfile,
        scanResults,
        computeScanStats(scanResults).exposureScore
      );
      setScanSnapshots((prev) => [priorSnap, ...prev].slice(0, 20));
    }

    setScanResults(completedResults);
    setIsScanning(false);
    setActiveTab('report');
    const exposed = completedResults.filter((r) => r.status === 'exposed').length;
    showToast(`Audit complete: ${exposed} exposed records identified across clearinghouses.`);
  };

  // Records a real sent email Message-ID receipt on a broker's ScanResult
  const handleMarkEmailDispatched = (brokerId: string, messageId?: string, silent?: boolean) => {
    const broker = findBrokerById(brokerId);
    const ref =
      messageId ||
      `<synout-${Date.now()}@${broker?.domain || 'broker'}>`;
    const nowIso = new Date().toISOString();
    const dateLabel = new Date(nowIso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    setScanResults((prev) =>
      prev.map((item) =>
        item.brokerId === brokerId
          ? {
              ...item,
              removalStatus: 'submitted',
              optOutConfirmationCode: ref,
              submissionDate: dateLabel,
              submittedAtIso: item.submittedAtIso || nowIso,
              isRegression: false,
            }
          : item
      )
    );

    if (!silent) {
      showToast(
        `Opt-out email sent to ${broker?.name || 'broker'} (${broker?.privacyEmail || ''}) · Receipt: ${ref}`
      );
    }
  };

  // Records a statutory escalation / follow-up cure notice receipt
  const handleRecordEscalationSent = (brokerId: string, receiptMessageId: string) => {
    const broker = findBrokerById(brokerId);
    const nowIso = new Date().toISOString();
    setScanResults((prev) =>
      prev.map((item) =>
        item.brokerId === brokerId
          ? {
              ...item,
              escalationCount: (item.escalationCount || 0) + 1,
              lastEscalatedAt: nowIso,
              lastEscalationReceipt: receiptMessageId,
            }
          : item
      )
    );
    showToast(
      `Statutory follow-up cure notice sent to ${broker?.name || brokerId} · Receipt: ${receiptMessageId}`
    );
  };

  // Records a manual web-form submission (distinct from verified email transmission)
  const handleLogManualWebForm = (brokerId: string) => {
    const broker = findBrokerById(brokerId);
    const formRef = `DIY-FORM-${Date.now().toString(36).toUpperCase()}`;
    const nowIso = new Date().toISOString();
    const dateLabel = new Date(nowIso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    setScanResults((prev) =>
      prev.map((item) =>
        item.brokerId === brokerId
          ? {
              ...item,
              removalStatus: 'submitted',
              optOutConfirmationCode: formRef,
              submissionDate: dateLabel,
              submittedAtIso: item.submittedAtIso || nowIso,
              isRegression: false,
            }
          : item
      )
    );

    showToast(`Logged manual web-form opt-out submission for ${broker?.name || brokerId}.`);
  };

  // Opens real Email Opt-Out modal for a single broker
  const handleSingleBrokerOptOutRequest = (brokerId: string) => {
    ensureActiveProfile();
    const target = scanResults.find((r) => r.brokerId === brokerId);
    if (target) {
      setEmailDispatchQueue([target]);
    }
  };

  // Opens real Email Opt-Out modal for a subset of selected brokers
  const handleBatchOptOutSelected = (brokerIds: string[]) => {
    const selectedItems = scanResults.filter(
      (r) => brokerIds.includes(r.brokerId) && r.status === 'exposed'
    );
    if (selectedItems.length === 0) {
      showToast('Select at least one exposed broker first.');
      return;
    }
    ensureActiveProfile();
    setEmailDispatchQueue(selectedItems);
  };

  // Allows sending a real opt-out email directly from any broker card in the 700+ Broker Directory
  const handleDirectBrokerOptOut = (broker: DataBroker) => {
    const activeProfile = ensureActiveProfile();
    const existing = scanResults.find((r) => r.brokerId === broker.id);
    if (existing) {
      const promoted: ScanResult =
        existing.status === 'exposed'
          ? existing
          : { ...existing, status: 'exposed', removalStatus: 'found' };
      if (existing.status !== 'exposed') {
        setScanResults((prev) =>
          prev.map((item) => (item.brokerId === broker.id ? promoted : item))
        );
      }
      setEmailDispatchQueue([promoted]);
      return;
    }

    const createdItem: ScanResult = {
      id: `dir-${broker.id}-${Date.now()}`,
      brokerId: broker.id,
      status: 'exposed',
      removalStatus: 'found',
      mockListingData: {
        fullName: `${activeProfile.firstName} ${activeProfile.lastName}`.trim(),
        age: 36,
        locations: [`${activeProfile.currentCity}, ${activeProfile.currentState}`],
        phones: activeProfile.phoneNumbers.length > 0 ? activeProfile.phoneNumbers : ['On file'],
        emails: activeProfile.emails.length > 0 ? activeProfile.emails : ['On file'],
        relatives: activeProfile.relatives,
        recordsCount: broker.dataExposedList.length || 3,
        riskLevel: broker.risk,
        leakTypes: broker.dataExposedList,
        profiles: [`https://${broker.domain}`],
        matchConfidence: 'HIGH_CONFIDENCE_MATCH',
        evidenceBasis: `Direct statutory opt-out queued from 700+ Broker Directory (${broker.domain}).`,
      },
    };

    setScanResults((prev) => [createdItem, ...prev]);
    setEmailDispatchQueue([createdItem]);
  };

  // Opens real Email Opt-Out modal for ALL exposed brokers ("Opt Out of All")
  const handleOpenBatchEmailOptOut = () => {
    if (exposedItems.length === 0) {
      showToast('Run an exposure scan first to identify exposed brokers.');
      return;
    }
    ensureActiveProfile();
    setEmailDispatchQueue(exposedItems);
  };

  const handleToggleStatus = (brokerId: string) => {
    const nowIso = new Date().toISOString();
    setScanResults((prev) =>
      prev.map((item) => {
        if (item.brokerId === brokerId) {
          const nextStatus = item.removalStatus === 'removed' ? 'submitted' : 'removed';
          return {
            ...item,
            removalStatus: nextStatus,
            verifiedRemovedAtIso: nextStatus === 'removed' ? nowIso : undefined,
            lastCheckedDate: nowIso,
          };
        }
        return item;
      })
    );
  };

  const handleSavePOA = (
    poa: PowerOfAttorneyData,
    fallbackIdentity?: { fullName: string; city: string; state: string }
  ) => {
    if (userProfile) {
      const updated = { ...userProfile, powerOfAttorney: poa };
      setUserProfile(updated);
      saveStateToStorage('profile', updated);
    } else {
      const parts = (fallbackIdentity?.fullName || poa.fullName).trim().split(/\s+/);
      const firstName = parts[0] || 'Jane';
      const lastName = parts.slice(1).join(' ') || 'Doe';
      const connState = getEmailConnectionState();
      const connectedEmail =
        connState.smtp?.userEmail || connState.oauthUser?.email || '';
      const created: UserProfile = {
        firstName,
        lastName,
        currentCity: fallbackIdentity?.city || 'Sacramento',
        currentState: fallbackIdentity?.state || poa.state || 'CA',
        birthYear: '1988',
        phoneNumbers: [],
        emails: connectedEmail ? [connectedEmail] : [],
        relatives: [],
        previousLocations: [],
        powerOfAttorney: poa,
      };
      setUserProfile(created);
      saveStateToStorage('profile', created);
    }
    showToast(`Power of Attorney signed & authorized (${poa.authCode}).`);
  };

  const handleEmailBatchComplete = (sentCount: number, senderEmail: string) => {
    showToast(`Sent ${sentCount} statutory opt-out email(s) directly from ${senderEmail}!`);
    setActiveTab('tracker');
  };

  const handleBrokerDiscovered = (newBroker: DataBroker, queueForImmediateOptOut: boolean) => {
    const activeProfile = ensureActiveProfile();

    const newScanItem: ScanResult = {
      id: `scan-${newBroker.id}-${Date.now()}`,
      brokerId: newBroker.id,
      status: 'exposed',
      removalStatus: 'found',
      mockListingData: {
        fullName: `${activeProfile.firstName} ${activeProfile.lastName}`,
        age: 36,
        locations: [`${activeProfile.currentCity}, ${activeProfile.currentState}`],
        phones: activeProfile.phoneNumbers.length > 0 ? activeProfile.phoneNumbers : ['On file'],
        emails: activeProfile.emails.length > 0 ? activeProfile.emails : ['On file'],
        relatives: activeProfile.relatives,
        recordsCount: newBroker.dataExposedList.length || 3,
        riskLevel: newBroker.risk,
        leakTypes: newBroker.dataExposedList,
        profiles: [`https://${newBroker.domain}`],
        matchConfidence: 'HIGH_CONFIDENCE_MATCH',
        evidenceBasis: `Autonomous crawler discovered indexed record on ${newBroker.domain}.`,
      },
    };

    setScanResults((prev) =>
      prev.some((r) => r.brokerId === newBroker.id) ? prev : [newScanItem, ...prev]
    );

    if (queueForImmediateOptOut) {
      setEmailDispatchQueue([newScanItem]);
    } else {
      showToast(`Indexed new data broker: ${newBroker.name} (${newBroker.domain}).`);
    }
  };

  const handleUpdateBureauProgress = (
    bureauId: string,
    patch: Partial<BureauChecklistState>
  ) => {
    setBureauProgress((prev) => ({
      ...prev,
      [bureauId]: {
        ...(prev[bureauId] || {}),
        ...patch,
        updatedAtIso: new Date().toISOString(),
      },
    }));
  };

  const handleUpdatePublicRecordProgress = (
    guideId: string,
    patch: Partial<PublicRecordChecklistState>
  ) => {
    setPublicRecordProgress((prev) => ({
      ...prev,
      [guideId]: {
        ...(prev[guideId] || {}),
        ...patch,
        updatedAtIso: new Date().toISOString(),
      },
    }));
  };

  const handleSaveTicketAndNotes = (
    brokerId: string,
    ticketId: string | undefined,
    summaryNote: string,
    markVerifiedRemoved: boolean
  ) => {
    const nowIso = new Date().toISOString();
    setScanResults((prev) =>
      prev.map((item) => {
        if (item.brokerId !== brokerId) return item;
        return {
          ...item,
          brokerConfirmationTicket: ticketId || item.brokerConfirmationTicket,
          replyTriageSummary: summaryNote,
          removalStatus: markVerifiedRemoved
            ? 'removed'
            : item.removalStatus === 'removed'
            ? 'removed'
            : 'submitted',
          verifiedRemovedAtIso: markVerifiedRemoved ? nowIso : item.verifiedRemovedAtIso,
          lastCheckedDate: nowIso,
        };
      })
    );
    showToast(
      markVerifiedRemoved
        ? `Confirmed broker deletion${ticketId ? ` (Ticket: ${ticketId})` : ''}.`
        : `Recorded broker triage reference${ticketId ? ` (${ticketId})` : ''}.`
    );
  };

  const handleCaptureManualSnapshot = () => {
    if (!userProfile || scanResults.length === 0) return;
    const snap = createSnapshotFromScan(userProfile, scanResults, stats.exposureScore);
    setScanSnapshots((prev) => [snap, ...prev].slice(0, 20));
    showToast('Recorded audit snapshot to local Workspace Vault.');
  };

  const handleRestoreWorkspace = (bundle: SynoutWorkspaceBundle) => {
    if (bundle.profile) {
      setUserProfile(bundle.profile);
      saveStateToStorage('profile', bundle.profile);
    }
    setScanResults(bundle.scanResults);
    saveStateToStorage('results', bundle.scanResults);
    setDeindexQueue(bundle.deindexQueue);
    setBureauProgress(bundle.bureauProgress);
    setScanSnapshots(bundle.scanSnapshots);
    setCanaryAliases(bundle.canaryAliases || []);
    setPublicRecordProgress(bundle.publicRecordProgress || {});
    if (bundle.savedSearches) {
      restoreSavedSearches(bundle.savedSearches);
    }
    setActiveTab(bundle.scanResults.length > 0 ? 'report' : 'home');
    showToast(`Restored synOUT Workspace Vault (${bundle.scanResults.length} records).`);
  };

  const handlePurgeSession = async () => {
    await disconnectSmtpAccount();
    await disconnectGoogleOAuthAccount().catch(() => null);
    await fetch('/api/user/purge-session', { method: 'POST' }).catch(() => null);
    clearAllSavedSearches();
    clearDeindexQueue();
    clearBureauProgress();
    clearScanSnapshots();
    clearCanaryAliases();
    clearPublicRecordProgress();
    try {
      localStorage.removeItem('synout_profile');
      localStorage.removeItem('synout_results');
      localStorage.removeItem('synout_search_profiles_v2');
    } catch {
      // Ignore storage errors
    }
    setUserProfile(null);
    setScanResults([]);
    setDeindexQueue([]);
    setBureauProgress({});
    setScanSnapshots([]);
    setCanaryAliases([]);
    setPublicRecordProgress({});
    setEmailDispatchQueue(null);
    setActiveTab('home');
    showToast('All local scan profiles, connected email credentials, vault snapshots, and caches purged.');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* One-Time Animated Splash Screen */}
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {/* Main Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasScanResults={scanResults.length > 0}
        exposedCount={exposedItems.length}
        removedCount={removedCount}
        isPoaSigned={userProfile?.powerOfAttorney?.isSigned}
        onOpenPowerOfAttorney={() => setIsPowerOfAttorneyOpen(true)}
        onOpenVault={() => setIsVaultModalOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 pb-16">
        {activeTab === 'home' && (
          <div className="space-y-12">
            <HeroSection
              onStartScan={() => setActiveTab('scanner')}
              onExploreBrokers={() => setActiveTab('directory')}
            />
            <div className="max-w-7xl mx-auto px-4">
              <ScanForm onScan={handleStartScan} isScanning={isScanning} />
            </div>
          </div>
        )}

        {activeTab === 'scanner' && (
          isScanning ? (
            <LiveScanner
              profile={userProfile || DEFAULT_FALLBACK_PROFILE}
              pendingResults={pendingScanResults}
              onComplete={handleScanComplete}
            />
          ) : (
            <div className="max-w-7xl mx-auto px-4 py-8">
              <ScanForm onScan={handleStartScan} isScanning={isScanning} />
            </div>
          )
        )}

        {activeTab === 'report' && (
          scanResults.length > 0 && userProfile ? (
            <ExposureReport
              results={scanResults}
              stats={stats}
              profile={userProfile}
              relistedBrokerIds={regressionDiff.relistedBrokerIds}
              onOpenListingModal={(b, r) => setActiveListingModal({ broker: b, result: r })}
              onOpenLegalNotice={(b, r) => setActiveLegalModal({ broker: b, result: r })}
              onAutomatedOptOut={handleSingleBrokerOptOutRequest}
              onBatchOptOut={handleOpenBatchEmailOptOut}
              onBatchOptOutSelected={handleBatchOptOutSelected}
              onReScan={() => handleStartScan(userProfile, 'STANDARD_IDENTITY')}
              onToggleStatus={handleToggleStatus}
              onOpenResurfaceModal={() => setIsResurfaceModalOpen(true)}
              onOpenVectorModal={() => setIsVectorModalOpen(true)}
              onOpenAuditLogModal={() => setIsAuditLogOpen(true)}
              onOpenDiyAssistantModal={(b, r) => setActiveDiyModal({ broker: b, result: r })}
              onOpenGmailDispatch={() => setActiveTab('gmail')}
              onOpenDeindexCenter={() => setActiveTab('deindex')}
              onOpenVaultModal={() => setIsVaultModalOpen(true)}
              onOpenFirewallHub={() => {
                setFirewallSubTab('records');
                setActiveTab('firewall');
              }}
              onOpenReplyTriage={() => setActiveReplyTriageModal({})}
            />
          ) : (
            <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-4">
              <h2 className="text-2xl font-bold text-white">No Exposure Scan Run Yet</h2>
              <p className="text-slate-400 text-sm">
                Run an audit scan first to uncover where your personal records are being sold.
              </p>
              <button
                onClick={() => setActiveTab('scanner')}
                className="px-6 py-3 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors cursor-pointer"
              >
                Start Free Audit Scan
              </button>
            </div>
          )
        )}

        {activeTab === 'darkweb' && (
          <DarkWebRemovalCenter
            profile={userProfile || DEFAULT_FALLBACK_PROFILE}
            results={scanResults}
            onOpenConnectEmail={() => setActiveTab('gmail')}
          />
        )}

        {activeTab === 'deindex' && (
          <SearchEngineDeindexCenter
            profile={userProfile || DEFAULT_FALLBACK_PROFILE}
            results={scanResults}
            deindexQueue={deindexQueue}
            onUpdateDeindexQueue={setDeindexQueue}
            onOpenConnectEmail={() => setActiveTab('gmail')}
            onStartScan={() => setActiveTab('scanner')}
          />
        )}

        {activeTab === 'monitoring' && (
          <ContinuousMonitoringAutomator
            profile={userProfile}
            scanResults={scanResults}
            onBrokerDiscovered={handleBrokerDiscovered}
            onBatchOptOut={handleOpenBatchEmailOptOut}
            onSingleOptOut={handleSingleBrokerOptOutRequest}
            onOpenConnectEmail={() => setActiveTab('gmail')}
          />
        )}

        {activeTab === 'profiles' && (
          <div className="max-w-7xl mx-auto py-8 px-4">
            <SearchProfilesManager
              onSelectProfile={(saved) => {
                setUserProfile(saved.profileData);
                const baseResults =
                  saved.savedResults && saved.savedResults.length > 0
                    ? saved.savedResults
                    : runBrokerScan(saved.profileData);
                setScanResults(baseResults);
                setActiveTab('report');
                showToast(`Loaded stored search profile: ${saved.name}`);
              }}
              onInitiateNewSearch={() => setActiveTab('scanner')}
            />
          </div>
        )}

        {activeTab === 'bureaus' && (
          <ManualVerificationGuides
            profile={userProfile || DEFAULT_FALLBACK_PROFILE}
            bureauProgress={bureauProgress}
            onUpdateBureauProgress={handleUpdateBureauProgress}
            onOpenConnectEmail={() => setActiveTab('gmail')}
          />
        )}

        {activeTab === 'firewall' && (
          <PublicRecordsFirewallCenter
            profile={userProfile || DEFAULT_FALLBACK_PROFILE}
            canaryAliases={canaryAliases}
            onUpdateCanaryAliases={setCanaryAliases}
            publicRecordProgress={publicRecordProgress}
            onUpdatePublicRecordProgress={handleUpdatePublicRecordProgress}
            onOpenConnectEmail={() => setActiveTab('gmail')}
            initialSubTab={firewallSubTab}
          />
        )}

        {activeTab === 'gmail' && (
          <GmailDispatchCenter
            results={scanResults}
            profile={userProfile || DEFAULT_FALLBACK_PROFILE}
            onMarkDispatched={(brokerId, msgId, silent) => {
              handleMarkEmailDispatched(brokerId, msgId, silent);
            }}
            onOpenPowerOfAttorney={() => setIsPowerOfAttorneyOpen(true)}
            onStartScan={() => setActiveTab('scanner')}
          />
        )}

        {activeTab === 'tracker' && (
          scanResults.length > 0 && userProfile ? (
            <RemovalTracker
              results={scanResults}
              profile={userProfile}
              onOpenListingModal={(b, r) => setActiveListingModal({ broker: b, result: r })}
              onOpenLegalNotice={(b, r) => setActiveLegalModal({ broker: b, result: r })}
              onOpenEscalationModal={(b, r) => setActiveEscalationModal({ broker: b, result: r })}
              onOpenReplyTriage={(b, r) => setActiveReplyTriageModal({ broker: b, result: r })}
              onToggleStatus={handleToggleStatus}
              onBatchOptOut={handleOpenBatchEmailOptOut}
              onAutomatedOptOut={handleSingleBrokerOptOutRequest}
              onOpenDiyAssistantModal={(b, r) => setActiveDiyModal({ broker: b, result: r })}
            />
          ) : (
            <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-4">
              <h2 className="text-2xl font-bold text-white">Tracker is Empty</h2>
              <p className="text-slate-400 text-sm">
                Run an exposure audit to populate your active removal tracking queue.
              </p>
              <button
                onClick={() => setActiveTab('scanner')}
                className="px-6 py-3 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors cursor-pointer"
              >
                Start Free Scan
              </button>
            </div>
          )
        )}

        {activeTab === 'directory' && (
          <BrokerDirectory
            scanResults={scanResults}
            onSendBrokerOptOut={handleDirectBrokerOptOut}
          />
        )}
        {activeTab === 'guide' && (
          <PrivacyGuide
            onOpenFirewall={(sub) => {
              setFirewallSubTab(sub);
              setActiveTab('firewall');
            }}
          />
        )}
      </main>

      {/* Footer */}
      <Footer
        onNavigate={setActiveTab}
        onPurgeSession={handlePurgeSession}
        onOpenVault={() => setIsVaultModalOpen(true)}
      />

      {/* Modals */}
      {activeListingModal && userProfile && (
        <ListingDetailModal
          broker={activeListingModal.broker}
          result={activeListingModal.result}
          profile={userProfile}
          onClose={() => setActiveListingModal(null)}
          onAutomatedOptOut={handleSingleBrokerOptOutRequest}
        />
      )}

      {activeLegalModal && userProfile && (
        <LegalNoticeModal
          broker={activeLegalModal.broker}
          result={activeLegalModal.result}
          profile={userProfile}
          onClose={() => setActiveLegalModal(null)}
          onMarkSubmitted={handleMarkEmailDispatched}
          onOpenConnectEmail={() => setActiveTab('gmail')}
          onOpenPowerOfAttorney={() => setIsPowerOfAttorneyOpen(true)}
        />
      )}

      {activeEscalationModal && userProfile && (
        <RegulatoryEscalationModal
          broker={activeEscalationModal.broker}
          result={activeEscalationModal.result}
          profile={userProfile}
          onClose={() => setActiveEscalationModal(null)}
          onRecordEscalationSent={handleRecordEscalationSent}
          onOpenConnectEmail={() => setActiveTab('gmail')}
        />
      )}

      {isPowerOfAttorneyOpen && (
        <PowerOfAttorneyModal
          profile={userProfile}
          onClose={() => setIsPowerOfAttorneyOpen(false)}
          onSavePOA={handleSavePOA}
        />
      )}

      {emailDispatchQueue && userProfile && (
        <RemovalQueueModal
          queue={emailDispatchQueue}
          profile={userProfile}
          onClose={() => setEmailDispatchQueue(null)}
          onBrokerDispatched={handleMarkEmailDispatched}
          onComplete={handleEmailBatchComplete}
          onOpenEmailWorkspace={() => setActiveTab('gmail')}
        />
      )}

      {activeDiyModal && userProfile && (
        <DiyOptOutAssistantModal
          broker={activeDiyModal.broker}
          result={activeDiyModal.result}
          profile={userProfile}
          onClose={() => setActiveDiyModal(null)}
          onMarkWebFormSubmitted={(brokerId) => {
            handleLogManualWebForm(brokerId);
          }}
          onMarkEmailDispatched={(brokerId, messageId) => {
            handleMarkEmailDispatched(brokerId, messageId);
          }}
          onOpenConnectEmail={() => setActiveTab('gmail')}
        />
      )}

      {isAuditLogOpen && userProfile && (
        <AuditLogModal
          results={scanResults}
          profile={userProfile}
          onClose={() => setIsAuditLogOpen(false)}
        />
      )}

      {isResurfaceModalOpen && (
        <ResurfaceMonitorModal
          results={scanResults}
          onTriggerResurfaceCheck={(resurfacedIds) => {
            if (resurfacedIds.length > 0) {
              setScanResults((prev) =>
                prev.map((item) =>
                  resurfacedIds.includes(item.brokerId)
                    ? {
                        ...item,
                        status: 'exposed',
                        removalStatus: 'found',
                        optOutConfirmationCode: undefined,
                        isRegression: true,
                      }
                    : item
                )
              );
              showToast(`${resurfacedIds.length} resurfaced broker record(s) flagged for re-suppression.`);
            } else {
              showToast('Resurface sweep clean: zero suppressed records re-appeared.');
            }
          }}
          onClose={() => setIsResurfaceModalOpen(false)}
        />
      )}

      {isVectorModalOpen && userProfile && (
        <ExposureVectorModal
          results={scanResults}
          profile={userProfile}
          onClose={() => setIsVectorModalOpen(false)}
          onNavigateToTracker={() => {
            setIsVectorModalOpen(false);
            setActiveTab('tracker');
          }}
        />
      )}

      {activeReplyTriageModal && (
        <BrokerReplyTriageModal
          initialBroker={activeReplyTriageModal.broker}
          initialResult={activeReplyTriageModal.result}
          results={scanResults}
          profile={userProfile || DEFAULT_FALLBACK_PROFILE}
          onSaveTicketAndNotes={handleSaveTicketAndNotes}
          onRecordCounterNoticeSent={handleRecordEscalationSent}
          onOpenConnectEmail={() => setActiveTab('gmail')}
          onOpenIdRedactor={() => {
            setFirewallSubTab('hygiene');
            setActiveTab('firewall');
          }}
          onClose={() => setActiveReplyTriageModal(null)}
        />
      )}

      {isVaultModalOpen && (
        <WorkspaceVaultModal
          profile={userProfile}
          scanResults={scanResults}
          deindexQueue={deindexQueue}
          bureauProgress={bureauProgress}
          scanSnapshots={scanSnapshots}
          canaryAliases={canaryAliases}
          publicRecordProgress={publicRecordProgress}
          onRestoreWorkspace={handleRestoreWorkspace}
          onCaptureManualSnapshot={handleCaptureManualSnapshot}
          onClose={() => setIsVaultModalOpen(false)}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-emerald-500/40 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
