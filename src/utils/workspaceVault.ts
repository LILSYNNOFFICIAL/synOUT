import {
  CanaryAliasRecord,
  DeindexItem,
  PublicRecordChecklistState,
  ScanHistorySnapshot,
  ScanResult,
  UserProfile,
} from '../types';
import { StoredSearchProfile } from './searchProfiles';
import { BrokerContactOverride } from './brokerContactResolver';

const SNAPSHOTS_STORAGE_KEY = 'synout_scan_snapshots_v1';
const BUREAU_PROGRESS_STORAGE_KEY = 'synout_bureau_freeze_progress_v1';
const MAX_SNAPSHOTS = 20;

export interface BureauChecklistState {
  freezePlaced?: boolean;
  pinSaved?: boolean;
  emailSentReceipt?: string;
  updatedAtIso: string;
}

export function loadBureauProgress(): Record<string, BureauChecklistState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(BUREAU_PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveBureauProgress(progress: Record<string, BureauChecklistState>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BUREAU_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage errors
  }
}

export function clearBureauProgress(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(BUREAU_PROGRESS_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function loadScanSnapshots(): ScanHistorySnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SNAPSHOTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveScanSnapshots(snapshots: ScanHistorySnapshot[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      SNAPSHOTS_STORAGE_KEY,
      JSON.stringify(snapshots.slice(0, MAX_SNAPSHOTS))
    );
  } catch {
    // Ignore storage errors
  }
}

export function clearScanSnapshots(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SNAPSHOTS_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function createSnapshotFromScan(
  profile: UserProfile,
  results: ScanResult[],
  exposureScore: number
): ScanHistorySnapshot {
  const exposedBrokerIds = results
    .filter((r) => r.status === 'exposed')
    .map((r) => r.brokerId);
  const submittedBrokerIds = results
    .filter((r) => r.removalStatus === 'submitted')
    .map((r) => r.brokerId);
  const removedBrokerIds = results
    .filter((r) => r.removalStatus === 'removed')
    .map((r) => r.brokerId);

  return {
    id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestampIso: new Date().toISOString(),
    profileName: `${profile.firstName} ${profile.lastName}`.trim(),
    exposedBrokerIds,
    submittedBrokerIds,
    removedBrokerIds,
    exposureScore,
  };
}

export interface ScanRegressionDiff {
  hasBaseline: boolean;
  baselineTimestampIso: string | null;
  relistedBrokerIds: string[];
  newlyExposedBrokerIds: string[];
  newlyScrubbedBrokerIds: string[];
}

export function computeScanRegressionDiff(
  currentResults: ScanResult[],
  priorSnapshots: ScanHistorySnapshot[]
): ScanRegressionDiff {
  if (priorSnapshots.length === 0) {
    const flaggedRegressions = currentResults
      .filter((r) => r.status === 'exposed' && r.isRegression)
      .map((r) => r.brokerId);
    return {
      hasBaseline: false,
      baselineTimestampIso: null,
      relistedBrokerIds: flaggedRegressions,
      newlyExposedBrokerIds: [],
      newlyScrubbedBrokerIds: [],
    };
  }

  const latestPrior = priorSnapshots[0];
  const previouslyActioned = new Set<string>();
  for (const snap of priorSnapshots) {
    snap.removedBrokerIds.forEach((id) => previouslyActioned.add(id));
    snap.submittedBrokerIds.forEach((id) => previouslyActioned.add(id));
  }
  const priorExposedSet = new Set(latestPrior.exposedBrokerIds);
  const priorRemovedSet = new Set(latestPrior.removedBrokerIds);

  const relistedBrokerIds: string[] = [];
  const newlyExposedBrokerIds: string[] = [];
  const newlyScrubbedBrokerIds: string[] = [];

  for (const item of currentResults) {
    if (
      item.status === 'exposed' &&
      item.removalStatus === 'found' &&
      (previouslyActioned.has(item.brokerId) || item.isRegression)
    ) {
      relistedBrokerIds.push(item.brokerId);
    } else if (item.status === 'exposed' && !priorExposedSet.has(item.brokerId)) {
      newlyExposedBrokerIds.push(item.brokerId);
    }

    if (item.removalStatus === 'removed' && !priorRemovedSet.has(item.brokerId)) {
      newlyScrubbedBrokerIds.push(item.brokerId);
    }
  }

  return {
    hasBaseline: true,
    baselineTimestampIso: latestPrior.timestampIso,
    relistedBrokerIds,
    newlyExposedBrokerIds,
    newlyScrubbedBrokerIds,
  };
}

export interface SynoutWorkspaceBundle {
  schema: 'synOUT-workspace-vault-v1';
  exportedAtIso: string;
  profile: UserProfile | null;
  scanResults: ScanResult[];
  savedSearches?: StoredSearchProfile[];
  deindexQueue: DeindexItem[];
  bureauProgress: Record<string, BureauChecklistState>;
  scanSnapshots: ScanHistorySnapshot[];
  canaryAliases?: CanaryAliasRecord[];
  publicRecordProgress?: Record<string, PublicRecordChecklistState>;
  brokerContactOverrides?: Record<string, BrokerContactOverride>;
}

export interface EncryptedWorkspaceEnvelope {
  schema: 'synOUT-encrypted-vault-v1';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  cipher: 'AES-256-GCM';
  saltBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
  exportedAtIso: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveVaultKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptWorkspaceBundle(
  bundle: SynoutWorkspaceBundle,
  passphrase: string,
  customIterations = 120000
): Promise<EncryptedWorkspaceEnvelope> {
  if (!passphrase || passphrase.length < 6) {
    throw new Error('Passphrase must be at least 6 characters.');
  }
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }

  const iterations = Math.max(100000, Math.min(1000000, Math.floor(customIterations)));
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(passphrase, salt, iterations);

  const plaintextBytes = new TextEncoder().encode(JSON.stringify(bundle));
  const encryptedBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintextBytes
  );

  return {
    schema: 'synOUT-encrypted-vault-v1',
    kdf: 'PBKDF2-SHA256',
    iterations,
    cipher: 'AES-256-GCM',
    saltBase64: bytesToBase64(salt),
    ivBase64: bytesToBase64(iv),
    ciphertextBase64: bytesToBase64(new Uint8Array(encryptedBuffer)),
    exportedAtIso: new Date().toISOString(),
  };
}

export async function decryptWorkspaceBundle(
  envelope: EncryptedWorkspaceEnvelope,
  passphrase: string
): Promise<SynoutWorkspaceBundle> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }
  if (envelope.schema !== 'synOUT-encrypted-vault-v1') {
    throw new Error('Unrecognized encrypted vault schema.');
  }

  const salt = base64ToBytes(envelope.saltBase64);
  const iv = base64ToBytes(envelope.ivBase64);
  const ciphertext = base64ToBytes(envelope.ciphertextBase64);
  const key = await deriveVaultKey(passphrase, salt, envelope.iterations || 120000);

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
  } catch {
    throw new Error('Invalid vault passphrase or corrupted encrypted archive.');
  }

  const json = new TextDecoder().decode(decryptedBuffer);
  return parsePlainWorkspaceBundle(json);
}

export function parsePlainWorkspaceBundle(rawJson: string): SynoutWorkspaceBundle {
  const parsed = JSON.parse(rawJson);
  if (!parsed || parsed.schema !== 'synOUT-workspace-vault-v1') {
    throw new Error('Invalid synOUT workspace backup file.');
  }
  if (!Array.isArray(parsed.scanResults)) {
    throw new Error('Workspace backup is missing scanResults array.');
  }
  return {
    schema: 'synOUT-workspace-vault-v1',
    exportedAtIso: String(parsed.exportedAtIso || new Date().toISOString()),
    profile: parsed.profile || null,
    scanResults: parsed.scanResults,
    savedSearches: Array.isArray(parsed.savedSearches) ? parsed.savedSearches : undefined,
    deindexQueue: Array.isArray(parsed.deindexQueue) ? parsed.deindexQueue : [],
    bureauProgress:
      parsed.bureauProgress && typeof parsed.bureauProgress === 'object'
        ? parsed.bureauProgress
        : {},
    scanSnapshots: Array.isArray(parsed.scanSnapshots) ? parsed.scanSnapshots : [],
    canaryAliases: Array.isArray(parsed.canaryAliases) ? parsed.canaryAliases : [],
    publicRecordProgress:
      parsed.publicRecordProgress && typeof parsed.publicRecordProgress === 'object'
        ? parsed.publicRecordProgress
        : {},
    brokerContactOverrides:
      parsed.brokerContactOverrides && typeof parsed.brokerContactOverrides === 'object'
        ? parsed.brokerContactOverrides
        : {},
  };
}

export function isEncryptedVaultJson(rawJson: string): boolean {
  try {
    const parsed = JSON.parse(rawJson);
    return parsed?.schema === 'synOUT-encrypted-vault-v1';
  } catch {
    return false;
  }
}
