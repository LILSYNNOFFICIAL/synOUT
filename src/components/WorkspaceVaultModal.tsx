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
import { downloadFile } from '../utils/exportEngines';
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
  const [activeSection, setActiveSection] = useState<'export' | 'import' | 'snapshots'>('export');
  const [useEncryption, setUseEncryption] = useState(true);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
              <Lock className="w-3.5 h-3.5" />
              <span>Zero-Cloud Local Privacy Vault · AES-256-GCM</span>
            </div>
            <h2 className="text-xl font-bold text-white">
              Portable Workspace Vault &amp; Scan Snapshot History
            </h2>
            <p className="text-xs text-slate-400">
              Back up your opt-out receipts, POA, de-index queue, and freeze checklists across browsers—SMTP app passwords are never exported.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="inline-flex p-1 bg-slate-950 border border-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveSection('export')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeSection === 'export'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Export Vault
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
            Restore Backup
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('snapshots')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeSection === 'snapshots'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Snapshots &amp; Regressions ({scanSnapshots.length})
          </button>
        </div>

        {activeSection === 'export' && (
          <form onSubmit={handleExportVault} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tabular-nums">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-[10px] font-mono text-slate-500 block">SCAN RECORDS</span>
                <span className="text-lg font-bold text-white font-mono">{scanResults.length}</span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-[10px] font-mono text-slate-500 block">SAVED SEARCHES</span>
                <span className="text-lg font-bold text-emerald-400 font-mono">{savedSearches.length}</span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-[10px] font-mono text-slate-500 block">DE-INDEX URLS</span>
                <span className="text-lg font-bold text-sky-400 font-mono">{deindexQueue.length}</span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-[10px] font-mono text-slate-500 block">BUREAUS &amp; CANARIES</span>
                <span className="text-lg font-bold text-amber-400 font-mono">
                  {Object.keys(bureauProgress).length + canaryAliases.length}
                </span>
              </div>
            </div>

            <label className="flex items-start gap-2.5 p-3.5 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={useEncryption}
                onChange={(e) => setUseEncryption(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 bg-slate-900 text-emerald-500"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
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

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
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
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <label className="block font-semibold text-white">
                Select `.enc.json` or `.json` Backup Archive
              </label>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                className="block w-full text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-emerald-400 hover:file:bg-slate-700 cursor-pointer"
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
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 focus:outline-none focus:border-emerald-500 resize-y"
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
                  className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3.5 py-2.5 text-white font-mono placeholder-slate-500 focus:outline-none"
                />
              </div>
            )}

            {importError && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
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
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
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
              <div className="p-8 bg-slate-950 border border-slate-800 rounded-xl text-center text-slate-400">
                Snapshots are recorded automatically after each audit scan so synOUT can detect brokers that re-list your records after opt-out.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {scanSnapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 tabular-nums"
                  >
                    <div>
                      <div className="font-bold text-white">{snap.profileName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
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
