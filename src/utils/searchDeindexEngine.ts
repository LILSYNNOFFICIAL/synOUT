import { DataBroker, DeindexItem, DeindexStatus, ScanResult, SearchEngineId, UserProfile } from '../types';
import { findBrokerById } from '../services/emailConnectionStore';
import { getBrokerRecordSearchUrl } from './scanEngine';

export interface SearchEnginePortalConfig {
  id: SearchEngineId;
  name: string;
  personalPiiRemovalUrl: string;
  outdatedCacheUrl: string;
  turnaround: string;
  indexSource: string;
  steps: string[];
}

export const SEARCH_ENGINE_PORTALS: SearchEnginePortalConfig[] = [
  {
    id: 'google',
    name: 'Google Search',
    personalPiiRemovalUrl:
      'https://support.google.com/websearch/troubleshooter/9685456',
    outdatedCacheUrl:
      'https://search.google.com/search-console/remove-outdated-content',
    turnaround: '24–72 Hours (Cache) · 3–7 Days (PII)',
    indexSource: 'Googlebot Primary Index',
    steps: [
      'Run the live Google site-dork query for the broker below and copy the exact search result URL exposing your phone, home address, or email.',
      'If the broker has already removed the page (HTTP 404 or snippet changed), submit the URL to Google Remove Outdated Content for rapid snippet clearing.',
      'If the broker page is still live and displays doxxing/contact PII, submit the URL under Google Personal Content ("Results About You") policy.',
      'Log the URL in your synOUT De-Index Queue below to track snippet removal.',
    ],
  },
  {
    id: 'bing',
    name: 'Microsoft Bing',
    personalPiiRemovalUrl: 'https://www.bing.com/webmasters/tools/contentremoval',
    outdatedCacheUrl: 'https://www.bing.com/webmasters/tools/contentremoval',
    turnaround: '48–96 Hours',
    indexSource: 'Bingbot Index (Also powers Yahoo & DuckDuckGo)',
    steps: [
      'Open the live Bing site-dork link to locate any cached broker profile URLs.',
      'Copy the exposed URL and cached snippet word appearing on the old page.',
      'Open Bing Content Removal ("Remove Broken Link or Outdated Cache") and paste the exact URL.',
      'Clearing Bing cache automatically propagates downstream to Yahoo Search and DuckDuckGo within 7–14 days.',
    ],
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    personalPiiRemovalUrl: 'https://duckduckgo.com/duckduckgo-help-pages/results/removing-content/',
    outdatedCacheUrl: 'https://www.bing.com/webmasters/tools/contentremoval',
    turnaround: '7–14 Days after Broker + Bing Purge',
    indexSource: 'Syndicated via Microsoft Bing + DuckDuckBot',
    steps: [
      'Verify whether your listing appears on DuckDuckGo using the targeted dork query.',
      'Ensure the underlying data broker opt-out has been sent AND submit the URL to Microsoft Bing Content Removal.',
      'Send a Webmaster X-Robots-Tag / HTTP 410 Gone demand to the broker below so crawlers drop the cached snippet.',
    ],
  },
  {
    id: 'yahoo',
    name: 'Yahoo Search',
    personalPiiRemovalUrl: 'https://help.yahoo.com/kb/SLN4530.html',
    outdatedCacheUrl: 'https://www.bing.com/webmasters/tools/contentremoval',
    turnaround: '7–14 Days via Bing Upstream',
    indexSource: 'Powered by Microsoft Bing Organic Index',
    steps: [
      'Check Yahoo organic search results with the pre-built broker dork query.',
      'Submit outdated or deleted URLs through Microsoft Bing Content Removal, which feeds Yahoo organic web listings.',
      'Mark the URL de-indexed once the cached phone/address snippet disappears.',
    ],
  },
  {
    id: 'brave',
    name: 'Brave Search',
    personalPiiRemovalUrl: 'https://search.brave.com/help/right-to-be-forgotten',
    outdatedCacheUrl: 'https://search.brave.com/help/outdated-information',
    turnaround: '3–10 Business Days',
    indexSource: 'Independent Brave Web Discovery Index',
    steps: [
      'Run the Brave Search site-dork query to inspect independent index snippets.',
      'Once the broker returns 404 or removes your name, use Brave Outdated Information / Right-to-be-Forgotten guidance.',
      'Dispatch a Webmaster noindex/noarchive notice to the broker domain if stale snapshots persist.',
    ],
  },
];

export interface BrokerDorkLink {
  engine: SearchEngineId;
  engineLabel: string;
  query: string;
  searchUrl: string;
}

export function buildBrokerSearchEngineDorks(
  brokerDomain: string,
  profile: UserProfile
): BrokerDorkLink[] {
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const city = profile.currentCity.trim();
  const dorkQuery = city
    ? `site:${brokerDomain} "${fullName}" "${city}"`
    : `site:${brokerDomain} "${fullName}"`;
  const encoded = encodeURIComponent(dorkQuery);

  return [
    {
      engine: 'google',
      engineLabel: 'Google',
      query: dorkQuery,
      searchUrl: `https://www.google.com/search?q=${encoded}`,
    },
    {
      engine: 'bing',
      engineLabel: 'Bing',
      query: dorkQuery,
      searchUrl: `https://www.bing.com/search?q=${encoded}`,
    },
    {
      engine: 'duckduckgo',
      engineLabel: 'DuckDuckGo',
      query: dorkQuery,
      searchUrl: `https://duckduckgo.com/?q=${encoded}`,
    },
    {
      engine: 'yahoo',
      engineLabel: 'Yahoo',
      query: dorkQuery,
      searchUrl: `https://search.yahoo.com/search?p=${encoded}`,
    },
    {
      engine: 'brave',
      engineLabel: 'Brave',
      query: dorkQuery,
      searchUrl: `https://search.brave.com/search?q=${encoded}`,
    },
  ];
}

export function buildWebmasterCachePurgeNotice(
  targetUrl: string,
  brokerName: string,
  brokerDomain: string,
  recipientEmail: string,
  profile: UserProfile,
  senderEmailOverride?: string
): { subject: string; body: string } {
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const primaryEmail = senderEmailOverride || profile.emails[0] || 'consumer@example.com';
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subject = `URGENT SEARCH CACHE PURGE & HTTP 410 / NOINDEX DEMAND - ${fullName} (${brokerDomain})`;
  const body = `DATE: ${dateStr}
TO: Privacy Officer & Webmaster Operations, ${brokerName} <${recipientEmail}>
FROM: ${fullName} <${primaryEmail}>
RE: SEARCH ENGINE CACHE PURGE, HTTP 410 GONE & X-ROBOTS-TAG NOINDEX DIRECTIVE

To the Privacy & Technical Operations Team at ${brokerName}:

Pursuant to my statutory deletion rights under Cal. Civ. Code § 1798.105, Tex. Bus. & Com. Code § 541.051, and state omnibus privacy laws, I require both database expungement AND technical search-engine de-indexing of the following URL(s) exposing my personal contact information:

TARGET EXPOSED URL:
- ${targetUrl}

CONSUMER IDENTIFIERS:
- Name: ${fullName}
- Location: ${profile.currentCity}, ${profile.currentState}
- Contact Email: ${primaryEmail}

TECHNICAL COMPLIANCE REQUIREMENTS:
1. Ensure the above URL immediately returns HTTP 404 (Not Found) or HTTP 410 (Gone) rather than a soft-200 redirect page so Googlebot, Bingbot, and Brave Search drop cached PII snippets.
2. Serve an "X-Robots-Tag: noindex, noarchive, nosnippet" HTTP header on any tombstone or directory parent route referencing my name.
3. Trigger URL removal via your verified Google Search Console & Bing Webmaster APIs if cached snippets remain visible.

Please confirm completion in writing to ${primaryEmail}.

Sincerely,
${fullName}`;

  return { subject, body };
}

const DEINDEX_STORAGE_KEY = 'synout_deindex_queue_v1';

export function loadDeindexQueue(): DeindexItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DEINDEX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDeindexQueue(items: DeindexItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEINDEX_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearDeindexQueue(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DEINDEX_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function buildDeindexCandidatesFromScan(
  results: ScanResult[],
  profile: UserProfile
): Array<{ broker: DataBroker; recordUrl: string; result: ScanResult }> {
  return results
    .filter((r) => r.status === 'exposed')
    .map((result) => {
      const broker = findBrokerById(result.brokerId);
      if (!broker) return null;
      return {
        broker,
        recordUrl: getBrokerRecordSearchUrl(broker, profile),
        result,
      };
    })
    .filter(
      (item): item is { broker: DataBroker; recordUrl: string; result: ScanResult } =>
        item !== null
    );
}

export function updateDeindexItemStatus(
  items: DeindexItem[],
  itemId: string,
  status: DeindexStatus,
  emailReceipt?: string
): DeindexItem[] {
  const nowIso = new Date().toISOString();
  return items.map((item) =>
    item.id === itemId
      ? {
          ...item,
          status,
          updatedAtIso: nowIso,
          emailReceipt: emailReceipt || item.emailReceipt,
        }
      : item
  );
}
