import { useSyncExternalStore } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  isFirebaseConfigured,
  OperationType,
} from './firebaseClient';
import {
  type EncryptedWorkspaceEnvelope,
  type SynoutWorkspaceBundle,
  decryptWorkspaceBundle,
  encryptWorkspaceBundle,
} from '../utils/workspaceVault';

export interface CloudVaultRemoteMetadata {
  vaultId: string;
  ownerId: string;
  payloadSha256: string;
  exposedCount: number;
  removedCount: number;
  trackedCount: number;
  profilesCount: number;
  deviceLabel: string;
  updatedAtIso: string | null;
  saltBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
  kdfIterations: number;
}

export interface CloudVaultSyncState {
  configured: boolean;
  authReady: boolean;
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    emailVerified: boolean;
    photoURL: string | null;
  } | null;
  vaultUnlockedInSession: boolean;
  autoSyncEnabled: boolean;
  isSyncing: boolean;
  lastSyncedAtIso: string | null;
  lastSyncedSha256: string | null;
  remoteVault: CloudVaultRemoteMetadata | null;
  syncError: string | null;
}

const AUTO_SYNC_PREF_KEY = 'synout_cloud_autosync_v1';
const KDF_ITERATIONS = 250000;

function loadAutoSyncPref(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(AUTO_SYNC_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

let inMemoryPassphrase: string | null = null;
let remoteUnsubscribe: Unsubscribe | null = null;
let onRemoteBundleDecryptedCallback: ((bundle: SynoutWorkspaceBundle) => void) | null = null;

let state: CloudVaultSyncState = {
  configured: isFirebaseConfigured,
  authReady: !isFirebaseConfigured,
  user: null,
  vaultUnlockedInSession: false,
  autoSyncEnabled: loadAutoSyncPref(),
  isSyncing: false,
  lastSyncedAtIso: null,
  lastSyncedSha256: null,
  remoteVault: null,
  syncError: null,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function updateState(patch: Partial<CloudVaultSyncState>) {
  state = { ...state, ...patch };
  emit();
}

export async function sha256HexString(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API is required for SHA-256 verification.');
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function sanitizeDeviceLabel(raw?: string): string {
  if (raw && raw.trim()) {
    return raw.trim().slice(0, 80);
  }
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    const os = /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Android/i.test(ua)
      ? 'Android'
      : /Mac/i.test(ua)
      ? 'macOS'
      : /Win/i.test(ua)
      ? 'Windows'
      : /Linux/i.test(ua)
      ? 'Linux'
      : 'Browser';
    return `synOUT Web (${os})`.slice(0, 80);
  }
  return 'synOUT Device';
}

function sanitizeDisplayName(user: User): string {
  const candidate = (user.displayName || user.email?.split('@')[0] || 'synOUT Member')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
  return (candidate || 'synOUT Member').slice(0, 120);
}

function sanitizeEmail(raw: string | null | undefined): string {
  const trimmed = (raw || '').trim().toLowerCase().slice(0, 254);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return trimmed;
  }
  return 'verified@synout.local';
}

async function ensureMasterAccountProvisioned(user: User): Promise<void> {
  if (!db || !user.emailVerified) return;

  const userPath = `users/${user.uid}`;
  const contactPath = `users/${user.uid}/private/contact`;
  const userRef = doc(db, 'users', user.uid);
  const contactRef = doc(db, 'users', user.uid, 'private', 'contact');

  let existingSnap;
  try {
    existingSnap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  if (!existingSnap.exists()) {
    const email = sanitizeEmail(user.email);
    const batch = writeBatch(db);
    batch.set(userRef, {
      uid: user.uid.slice(0, 128),
      displayName: sanitizeDisplayName(user),
      syncEnabled: true,
      relistingAlertEnabled: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(contactRef, {
      ownerId: user.uid.slice(0, 128),
      email,
      alertRecipientEmail: email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, userPath);
    }
  }
}

function attachRemoteVaultListener(user: User): void {
  if (remoteUnsubscribe) {
    remoteUnsubscribe();
    remoteUnsubscribe = null;
  }
  if (!db || !user.emailVerified) return;

  const vaultPath = `users/${user.uid}/vaults/primary`;
  const vaultRef = doc(db, 'users', user.uid, 'vaults', 'primary');

  remoteUnsubscribe = onSnapshot(
    vaultRef,
    async (snap) => {
      if (!snap.exists()) {
        updateState({ remoteVault: null });
        return;
      }
      const d = snap.data();
      const updatedAtDate =
        d.updatedAt && typeof d.updatedAt.toDate === 'function' ? d.updatedAt.toDate() : null;

      const meta: CloudVaultRemoteMetadata = {
        vaultId: String(d.vaultId || 'primary'),
        ownerId: String(d.ownerId || user.uid),
        payloadSha256: String(d.payloadSha256 || ''),
        exposedCount: Number(d.exposedCount || 0),
        removedCount: Number(d.removedCount || 0),
        trackedCount: Number(d.trackedCount || 0),
        profilesCount: Number(d.profilesCount || 0),
        deviceLabel: String(d.deviceLabel || 'Remote Device'),
        updatedAtIso: updatedAtDate ? updatedAtDate.toISOString() : null,
        saltBase64: String(d.saltBase64 || ''),
        ivBase64: String(d.ivBase64 || ''),
        ciphertextBase64: String(d.ciphertextBase64 || ''),
        kdfIterations: Number(d.kdfIterations || KDF_ITERATIONS),
      };

      const isNewRemoteChange =
        Boolean(meta.payloadSha256) && meta.payloadSha256 !== state.lastSyncedSha256;

      updateState({ remoteVault: meta });

      // Automatically decrypt and apply live cross-device updates when unlocked in session
      if (isNewRemoteChange && inMemoryPassphrase && onRemoteBundleDecryptedCallback) {
        try {
          const envelope: EncryptedWorkspaceEnvelope = {
            schema: 'synOUT-encrypted-vault-v1',
            kdf: 'PBKDF2-SHA256',
            iterations: meta.kdfIterations,
            cipher: 'AES-256-GCM',
            saltBase64: meta.saltBase64,
            ivBase64: meta.ivBase64,
            ciphertextBase64: meta.ciphertextBase64,
            exportedAtIso: meta.updatedAtIso || new Date().toISOString(),
          };
          const decrypted = await decryptWorkspaceBundle(envelope, inMemoryPassphrase);
          updateState({
            lastSyncedSha256: meta.payloadSha256,
            lastSyncedAtIso: meta.updatedAtIso || new Date().toISOString(),
            syncError: null,
          });
          onRemoteBundleDecryptedCallback(decrypted);
        } catch {
          // Different passphrase on remote snapshot; prompt user to enter current vault passphrase
        }
      }
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, vaultPath);
      } catch (formatted) {
        updateState({
          syncError: formatted instanceof Error ? formatted.message : 'Cloud sync listener error.',
        });
      }
    }
  );
}

let listenerInitialized = false;

export function initCloudVaultAuthListener(): void {
  if (listenerInitialized || typeof window === 'undefined' || !auth) return;
  listenerInitialized = true;

  onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) {
      if (remoteUnsubscribe) {
        remoteUnsubscribe();
        remoteUnsubscribe = null;
      }
      inMemoryPassphrase = null;
      updateState({
        authReady: true,
        user: null,
        vaultUnlockedInSession: false,
        remoteVault: null,
        syncError: null,
      });
      return;
    }

    updateState({
      authReady: true,
      user: {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName,
        emailVerified: fbUser.emailVerified,
        photoURL: fbUser.photoURL,
      },
      syncError: null,
    });

    try {
      await ensureMasterAccountProvisioned(fbUser);
      attachRemoteVaultListener(fbUser);
    } catch (err) {
      updateState({
        syncError: err instanceof Error ? err.message : 'Could not initialize cloud account.',
      });
    }
  });
}

export function registerRemoteVaultRestoreHandler(
  handler: ((bundle: SynoutWorkspaceBundle) => void) | null
): void {
  onRemoteBundleDecryptedCallback = handler;
}

export async function signInCloudVaultWithGoogle(): Promise<void> {
  if (!auth) {
    throw new Error('Cloud sync is not configured in this environment.');
  }
  updateState({ syncError: null });
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export async function signOutCloudVault(): Promise<void> {
  inMemoryPassphrase = null;
  if (remoteUnsubscribe) {
    remoteUnsubscribe();
    remoteUnsubscribe = null;
  }
  if (auth) {
    await signOut(auth);
  }
  updateState({
    user: null,
    vaultUnlockedInSession: false,
    remoteVault: null,
    syncError: null,
  });
}

export function setCloudVaultAutoSync(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(AUTO_SYNC_PREF_KEY, enabled ? 'true' : 'false');
    } catch {
      // Ignore storage quota errors
    }
  }
  updateState({ autoSyncEnabled: enabled });
}

export function setSessionVaultPassphrase(passphrase: string): void {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Zero-knowledge vault passphrase must be at least 8 characters.');
  }
  inMemoryPassphrase = passphrase;
  updateState({ vaultUnlockedInSession: true, syncError: null });
}

export function hasUnlockedSessionPassphrase(): boolean {
  return Boolean(inMemoryPassphrase && inMemoryPassphrase.length >= 8);
}

export async function pushEncryptedBundleToCloud(
  bundle: SynoutWorkspaceBundle,
  explicitPassphrase?: string
): Promise<{ payloadSha256: string; syncedAtIso: string }> {
  if (!db || !auth?.currentUser) {
    throw new Error('Sign in with Google first to sync your encrypted vault.');
  }
  const currentUser = auth.currentUser;
  if (!currentUser.emailVerified) {
    throw new Error('A verified Google email address is required for cloud vault writes.');
  }

  const passphrase = explicitPassphrase || inMemoryPassphrase;
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Enter your 8+ character zero-knowledge vault passphrase first.');
  }
  inMemoryPassphrase = passphrase;

  updateState({ isSyncing: true, syncError: null });
  try {
    await ensureMasterAccountProvisioned(currentUser);

    const encrypted = await encryptWorkspaceBundle(bundle, passphrase, KDF_ITERATIONS);
    if (encrypted.ciphertextBase64.length > 800000) {
      throw new Error('Encrypted workspace exceeds the 800 KB cloud vault safety limit.');
    }

    const payloadSha256 = await sha256HexString(encrypted.ciphertextBase64);
    const exposedCount = Math.min(
      50000,
      Math.max(0, bundle.scanResults.filter((r) => r.status === 'exposed').length)
    );
    const removedCount = Math.min(
      50000,
      Math.max(0, bundle.scanResults.filter((r) => r.removalStatus === 'removed').length)
    );
    const trackedCount = Math.min(
      50000,
      Math.max(
        0,
        bundle.scanResults.filter(
          (r) => r.removalStatus === 'submitted' || r.removalStatus === 'removed'
        ).length
      )
    );
    const profilesCount = Math.min(10, Math.max(0, bundle.savedSearches?.length || 0));
    const deviceLabel = sanitizeDeviceLabel();

    const vaultPath = `users/${currentUser.uid}/vaults/primary`;
    const vaultRef = doc(db, 'users', currentUser.uid, 'vaults', 'primary');

    let existingVault;
    try {
      existingVault = await getDoc(vaultRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, vaultPath);
    }

    const syncedAtIso = new Date().toISOString();
    // Pre-mark lastSyncedSha256 so our own onSnapshot echo doesn't trigger redundant restore
    updateState({ lastSyncedSha256: payloadSha256 });

    if (!existingVault.exists()) {
      try {
        await setDoc(vaultRef, {
          ownerId: currentUser.uid.slice(0, 128),
          vaultId: 'primary',
          cipherAlgorithm: 'AES-256-GCM',
          kdfAlgorithm: 'PBKDF2-SHA256',
          kdfIterations: encrypted.iterations,
          saltBase64: encrypted.saltBase64,
          ivBase64: encrypted.ivBase64,
          ciphertextBase64: encrypted.ciphertextBase64,
          payloadSha256,
          schemaVersion: 1,
          exposedCount,
          removedCount,
          trackedCount,
          profilesCount,
          deviceLabel,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, vaultPath);
      }
    } else {
      try {
        await updateDoc(vaultRef, {
          kdfIterations: encrypted.iterations,
          saltBase64: encrypted.saltBase64,
          ivBase64: encrypted.ivBase64,
          ciphertextBase64: encrypted.ciphertextBase64,
          payloadSha256,
          exposedCount,
          removedCount,
          trackedCount,
          profilesCount,
          deviceLabel,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, vaultPath);
      }
    }

    updateState({
      isSyncing: false,
      vaultUnlockedInSession: true,
      lastSyncedAtIso: syncedAtIso,
      lastSyncedSha256: payloadSha256,
      syncError: null,
    });

    return { payloadSha256, syncedAtIso };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to push encrypted cloud vault.';
    updateState({ isSyncing: false, syncError: message });
    throw err;
  }
}

export async function pullAndDecryptCloudVault(
  explicitPassphrase?: string
): Promise<SynoutWorkspaceBundle> {
  const remote = state.remoteVault;
  if (!remote || !remote.ciphertextBase64) {
    throw new Error('No encrypted vault snapshot found in your cloud account yet.');
  }

  const passphrase = explicitPassphrase || inMemoryPassphrase;
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Enter your zero-knowledge vault passphrase to decrypt your cloud backup.');
  }

  const computedHash = await sha256HexString(remote.ciphertextBase64);
  if (remote.payloadSha256 && computedHash !== remote.payloadSha256) {
    throw new Error('Cloud ciphertext SHA-256 integrity check failed.');
  }

  const envelope: EncryptedWorkspaceEnvelope = {
    schema: 'synOUT-encrypted-vault-v1',
    kdf: 'PBKDF2-SHA256',
    iterations: remote.kdfIterations,
    cipher: 'AES-256-GCM',
    saltBase64: remote.saltBase64,
    ivBase64: remote.ivBase64,
    ciphertextBase64: remote.ciphertextBase64,
    exportedAtIso: remote.updatedAtIso || new Date().toISOString(),
  };

  const bundle = await decryptWorkspaceBundle(envelope, passphrase);
  inMemoryPassphrase = passphrase;
  updateState({
    vaultUnlockedInSession: true,
    lastSyncedSha256: remote.payloadSha256,
    lastSyncedAtIso: remote.updatedAtIso || new Date().toISOString(),
    syncError: null,
  });
  return bundle;
}

export async function updateCloudAlertRecipientEmail(alertEmail: string): Promise<void> {
  if (!db || !auth?.currentUser?.emailVerified) return;
  const uid = auth.currentUser.uid;
  const contactPath = `users/${uid}/private/contact`;
  const contactRef = doc(db, 'users', uid, 'private', 'contact');
  const cleanRecipient = sanitizeEmail(alertEmail);
  const cleanPrimary = sanitizeEmail(auth.currentUser.email);

  try {
    await updateDoc(contactRef, {
      email: cleanPrimary,
      alertRecipientEmail: cleanRecipient,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, contactPath);
  }
}

export function getCloudVaultSyncState(): CloudVaultSyncState {
  return state;
}

function subscribe(listener: () => void): () => void {
  initCloudVaultAuthListener();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCloudVaultState(): CloudVaultSyncState {
  return useSyncExternalStore(subscribe, getCloudVaultSyncState, getCloudVaultSyncState);
}
