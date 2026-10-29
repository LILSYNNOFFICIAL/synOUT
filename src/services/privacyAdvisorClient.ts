import { ScanResult, ScanStats, UserProfile } from '../types';
import { findBrokerById } from './emailConnectionStore';
import { sessionFetch } from './sessionClient';

export type AdvisorRoleId = 'statutory_counsel' | 'broker_researcher' | 'rapid_triage';
export type AdvisorSpeedMode = 'grounded_standard' | 'fast_lite';

export interface GroundingCitation {
  uri: string;
  title: string;
}

export interface AdvisorChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestampIso: string;
  citations?: GroundingCitation[];
  searchQueries?: string[];
  modelUsed?: 'gemini-3.8-flash' | 'gemini-3.1-flash-lite';
  roleId?: AdvisorRoleId;
  groundedWithSearch?: boolean;
}

export interface AdvisorScanContextSummary {
  jurisdictionState?: string;
  exposureScore?: number;
  totalBrokersScanned?: number;
  exposedCount?: number;
  inProgressCount?: number;
  removedCount?: number;
  topExposedBrokers?: Array<{
    name: string;
    domain: string;
    risk: string;
    removalStatus?: string;
  }>;
}

export interface BrokerLiveIntelResponse {
  brokerName: string;
  brokerDomain: string;
  summaryText: string;
  citations: GroundingCitation[];
  searchQueries: string[];
  modelUsed: 'gemini-3.8-flash';
  checkedAtIso: string;
}

const ADVISOR_THREAD_STORAGE_KEY = 'synout_privacy_advisor_thread_v1';

export function loadAdvisorThreadHistory(): AdvisorChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage?.getItem(ADVISOR_THREAD_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m) =>
        m &&
        typeof m.id === 'string' &&
        (m.role === 'user' || m.role === 'model') &&
        typeof m.text === 'string'
    );
  } catch {
    return [];
  }
}

export function saveAdvisorThreadHistory(messages: AdvisorChatMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage?.setItem(
      ADVISOR_THREAD_STORAGE_KEY,
      JSON.stringify(messages.slice(-40))
    );
  } catch {
    // Ignore storage quota restrictions
  }
}

export function clearAdvisorThreadHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage?.removeItem(ADVISOR_THREAD_STORAGE_KEY);
  } catch {
    // Ignore storage restrictions
  }
}

export function buildScanContextSummary(
  profile: UserProfile | null,
  results: ScanResult[],
  stats: ScanStats
): AdvisorScanContextSummary {
  const exposed = results.filter((r) => r.status === 'exposed');
  const riskRank: Record<string, number> = { Critical: 3, High: 2, Medium: 1 };

  const topExposedBrokers = [...exposed]
    .sort((a, b) => {
      const rA = riskRank[a.mockListingData.riskLevel] || 1;
      const rB = riskRank[b.mockListingData.riskLevel] || 1;
      return rB - rA;
    })
    .slice(0, 12)
    .map((item) => {
      const broker = findBrokerById(item.brokerId);
      return {
        name: broker?.name || item.brokerId,
        domain: broker?.domain || `${item.brokerId}.com`,
        risk: broker?.risk || item.mockListingData.riskLevel || 'Medium',
        removalStatus: item.removalStatus || 'found',
      };
    });

  return {
    jurisdictionState: profile?.currentState || undefined,
    exposureScore: stats.exposureScore,
    totalBrokersScanned: stats.totalBrokers,
    exposedCount: stats.exposedBrokers,
    inProgressCount: stats.inProgressRemovals,
    removedCount: stats.removedBrokers,
    topExposedBrokers,
  };
}

export async function sendPrivacyAdvisorMessageClient(params: {
  message: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  roleId: AdvisorRoleId;
  speedMode: AdvisorSpeedMode;
  useSearchGrounding: boolean;
  scanContext?: AdvisorScanContextSummary;
}): Promise<{
  replyText: string;
  citations: GroundingCitation[];
  searchQueries: string[];
  modelUsed: 'gemini-3.8-flash' | 'gemini-3.1-flash-lite';
  roleId: AdvisorRoleId;
  groundedWithSearch: boolean;
  timestampIso: string;
}> {
  const res = await sessionFetch('/api/advisor/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data?.error || 'Could not reach the Privacy Advisor service. Please try again.'
    );
  }
  return data;
}

export async function lookupBrokerLiveIntelClient(params: {
  brokerName: string;
  brokerDomain: string;
  optOutUrl?: string;
  jurisdictionState?: string;
}): Promise<BrokerLiveIntelResponse> {
  const res = await sessionFetch('/api/advisor/broker-intel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data?.error || `Could not retrieve live web intelligence for ${params.brokerName}.`
    );
  }
  return data;
}
