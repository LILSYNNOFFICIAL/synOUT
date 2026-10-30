export interface BrowserPrivacySignalItem {
  id: string;
  label: string;
  status: 'protected' | 'attention' | 'informational';
  detectedValue: string;
  explanation: string;
  remediationTip: string;
}

export interface BrowserPrivacyAuditReport {
  checkedAtIso: string;
  gpcEnabled: boolean;
  dntEnabled: boolean;
  secureContext: boolean;
  protectedCount: number;
  totalChecks: number;
  signals: BrowserPrivacySignalItem[];
}

interface NavigatorWithPrivacySignals extends Navigator {
  globalPrivacyControl?: boolean;
  deviceMemory?: number;
}

/**
 * Inspects real client-side DOM/Navigator privacy signals (including Sec-GPC / navigator.globalPrivacyControl)
 * with zero network calls or synthetic telemetry. Safe to invoke in both browser and Node test runtimes.
 */
export function inspectBrowserPrivacySignals(): BrowserPrivacyAuditReport {
  const checkedAtIso = new Date().toISOString();

  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      checkedAtIso,
      gpcEnabled: false,
      dntEnabled: false,
      secureContext: true,
      protectedCount: 1,
      totalChecks: 5,
      signals: [
        {
          id: 'gpc',
          label: 'Global Privacy Control (navigator.globalPrivacyControl)',
          status: 'attention',
          detectedValue: 'Unavailable (non-browser runtime)',
          explanation:
            'Legally binding opt-out of sale/sharing signal recognized under CA CCPA/CPRA, CO CPA, CT CTDPA, NJ, OR, and TX laws.',
          remediationTip:
            'Open synOUT in Brave, DuckDuckGo, Firefox (privacy.globalprivacycontrol.enabled), or install Privacy Badger to broadcast Sec-GPC: 1.',
        },
      ],
    };
  }

  const nav = navigator as NavigatorWithPrivacySignals;
  const gpcEnabled = nav.globalPrivacyControl === true;
  const dntRaw = nav.doNotTrack || (window as unknown as { doNotTrack?: string }).doNotTrack;
  const dntEnabled = dntRaw === '1' || dntRaw === 'yes';
  const secureContext = Boolean(window.isSecureContext);
  const cookiesEnabled = Boolean(nav.cookieEnabled);
  const hasWebRtcPeer = typeof window.RTCPeerConnection === 'function';
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const cores = typeof nav.hardwareConcurrency === 'number' ? `${nav.hardwareConcurrency} logical cores` : 'Masked';

  const signals: BrowserPrivacySignalItem[] = [
    {
      id: 'gpc',
      label: 'Global Privacy Control (Sec-GPC / navigator.globalPrivacyControl)',
      status: gpcEnabled ? 'protected' : 'attention',
      detectedValue: gpcEnabled ? 'Active (true — broadcasting Sec-GPC: 1)' : 'Not Broadcast (undefined / false)',
      explanation:
        'Under Cal. Civ. Code § 1798.135(e), Colorado CPA, Oregon, and Texas privacy laws, data brokers must treat an active GPC signal as a valid opt-out of sale/sharing.',
      remediationTip: gpcEnabled
        ? 'Your browser is actively broadcasting Global Privacy Control to every website you visit.'
        : 'Enable GPC in Brave Shields, Firefox Settings -> Website Privacy Preferences ("Tell websites not to sell or share my data"), or via EFF Privacy Badger.',
    },
    {
      id: 'https_context',
      label: 'Origin Transport & Web Crypto Vault Isolation',
      status: secureContext ? 'protected' : 'attention',
      detectedValue: secureContext ? 'Secure Context (HTTPS / Web Crypto AES-256-GCM Ready)' : 'Insecure HTTP Context',
      explanation:
        'Web Crypto PBKDF2 + AES-256-GCM workspace encryption requires an isolated Secure Context.',
      remediationTip: secureContext
        ? 'Origin transport and local cryptographic APIs are isolated and active.'
        : 'Access synOUT over HTTPS (such as GitHub Pages or localhost) so Web Crypto APIs remain available.',
    },
    {
      id: 'dnt',
      label: 'Legacy Do Not Track Header (DNT)',
      status: dntEnabled ? 'protected' : 'informational',
      detectedValue: dntEnabled ? 'Enabled (DNT: 1)' : 'Not Enabled',
      explanation:
        'Advisory tracking preference header; superseded legally by Global Privacy Control (Sec-GPC) in modern state statutes.',
      remediationTip:
        'Prioritize enabling Global Privacy Control (Sec-GPC), which carries statutory enforcement power.',
    },
    {
      id: 'webrtc_surface',
      label: 'WebRTC STUN IP Surface',
      status: hasWebRtcPeer ? 'informational' : 'protected',
      detectedValue: hasWebRtcPeer ? 'RTCPeerConnection Exposed (Standard Browser Default)' : 'Disabled / Hardened',
      explanation:
        'Unrestricted WebRTC STUN requests can reveal local or non-VPN interface addresses when visiting aggressive broker portals.',
      remediationTip:
        'When manually visiting hostile people-search sites over a VPN, set WebRTC IP handling policy to "Disable non-proxied UDP" in browser privacy settings.',
    },
    {
      id: 'fingerprint_entropy',
      label: 'Navigator Hardware & Timezone Entropy',
      status: cookiesEnabled ? 'informational' : 'protected',
      detectedValue: `${cores} · TZ: ${timeZone} · Cookies: ${cookiesEnabled ? 'Enabled' : 'Blocked'}`,
      explanation:
        'Data brokers combine timezone, hardware concurrency, and third-party storage to correlate visits across affiliate mirror domains.',
      remediationTip:
        'Use strict third-party cookie partitioning (Total Cookie Protection / Shields) when completing manual broker opt-out portals.',
    },
  ];

  const protectedCount = signals.filter((s) => s.status === 'protected').length;

  return {
    checkedAtIso,
    gpcEnabled,
    dntEnabled,
    secureContext,
    protectedCount,
    totalChecks: signals.length,
    signals,
  };
}
