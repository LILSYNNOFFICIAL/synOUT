import React, { useState, useEffect } from 'react';
import { DATA_BROKERS } from './data/brokers';
import { DataBroker, ScanResult, ScanStats, UserProfile, PowerOfAttorneyData } from './types';
import { computeScanStats, loadStateFromStorage, runBrokerScan, saveStateToStorage } from './utils/scanEngine';
import { SearchTypeCategory, saveSearchProfile, StoredSearchProfile } from './utils/searchProfiles';
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
import { ContinuousMonitoringAutomator } from './components/ContinuousMonitoringAutomator';
import { SearchProfilesManager } from './components/SearchProfilesManager';
import { ManualVerificationGuides } from './components/ManualVerificationGuides';
import { GmailDispatchCenter } from './components/GmailDispatchCenter';
import { ListingDetailModal } from './components/ListingDetailModal';
import { LegalNoticeModal } from './components/LegalNoticeModal';
import { PowerOfAttorneyModal } from './components/PowerOfAttorneyModal';
import { RemovalQueueModal } from './components/RemovalQueueModal';
import { Footer } from './components/Footer';

export default function App() {
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    return !sessionStorage.getItem('synout_splash_shown');
  });

  const [activeTab, setActiveTab] = useState<AppTab>('home');

  // Stored state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() =>
    loadStateFromStorage<UserProfile | null>('profile', null)
  );

  const [scanResults, setScanResults] = useState<ScanResult[]>(() =>
    loadStateFromStorage<ScanResult[]>('results', [])
  );

  // Scanning states
  const [isScanning, setIsScanning] = useState(false);
  const [pendingScanResults, setPendingScanResults] = useState<ScanResult[]>([]);

  // Modals
  const [activeListingModal, setActiveListingModal] = useState<{ broker: DataBroker; result: ScanResult } | null>(null);
  const [activeLegalModal, setActiveLegalModal] = useState<{ broker: DataBroker; result: ScanResult } | null>(null);
  const [isPowerOfAttorneyOpen, setIsPowerOfAttorneyOpen] = useState(false);
  const [isBatchRemovalOpen, setIsBatchRemovalOpen] = useState(false);

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

  const stats: ScanStats = computeScanStats(scanResults);
  const exposedItems = scanResults.filter((r) => r.status === 'exposed');
  const removedCount = scanResults.filter((r) => r.removalStatus === 'removed').length;

  const handleStartScan = (profile: UserProfile, searchType: SearchTypeCategory) => {
    setUserProfile(profile);
    const simulated = runBrokerScan(profile);

    // Save into search quota slots (up to 10)
    const saveRes = saveSearchProfile(profile, searchType, simulated);
    if (!saveRes.success && saveRes.quotaReached) {
      alert(saveRes.message);
      setActiveTab('profiles');
      return;
    }

    setPendingScanResults(simulated);
    setIsScanning(true);
    setActiveTab('scanner');
  };

  const handleScanComplete = (completedResults: ScanResult[]) => {
    setScanResults(completedResults);
    setIsScanning(false);
    setActiveTab('report');
    const exposed = completedResults.filter((r) => r.status === 'exposed').length;
    showToast(`Audit complete: ${exposed} exposed records identified across clearinghouses.`);
  };

  const handleAutomatedOptOut = (brokerId: string) => {
    const broker = DATA_BROKERS.find((b) => b.id === brokerId);
    const ref = `SYN-${Math.floor(1000 + Math.random() * 9000)}-${broker ? broker.id.slice(0, 3).toUpperCase() : 'BRK'}`;

    setScanResults((prev) =>
      prev.map((item) =>
        item.brokerId === brokerId
          ? {
              ...item,
              removalStatus: 'submitted',
              optOutConfirmationCode: ref,
              submissionDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            }
          : item
      )
    );

    showToast(`Opt-out demand dispatched to ${broker?.name || 'broker'} (Ref: ${ref}). 15-45 day statutory review.`);
  };

  const handleToggleStatus = (brokerId: string) => {
    setScanResults((prev) =>
      prev.map((item) => {
        if (item.brokerId === brokerId) {
          const nextStatus = item.removalStatus === 'removed' ? 'submitted' : 'removed';
          return { ...item, removalStatus: nextStatus, lastCheckedDate: new Date().toISOString() };
        }
        return item;
      })
    );
  };

  const handleSavePOA = (poa: PowerOfAttorneyData) => {
    if (userProfile) {
      const updated = { ...userProfile, powerOfAttorney: poa };
      setUserProfile(updated);
      saveStateToStorage('profile', updated);
      showToast(`Power of Attorney signed & authorized! (${poa.authCode})`);
    }
  };

  const handleBatchOptOutComplete = (updatedResults: ScanResult[]) => {
    setScanResults((prev) => {
      const map = new Map(updatedResults.map((r) => [r.id, r]));
      return prev.map((item) => map.get(item.id) || item);
    });
    showToast(`All ${updatedResults.length} statutory removal demands dispatched successfully!`);
    setActiveTab('tracker');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* One-Time Animated Futuristic Splash Screen */}
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
              profile={userProfile || {
                firstName: 'Jane',
                lastName: 'Doe',
                currentCity: 'Sacramento',
                currentState: 'CA',
                birthYear: '1988',
                phoneNumbers: ['(916) 555-0144'],
                emails: ['synovamedia@gmail.com'],
                relatives: [],
                previousLocations: ['Austin, TX'],
              }}
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
              onOpenListingModal={(b, r) => setActiveListingModal({ broker: b, result: r })}
              onOpenLegalNotice={(b, r) => setActiveLegalModal({ broker: b, result: r })}
              onAutomatedOptOut={handleAutomatedOptOut}
              onBatchOptOut={() => setIsBatchRemovalOpen(true)}
              onReScan={() => handleStartScan(userProfile, 'STANDARD_IDENTITY')}
              onToggleStatus={handleToggleStatus}
              onOpenResurfaceModal={() => {}}
              onOpenVectorModal={() => {}}
              onOpenAuditLogModal={() => {}}
              onOpenDiyAssistantModal={() => {}}
              onOpenGmailDispatch={() => setActiveTab('gmail')}
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
            profile={userProfile || {
              firstName: 'Jane',
              lastName: 'Doe',
              currentCity: 'Sacramento',
              currentState: 'CA',
              birthYear: '1988',
              phoneNumbers: ['(916) 555-0144'],
              emails: ['synovamedia@gmail.com'],
              relatives: [],
              previousLocations: ['Austin, TX'],
            }}
            results={scanResults}
          />
        )}

        {activeTab === 'monitoring' && (
          <ContinuousMonitoringAutomator
            profile={userProfile}
            scanResults={scanResults}
            onAutoPurge={(brokerId, msg) => {
              handleAutomatedOptOut(brokerId);
              showToast(msg);
            }}
          />
        )}

        {activeTab === 'profiles' && (
          <div className="max-w-7xl mx-auto py-8 px-4">
            <SearchProfilesManager
              onSelectProfile={(saved) => {
                setUserProfile(saved.profileData);
                const res = runBrokerScan(saved.profileData);
                setScanResults(res);
                setActiveTab('report');
                showToast(`Loaded stored search profile: ${saved.name}`);
              }}
              onInitiateNewSearch={() => setActiveTab('scanner')}
            />
          </div>
        )}

        {activeTab === 'bureaus' && (
          <ManualVerificationGuides
            profile={userProfile || {
              firstName: 'Jane',
              lastName: 'Doe',
              currentCity: 'Sacramento',
              currentState: 'CA',
              birthYear: '1988',
              phoneNumbers: ['(916) 555-0144'],
              emails: ['synovamedia@gmail.com'],
              relatives: [],
              previousLocations: ['Austin, TX'],
            }}
          />
        )}

        {activeTab === 'gmail' && (
          userProfile ? (
            <GmailDispatchCenter
              results={scanResults}
              profile={userProfile}
              onMarkDispatched={(brokerId, msgId) => {
                handleAutomatedOptOut(brokerId);
                showToast(`Notice dispatched to broker! Ref: ${msgId}`);
              }}
              onOpenPowerOfAttorney={() => setIsPowerOfAttorneyOpen(true)}
            />
          ) : (
            <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-4">
              <h2 className="text-2xl font-bold text-white">No Exposed Brokers in Queue</h2>
              <p className="text-slate-400 text-sm">
                Run an exposure scan first to generate customized legal deletion letters for each broker.
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

        {activeTab === 'tracker' && (
          scanResults.length > 0 && userProfile ? (
            <RemovalTracker
              results={scanResults}
              profile={userProfile}
              onOpenListingModal={(b, r) => setActiveListingModal({ broker: b, result: r })}
              onOpenLegalNotice={(b, r) => setActiveLegalModal({ broker: b, result: r })}
              onToggleStatus={handleToggleStatus}
              onBatchOptOut={() => setIsBatchRemovalOpen(true)}
              onOpenDiyAssistantModal={() => {}}
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

        {activeTab === 'directory' && <BrokerDirectory />}
        {activeTab === 'guide' && <PrivacyGuide />}
      </main>

      {/* Footer */}
      <Footer onNavigate={setActiveTab} />

      {/* Modals */}
      {activeListingModal && userProfile && (
        <ListingDetailModal
          broker={activeListingModal.broker}
          result={activeListingModal.result}
          profile={userProfile}
          onClose={() => setActiveListingModal(null)}
          onAutomatedOptOut={handleAutomatedOptOut}
        />
      )}

      {activeLegalModal && userProfile && (
        <LegalNoticeModal
          broker={activeLegalModal.broker}
          result={activeLegalModal.result}
          profile={userProfile}
          onClose={() => setActiveLegalModal(null)}
          onMarkSubmitted={handleAutomatedOptOut}
        />
      )}

      {isPowerOfAttorneyOpen && userProfile && (
        <PowerOfAttorneyModal
          profile={userProfile}
          onClose={() => setIsPowerOfAttorneyOpen(false)}
          onSavePOA={handleSavePOA}
        />
      )}

      {isBatchRemovalOpen && (
        <RemovalQueueModal
          queue={exposedItems}
          onClose={() => setIsBatchRemovalOpen(false)}
          onComplete={handleBatchOptOutComplete}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-emerald-500/40 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
