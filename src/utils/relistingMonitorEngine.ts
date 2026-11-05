import { ScanResult } from '../types';
import { findBrokerById } from '../services/emailConnectionStore';

export type RelistingCadenceDays = 30 | 60 | 90;

export interface BrokerRelistingScheduleItem {
  brokerId: string;
  brokerName: string;
  brokerDomain: string;
  baselineStatus: 'clean' | 'removed' | 'submitted';
  lastVerifiedOrSubmittedIso: string;
  nextSweepDueIso: string;
  daysUntilNextSweep: number;
  isDueForSweep: boolean;
  isResurfacedRegression: boolean;
}

export interface LiveRelistingProbeDiff {
  brokerId: string;
  brokerName: string;
  brokerDomain: string;
  probeUrl: string;
  httpStatus: number;
  snapshotSha256: string;
  previousSha256: string | null;
  outcome:
    | 'confirmed_absent'
    | 'resurfaced_regression'
    | 'new_exposure_detected'
    | 'still_present_within_sla'
    | 'anti_bot_gated'
    | 'unreachable';
  checkedAtIso: string;
  summary: string;
}

export interface RelistingMonitorConfig {
  cadenceDays: RelistingCadenceDays;
  autoQueueRePurge: boolean;
  lastSweepIso: string | null;
  snapshotHashesByBroker: Record<string, string>;
  recentDiffs: LiveRelistingProbeDiff[];
}

const RELISTING_STORAGE_KEY = 'synout_relisting_monitor_v1';

const DEFAULT_CONFIG: RelistingMonitorConfig = {
  cadenceDays: 30,
  autoQueueRePurge: true,
  lastSweepIso: null,
  snapshotHashesByBroker: {},
  recentDiffs: [],
};

export function loadRelistingMonitorConfig(): RelistingMonitorConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(RELISTING_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<RelistingMonitorConfig>;
    const cadence: RelistingCadenceDays =
      parsed.cadenceDays === 60 || parsed.cadenceDays === 90 ? parsed.cadenceDays : 30;
    return {
      cadenceDays: cadence,
      autoQueueRePurge: parsed.autoQueueRePurge !== false,
      lastSweepIso: typeof parsed.lastSweepIso === 'string' ? parsed.lastSweepIso : null,
      snapshotHashesByBroker:
        parsed.snapshotHashesByBroker && typeof parsed.snapshotHashesByBroker === 'object'
          ? parsed.snapshotHashesByBroker
          : {},
      recentDiffs: Array.isArray(parsed.recentDiffs) ? parsed.recentDiffs.slice(0, 40) : [],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveRelistingMonitorConfig(config: RelistingMonitorConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      RELISTING_STORAGE_KEY,
      JSON.stringify({
        ...config,
        recentDiffs: config.recentDiffs.slice(0, 40),
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function computeRelistingSchedule(
  results: ScanResult[],
  cadenceDays: RelistingCadenceDays,
  nowMs: number = Date.now()
): BrokerRelistingScheduleItem[] {
  const tracked = results.filter(
    (r) =>
      r.removalStatus === 'removed' ||
      r.removalStatus === 'submitted' ||
      Boolean(r.isRegression)
  );

  return tracked
    .map((item) => {
      const broker = findBrokerById(item.brokerId);
      const anchorIso =
        item.liveProbeCheckedAtIso ||
        item.verifiedRemovedAtIso ||
        item.webFormSubmittedAtIso ||
        item.submittedAtIso ||
        new Date(nowMs).toISOString();

      const anchorMs = Date.parse(anchorIso) || nowMs;
      const dueMs = anchorMs + cadenceDays * 24 * 60 * 60 * 1000;
      const daysUntilNextSweep = Math.ceil((dueMs - nowMs) / (24 * 60 * 60 * 1000));

      return {
        brokerId: item.brokerId,
        brokerName: broker?.name || item.brokerId,
        brokerDomain: broker?.domain || `${item.brokerId}.com`,
        baselineStatus: (item.removalStatus === 'removed' ? 'removed' : 'submitted') as
          | 'removed'
          | 'submitted',
        lastVerifiedOrSubmittedIso: anchorIso,
        nextSweepDueIso: new Date(dueMs).toISOString(),
        daysUntilNextSweep,
        isDueForSweep: daysUntilNextSweep <= 0 || Boolean(item.isRegression),
        isResurfacedRegression: Boolean(item.isRegression),
      };
    })
    .sort((a, b) => a.daysUntilNextSweep - b.daysUntilNextSweep);
}
