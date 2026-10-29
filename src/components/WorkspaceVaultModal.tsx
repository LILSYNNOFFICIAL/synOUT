import React, { useState } from 'react';
import {
  CanaryAliasRecord,
  DeindexItem,
  PublicRecordChecklistState,
  ScanHistorySnapshot,
  ScanResult,
  UserProfile,
} from '../types';
import {
  BureauChecklistState,
  EncryptedWorkspaceEnvelope,
  SynoutWorkspaceBundle,
  computeScanRegressionDiff,
  decryptWorkspaceBundle,
  encryptWorkspaceBundle,
  isEncryptedVaultJson,
  parsePlainWorkspaceBundle,
} from '../utils/workspaceVault';
import { getSavedSearches } from '../utils/searchProfiles';
import { findBrokerById } from '../services/emailConnectionStore';
import { getBrokerContactOverrides } from '../utils/brokerContactResolver';
import { downloadFile } from '../utils/exportEngines';
import {
  pullAndDecryptCloudVault,
  pushEncryptedBundleToCloud,
  setCloudVaultAutoSync,
  signInCloudVaultWithGoogle,
  signOutCloudVault,
  useCloudVaultState,
} from '../services/cloudVaultSync';
import {
  X,
  Lock,
  Download,
  Upload,
  History,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Plus,
  Cloud,
  RefreshCw,
  LogOut,
} from 'lucide-react';

interface WorkspaceVaultModalProps {
  profile: UserProfile | null;
  scanResults: ScanResult[];
  deindexQueue: DeindexItem[];
  bureauProgress: Record<string, BureauChecklistState>;
  scanSnapshots: ScanHistorySnapshot[];
  canaryAliases?: CanaryAliasRecord[];
  publicRecordProgress?: Record<string, PublicRecordChecklistState>;
  onRestoreWorkspace: (bundle: SynoutWorkspaceBundle) => void;
  onCaptureManualSnapshot: () => void;
  onClose: () => void;
}

export const WorkspaceVaultModal: React.FC<WorkspaceVaultModalProps> = ({
  profile,
  scanResults,
  deindexQueue,
  bureauProgress,
  scanSnapshots,
  canaryAliases = [],
  publicRecordProgress = {},
  onRestoreWorkspace,
  onCaptureManualSnapshot,
  onClose,
}) => {
  const cloudState = useCloudVaultState();
  const [activeSection, setActiveSection] = useState<'cloud' | 'export' | 'import' | 'snapshots'>(
    cloudState.configured ? 'cloud' : 'export'
  );
  const [useEncryption, setUseEncryption] = useState(true);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [cloudPassphrase, setCloudPassphrase] = useState('');
  const [cloudFeedback, setCloudFeedback] = useState<string | null>(null);
  const [cloudLocalError, setCloudLocalError] = useState<string | null>(null);
  const [isPullingCloud, setIsPullingCloud] = useState(false);

  const [rawImportJson, setRawImportJson] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const savedSearches = getSavedSearches();
  const regressionDiff = computeScanRegressionDiff(scanResults, scanSnapshots);
  const needsDecryptPassphrase = rawImportJson.trim() ? isEncryptedVaultJson(rawImportJson) : false;

  const buildCurrentBundle = (): SynoutWorkspaceBundle => ({
    schema: 'synOUT-workspace-vault-v1',
    exportedAtIso: new Date().toISOString(),
    profile,
    scanResults,
    savedSearches,
    deindexQueue,
    bureauProgress,
    scanSnapshots,
    canaryAliases,
    publicRecordProgress,
    brokerContactOverrides: getBrokerContactOverrides(),
  });

  const handleExportVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setExportError(null);
    setExportSuccess(null);
    setIsExporting(true);

    try {
      const bundle = buildCurrentBundle();
      const slug = profile ? `${profile.lastName.toLowerCase()}` : 'workspace';
      if (useEncryption) {
        const encrypted = await encryptWorkspaceBundle(bundle, exportPassphrase);
        downloadFile(
          JSON.stringify(encrypted, null, 2),
          `synout-vault-${slug}.enc.json`,
          'application/json'
        );
        setExportSuccess('Downloaded AES-256-GCM encrypted workspace vault (.enc.json).');
        setExportPassphrase('');
      } else {
        downloadFile(
          JSON.stringify(bundle, null, 2),
          `synout-workspace-${slug}.json`,
          'application/json'
        );
        setExportSuccess('Downloaded portable workspace backup (.json).');
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export workspace backup.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRawImportJson(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawImportJson.trim()) {
      setImportError('Upload a synOUT backup file or paste backup JSON first.');
      return;
    }
    setImportError(null);
    setIsImporting(true);
    try {
      let bundle: SynoutWorkspaceBundle;
      if (needsDecryptPassphrase) {
        const envelope = JSON.parse(rawImportJson) as EncryptedWorkspaceEnvelope;
        bundle = await decryptWorkspaceBundle(envelope, importPassphrase);
      } else {
        bundle = parsePlainWorkspaceBundle(rawImportJson);
      }
      onRestoreWorkspace(bundle);
      onClose();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not restore backup archive.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-popover rounded-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 my-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/[0.08]">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
              <Lock className="w-3.5 h-3.5" />
              <span>Zero-Knowledge Encrypted Vault · AES-256-GCM + Cloud Sync</span>
            </div>
            <h2 className="text-xl font-bold text-white">
              Encrypted Workspace Vault &amp; Cross-Device Cloud Sync
            </h2>
            <p className="text-xs text-slate-400">
              Sync your scan profiles, removal receipts, POA, and 45-day SLA countdowns across your phone and computer—encrypted locally with your passphrase before leaving your browser.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap p-1 glass-subtle rounded-xl gap-1">
          <button
            type="button"
            onClick={() => setActiveSection('cloud')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
              activeSection === 'cloud'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Cloud Sync</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('export')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeSection === 'export'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Local Export
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('import')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeSection === 'import'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Restore File
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('snapshots')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
              activeSection === 'snapshots'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Snapshots ({scanSnapshots.length})
          </button>
        </div>

        {activeSection === 'cloud' && (
          <div className="space-y-4 text-xs">
            {!cloudState.configured ? (
              <div className="p-4 glass-subtle rounded-xl text-slate-300 space-y-2">
                <div className="font-semibold text-white">Local-Only Build Detected</div>
                <p className="text-slate-400">
                  Cloud Sync is unavailable on static offline mirrors without a Firebase project config. Use <strong>Local Export</strong> to save an AES-256-GCM encrypted `.enc.json` vault file.
                </p>
              </div>
            ) : !cloudState.user ? (
              <div className="p-5 glass-subtle rounded-xl space-y-4 border border-emerald-400/20">
                <div className="space-y-1">
                  <div className="font-bold text-white text-sm">
                    Sign in to Sync Across Phone &amp; Computer
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Your scan profiles, broker receipts, POA signature, and 45-day SLA timers are encrypted client-side with <strong>AES-256-GCM</strong> (PBKDF2 250,000 iterations) before touching cloud storage.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setCloudLocalError(null);
                    setCloudFeedback(null);
                    try {
                      await signInCloudVaultWithGoogle();
                      setCloudFeedback('Signed in with Google. Enter your vault passphrase below to push or unlock your cloud vault.');
                    } catch (err) {
                      setCloudLocalError(
                        err instanceof Error ? err.message : 'Google Sign-In was cancelled or failed.'
                      );
                    }
                  }}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <Cloud className="w-4 h-4" />
                  <span>Sign in with Google for Encrypted Cloud Sync</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3.5 glass-subtle rounded-xl flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="font-bold text-white flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{cloudState.user.displayName || 'Connected Account'}</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">
                      {cloudState.user.email} · {cloudState.vaultUnlockedInSession ? 'Session Key Unlocked' : 'Passphrase Required to Sync'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void signOutCloudVault()}
                    className="px-3 py-1.5 rounded-lg glass-card text-slate-300 hover:text-white inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>

                {cloudState.remoteVault && (
                  <div className="p-3.5 glass-subtle rounded-xl border border-sky-400/20 space-y-2 tabular-nums">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-sky-300">
                        Cloud Snapshot Available · {cloudState.remoteVault.deviceLabel}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {cloudState.remoteVault.updatedAtIso
                          ? new Date(cloudState.remoteVault.updatedAtIso).toLocaleString()
                          : 'Just now'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-slate-300">
                      <span>{cloudState.remoteVault.exposedCount} Exposed</span>
                      <span>{cloudState.remoteVault.trackedCount} SLA Tracked</span>
                      <span className="text-emerald-400">{cloudState.remoteVault.removedCount} Removed</span>
                      <span className="text-slate-500">
                        SHA-256 {cloudState.remoteVault.payloadSha256.slice(0, 12)}…
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block font-semibold text-slate-300">
                    Zero-Knowledge Vault Passphrase (8+ characters — never sent to server)
                  </label>
                  <input
                    type="password"
                    minLength={8}
                    maxLength={128}
                    value={cloudPassphrase}
                    onChange={(e) => setCloudPassphrase(e.target.value)}
                    placeholder={
                      cloudState.vaultUnlockedInSession
                        ? 'Session unlocked (leave blank to reuse current session passphrase)...'
                        : 'Enter your 8+ character encryption passphrase...'
                    }
                    className="w-full glass-input rounded-xl px-3.5 py-2.5 text-white font-mono placeholder-slate-500"
                  />
                </div>

                <label className="flex items-center gap-2.5 p-3 glass-subtle rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cloudState.autoSyncEnabled}
                    onChange={(e) => setCloudVaultAutoSync(e.target.checked)}
                    className="rounded border-white/20 bg-slate-950 text-emerald-500"
                  />
                  <span className="text-slate-300">
                    Automatically sync encrypted updates across devices while unlocked in this session
                  </span>
                </label>

                <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
                  {cloudState.remoteVault && (
                    <button
                      type="button"
                      disabled={isPullingCloud || cloudState.isSyncing}
                      onClick={async () => {
                        setCloudLocalError(null);
                        setCloudFeedback(null);
                        setIsPullingCloud(true);
                        try {
                          const restored = await pullAndDecryptCloudVault(
                            cloudPassphrase.trim() || undefined
                          );
                          onRestoreWorkspace(restored);
                          setCloudPassphrase('');
                          setCloudFeedback(
                            `Decrypted & restored cloud vault (${restored.scanResults.length} broker records).`
                          );
                        } catch (err) {
                          setCloudLocalError(
                            err instanceof Error ? err.message : 'Failed to decrypt cloud vault.'
                          );
                        } finally {
                          setIsPullingCloud(false);
                        }
                      }}
                      className="px-4 py-2.5 rounded-xl glass-card hover:border-sky-400/40 text-sky-300 font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isPullingCloud ? 'Decrypting...' : 'Pull & Restore Cloud Vault'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={cloudState.isSyncing || isPullingCloud}
                    onClick={async () => {
                      setCloudLocalError(null);
                      setCloudFeedback(null);
                      try {
                        const res = await pushEncryptedBundleToCloud(
                          buildCurrentBundle(),
                          cloudPassphrase.trim() || undefined
                        );
                        setCloudPassphrase('');
                        setCloudFeedback(
                          `Encrypted & synced to cloud (SHA-256 ${res.payloadSha256.slice(0, 12)}…).`
                        );
                      } catch (err) {
                        setCloudLocalError(
                          err instanceof Error ? err.message : 'Failed to sync encrypted cloud vault.'
                        );
                      }
                    }}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw className={`w-4 h-4 ${cloudState.isSyncing ? 'animate-spin' : ''}`} />
                    <span>
                      {cloudState.isSyncing ? 'Encrypting & Syncing...' : 'Encrypt & Sync to Cloud Now'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {cloudFeedback && (
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{cloudFeedback}</span>
              </div>
            )}

            {(cloudLocalError || cloudState.syncError) && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="break-all">{cloudLocalError || cloudState.syncError}</span>
              </div>
            )}
          </div>
        )}

        {activeSection === 'export' && (
          <form onSubmit={handleExportVault} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 glass-subtle rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-white/[0.07] tabular-nums">
              <div className="p-3.5">
                <span className="text-[11px] text-slate-400 block">Scan Records</span>
                <span className="text-lg font-bold text-white font-mono">{scanResults.length}</span>
              </div>
              <div className="p-3.5">
                <span className="text-[11px] text-slate-400 block">Saved Searches</span>
                <span className="text-lg font-bold text-emerald-400 font-mono">{savedSearches.length}</span>
              </div>
              <div className="p-3.5">
                <span className="text-[11px] text-slate-400 block">De-Index URLs</span>
                <span className="text-lg font-bold text-sky-400 font-mono">{deindexQueue.length}</span>
              </div>
              <div className="p-3.5">
                <span className="text-[11px] text-slate-400 block">Bureaus &amp; Canaries</span>
                <span className="text-lg font-bold text-amber-400 font-mono">
                  {Object.keys(bureauProgress).length + canaryAliases.length}
                </span>
              </div>
            </div>

            <label className="flex items-start gap-2.5 p-3.5 glass-subtle rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={useEncryption}
                onChange={(e) => setUseEncryption(e.target.checked)}
                className="mt-0.5 rounded border-white/20 bg-slate-950 text-emerald-500"
              />
              <div>
                <div className="font-bold text-white">
                  Encrypt with AES-256-GCM + PBKDF2-SHA256 (Recommended)
                </div>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  Encrypts your identity profile, signed POA certificate, and SMTP Message-ID receipts locally before downloading.
                </p>
              </div>
            </label>

            {useEncryption && (
              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-300">
                  Vault Passphrase (minimum 6 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={exportPassphrase}
                  onChange={(e) => setExportPassphrase(e.target.value)}
                  placeholder="Enter a strong passphrase to lock this backup..."
                  className="w-full glass-input rounded-xl px-3.5 py-2.5 text-white font-mono placeholder-slate-500"
                />
              </div>
            )}

            {exportSuccess && (
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{exportSuccess}</span>
              </div>
            )}

            {exportError && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{exportError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={isExporting}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>
                  {isExporting
                    ? 'Packaging...'
                    : useEncryption
                    ? 'Download Encrypted Vault (.enc.json)'
                    : 'Download Portable JSON (.json)'}
                </span>
              </button>
            </div>
          </form>
        )}

        {activeSection === 'import' && (
          <form onSubmit={handleRestoreSubmit} className="space-y-4 text-xs">
            <div className="p-4 glass-subtle rounded-xl space-y-2">
              <label className="block font-semibold text-white">
                Select `.enc.json` or `.json` Backup Archive
              </label>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                className="block w-full text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-white/[0.08] file:text-emerald-400 hover:file:bg-white/[0.14] cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-semibold text-slate-300">
                Or Paste Backup JSON Directly
              </label>
              <textarea
                rows={5}
                value={rawImportJson}
                onChange={(e) => setRawImportJson(e.target.value)}
                placeholder='{"schema": "synOUT-encrypted-vault-v1", ...}'
                className="w-full p-3 glass-input rounded-xl font-mono text-xs text-slate-300 resize-y"
              />
            </div>

            {needsDecryptPassphrase && (
              <div className="space-y-1.5">
                <label className="block font-semibold text-amber-300">
                  Encrypted Vault Detected — Enter Passphrase to Unlock
                </label>
                <input
                  type="password"
                  required
                  value={importPassphrase}
                  onChange={(e) => setImportPassphrase(e.target.value)}
                  placeholder="Enter vault passphrase..."
                  className="w-full glass-input !border-amber-500/40 rounded-xl px-3.5 py-2.5 text-white font-mono placeholder-slate-500"
                />
              </div>
            )}

            {importError && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isImporting || !rawImportJson.trim()}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                <span>{isImporting ? 'Decrypting & Restoring...' : 'Restore Workspace'}</span>
              </button>
            </div>
          </form>
        )}

        {activeSection === 'snapshots' && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-slate-300 font-semibold flex items-center gap-1.5">
                <History className="w-4 h-4 text-emerald-400" />
                <span>Historical Audit Snapshots &amp; Re-Exposure Diff</span>
              </div>
              {scanResults.length > 0 && profile && (
                <button
                  type="button"
                  onClick={onCaptureManualSnapshot}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-emerald-400 font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Capture Snapshot Now</span>
                </button>
              )}
            </div>

            {regressionDiff.relistedBrokerIds.length > 0 && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-1">
                <div className="font-bold text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    Regression Alert: {regressionDiff.relistedBrokerIds.length} Previously Actioned Broker(s) Re-Listed Your PII
                  </span>
                </div>
                <p className="text-slate-300">
                  {regressionDiff.relistedBrokerIds
                    .map((id) => findBrokerById(id)?.name || id)
                    .join(', ')}
                </p>
              </div>
            )}

            {scanSnapshots.length === 0 ? (
              <div className="p-8 glass-subtle rounded-xl text-center text-slate-400">
                Snapshots are recorded automatically after each audit scan so synOUT can detect brokers that re-list your records after opt-out.
              </div>
            ) : (
              <div className="glass-subtle rounded-xl divide-y divide-white/[0.07] max-h-60 overflow-y-auto">
                {scanSnapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 tabular-nums"
                  >
                    <div>
                      <div className="font-bold text-white">{snap.profileName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {new Date(snap.timestampIso).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
                      <span className="text-rose-400">{snap.exposedBrokerIds.length} Exposed</span>
                      <span className="text-sky-400">{snap.submittedBrokerIds.length} Sent</span>
                      <span className="text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {snap.removedBrokerIds.length} Scrubbed
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
