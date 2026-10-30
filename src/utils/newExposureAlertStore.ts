import { useSyncExternalStore } from 'react';
import { DataBroker, ScanResult } from '../types';
import { findBrokerById } from '../services/emailConnectionStore';
import type { LiveRelistingProbeDiff } from './relistingMonitorEngine';

export interface NewExposureAlert {
  id: string;
  brokerId: string;
  brokerName: string;
  brokerDomain: string;
  risk: DataBroker['risk'];
  detectedAtIso: string;
  summary: string;
  probeUrl?: string;
  snapshotSha256?: string;
  source: 'live_monitor_sweep' | 'clean_broker_transition' | 'alert_verification_drill';
  acknowledged: boolean;
  pushDispatched: boolean;
}

export interface NewExposureAlertStoreState {
  alerts: NewExposureAlert[];
  alertsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  notificationPermission: 'default' | 'granted' | 'denied' | 'unsupported';
  cleanBrokerBaselineIds: string[];
}

const STORAGE_KEY = 'synout_new_exposure_alerts_v1';

function detectBrowserNotificationPermission(): 'default' | 'granted' | 'denied' | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

function loadInitialAlertState(): NewExposureAlertStoreState {
  const permission = detectBrowserNotificationPermission();
  if (typeof window === 'undefined') {
    return {
      alerts: [],
      alertsEnabled: true,
      pushNotificationsEnabled: permission === 'granted',
      notificationPermission: permission,
      cleanBrokerBaselineIds: [],
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        alerts: [],
        alertsEnabled: true,
        pushNotificationsEnabled: permission === 'granted',
        notificationPermission: permission,
        cleanBrokerBaselineIds: [],
      };
    }
    const parsed = JSON.parse(raw) as Partial<NewExposureAlertStoreState>;
    return {
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts.slice(0, 30) : [],
      alertsEnabled: parsed.alertsEnabled !== false,
      pushNotificationsEnabled:
        typeof parsed.pushNotificationsEnabled === 'boolean'
          ? parsed.pushNotificationsEnabled && permission === 'granted'
          : permission === 'granted',
      notificationPermission: permission,
      cleanBrokerBaselineIds: Array.isArray(parsed.cleanBrokerBaselineIds)
        ? parsed.cleanBrokerBaselineIds.filter((id) => typeof id === 'string')
        : [],
    };
  } catch {
    return {
      alerts: [],
      alertsEnabled: true,
      pushNotificationsEnabled: permission === 'granted',
      notificationPermission: permission,
      cleanBrokerBaselineIds: [],
    };
  }
}

let storeState: NewExposureAlertStoreState = loadInitialAlertState();
const listeners = new Set<() => void>();

function persistAndEmit(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          alerts: storeState.alerts.slice(0, 30),
          alertsEnabled: storeState.alertsEnabled,
          pushNotificationsEnabled: storeState.pushNotificationsEnabled,
          cleanBrokerBaselineIds: storeState.cleanBrokerBaselineIds.slice(0, 800),
        })
      );
    } catch {
      // Ignore storage quota limits
    }
  }
  for (const listener of listeners) {
    listener();
  }
}

export function getNewExposureAlertState(): NewExposureAlertStoreState {
  return storeState;
}

export function subscribeNewExposureAlerts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNewExposureAlerts(): NewExposureAlertStoreState & {
  unacknowledgedAlerts: NewExposureAlert[];
} {
  const snapshot = useSyncExternalStore(
    subscribeNewExposureAlerts,
    getNewExposureAlertState,
    getNewExposureAlertState
  );
  const unacknowledgedAlerts = snapshot.alerts.filter((a) => !a.acknowledged);
  return {
    ...snapshot,
    unacknowledgedAlerts,
  };
}

export function setNewExposureAlertsEnabled(enabled: boolean): void {
  storeState = {
    ...storeState,
    alertsEnabled: enabled,
  };
  persistAndEmit();
}

/**
 * Requests browser push/desktop notification permission on explicit user click
 * and enables push notifications when granted.
 */
export async function requestBrowserNotificationPermission(): Promise<
  'default' | 'granted' | 'denied' | 'unsupported'
> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    storeState = {
      ...storeState,
      notificationPermission: 'unsupported',
      pushNotificationsEnabled: false,
    };
    persistAndEmit();
    return 'unsupported';
  }

  try {
    const result = await window.Notification.requestPermission();
    storeState = {
      ...storeState,
      notificationPermission: result,
      pushNotificationsEnabled: result === 'granted',
    };
    persistAndEmit();
    return result;
  } catch {
    const fallback = detectBrowserNotificationPermission();
    storeState = {
      ...storeState,
      notificationPermission: fallback,
      pushNotificationsEnabled: fallback === 'granted',
    };
    persistAndEmit();
    return fallback;
  }
}

export function setPushNotificationsEnabled(enabled: boolean): void {
  const perm = detectBrowserNotificationPermission();
  storeState = {
    ...storeState,
    notificationPermission: perm,
    pushNotificationsEnabled: enabled && perm === 'granted',
  };
  persistAndEmit();
}

/**
 * Dispatches a native browser or Service Worker push notification when permitted.
 */
export async function dispatchBrowserPushExposureAlert(
  alert: NewExposureAlert
): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !storeState.pushNotificationsEnabled ||
    !('Notification' in window) ||
    window.Notification.permission !== 'granted'
  ) {
    return false;
  }

  const title = `New Exposure Alert: ${alert.brokerName}`;
  const body = `${alert.summary} (${alert.brokerDomain})`;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, {
          body,
          tag: `synout-exposure-${alert.brokerId}`,
          icon: 'pwa-192x192.png',
        });
        return true;
      }
    }
  } catch {
    // Fall back to standard Notification constructor
  }

  try {
    new window.Notification(title, {
      body,
      tag: `synout-exposure-${alert.brokerId}`,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a persistent New Exposure Alert (shown in the persistent toast bar and Monitor feed)
 * and dispatches a browser push notification if enabled.
 */
export async function triggerNewExposureAlert(params: {
  brokerId: string;
  brokerName?: string;
  brokerDomain?: string;
  risk?: DataBroker['risk'];
  summary?: string;
  probeUrl?: string;
  snapshotSha256?: string;
  source: NewExposureAlert['source'];
}): Promise<NewExposureAlert | null> {
  if (!storeState.alertsEnabled) return null;

  const broker = findBrokerById(params.brokerId);
  const brokerName = params.brokerName || broker?.name || params.brokerId;
  const brokerDomain = params.brokerDomain || broker?.domain || `${params.brokerId}.com`;
  const risk: DataBroker['risk'] = params.risk || broker?.risk || 'High';
  const detectedAtIso = new Date().toISOString();

  const alert: NewExposureAlert = {
    id: `exp-alert-${params.brokerId}-${Date.now().toString(36)}`,
    brokerId: params.brokerId,
    brokerName,
    brokerDomain,
    risk,
    detectedAtIso,
    summary:
      params.summary ||
      `New personal data record detected on previously clean broker ${brokerName} (${brokerDomain}).`,
    probeUrl: params.probeUrl || broker?.optOutUrl,
    snapshotSha256: params.snapshotSha256,
    source: params.source,
    acknowledged: false,
    pushDispatched: false,
  };

  const pushSent = await dispatchBrowserPushExposureAlert(alert);
  const finalized: NewExposureAlert = {
    ...alert,
    pushDispatched: pushSent,
  };

  // Deduplicate unacknowledged alerts for the same broker so the persistent toast bar stays concise
  const filteredExisting = storeState.alerts.filter(
    (existing) => !(existing.brokerId === params.brokerId && !existing.acknowledged)
  );

  // Remove this broker from the clean baseline since it is now exposed
  const updatedCleanBaseline = storeState.cleanBrokerBaselineIds.filter(
    (id) => id !== params.brokerId
  );

  storeState = {
    ...storeState,
    alerts: [finalized, ...filteredExisting].slice(0, 30),
    cleanBrokerBaselineIds: updatedCleanBaseline,
  };
  persistAndEmit();
  return finalized;
}

/**
 * Inspects monitoring sweep diffs and immediately fires a New Exposure Alert for any
 * previously clean broker that returned `outcome === 'new_exposure_detected'`.
 */
export async function ingestMonitoringDiffsForNewExposures(
  diffs: LiveRelistingProbeDiff[]
): Promise<NewExposureAlert[]> {
  const created: NewExposureAlert[] = [];
  for (const diff of diffs) {
    if (diff.outcome === 'new_exposure_detected') {
      const alert = await triggerNewExposureAlert({
        brokerId: diff.brokerId,
        brokerName: diff.brokerName,
        brokerDomain: diff.brokerDomain,
        summary: diff.summary,
        probeUrl: diff.probeUrl,
        snapshotSha256: diff.snapshotSha256,
        source: 'live_monitor_sweep',
      });
      if (alert) created.push(alert);
    }
  }
  return created;
}

/**
 * Compares incoming scan results against the recorded baseline of previously `clean` brokers.
 * Any broker that transitioned `clean -> exposed` triggers an immediate New Exposure Alert,
 * and the clean baseline is refreshed with all currently clean brokers.
 */
export async function syncScanResultsForNewExposureAlerts(
  results: ScanResult[]
): Promise<NewExposureAlert[]> {
  const prevCleanSet = new Set(storeState.cleanBrokerBaselineIds);
  const created: NewExposureAlert[] = [];

  if (prevCleanSet.size > 0 && storeState.alertsEnabled) {
    for (const res of results) {
      if (res.status === 'exposed' && prevCleanSet.has(res.brokerId)) {
        const broker = findBrokerById(res.brokerId);
        const alert = await triggerNewExposureAlert({
          brokerId: res.brokerId,
          brokerName: broker?.name,
          brokerDomain: broker?.domain,
          risk: broker?.risk || res.mockListingData?.riskLevel,
          summary: `Previously clean broker ${broker?.name || res.brokerId} now exposes ${res.mockListingData?.recordsCount || 1} personal record(s).`,
          source: 'clean_broker_transition',
        });
        if (alert) created.push(alert);
      }
    }
  }

  const nextCleanIds = results
    .filter((r) => r.status === 'clean')
    .map((r) => r.brokerId);

  storeState = {
    ...storeState,
    cleanBrokerBaselineIds: nextCleanIds,
  };
  persistAndEmit();
  return created;
}

export function acknowledgeNewExposureAlert(alertId: string): void {
  storeState = {
    ...storeState,
    alerts: storeState.alerts.map((a) =>
      a.id === alertId ? { ...a, acknowledged: true } : a
    ),
  };
  persistAndEmit();
}

export function dismissAllNewExposureAlerts(): void {
  storeState = {
    ...storeState,
    alerts: storeState.alerts.map((a) => ({ ...a, acknowledged: true })),
  };
  persistAndEmit();
}

export function clearAllNewExposureAlerts(): void {
  storeState = {
    ...storeState,
    alerts: [],
    cleanBrokerBaselineIds: [],
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }
  for (const listener of listeners) {
    listener();
  }
}
