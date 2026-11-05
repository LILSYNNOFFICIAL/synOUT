import { UserProfile } from '../types';

export type AdapterWorkflowTopology =
  | 'profile_url_to_portal'
  | 'search_select_verify'
  | 'centralized_network_hub'
  | 'terms_gate_search_remove'
  | 'direct_statutory_form';

export interface BrokerPlaybookDescriptor {
  adapterId: string;
  brokerName: string;
  domains: string[];
  networkGroup?: string;
  topology: AdapterWorkflowTopology;
  canonicalOptOutUrl: string;
  requiresListingUrlField: boolean;
  requiresEmailVerificationLink: boolean;
  knownAntiBotSensitivity: 'low' | 'moderate' | 'high_turnstile';
  termsGateSelectors: string[];
  preferredReasonPatterns: string[];
  listingLinkRegexSource: string;
  stepsSummary: string[];
}

export const BROKER_PLAYBOOK_CATALOG: BrokerPlaybookDescriptor[] = [
  {
    adapterId: 'spokeo-playbook',
    brokerName: 'Spokeo',
    domains: ['spokeo.com'],
    topology: 'profile_url_to_portal',
    canonicalOptOutUrl: 'https://www.spokeo.com/optout',
    requiresListingUrlField: true,
    requiresEmailVerificationLink: true,
    knownAntiBotSensitivity: 'moderate',
    termsGateSelectors: [],
    preferredReasonPatterns: ['remove', 'opt out', 'privacy'],
    listingLinkRegexSource: 'https?:\\/\\/(?:www\\.)?spokeo\\.com\\/[A-Za-z0-9-]+\\/[A-Za-z0-9-]+\\/[A-Za-z0-9]+',
    stepsSummary: [
      'Resolve matching Spokeo directory profile URL by name and state',
      'Populate profile URL and consumer confirmation email on spokeo.com/optout',
      'Complete one-time email verification link via Inbox Harvester',
    ],
  },
  {
    adapterId: 'whitepages-playbook',
    brokerName: 'Whitepages',
    domains: ['whitepages.com'],
    topology: 'profile_url_to_portal',
    canonicalOptOutUrl: 'https://www.whitepages.com/suppression-requests',
    requiresListingUrlField: true,
    requiresEmailVerificationLink: false,
    knownAntiBotSensitivity: 'moderate',
    termsGateSelectors: ['button:has-text("Next")', 'button:has-text("Continue")'],
    preferredReasonPatterns: ['keep my information private', 'remove my personal', 'privacy'],
    listingLinkRegexSource: 'https?:\\/\\/(?:www\\.)?whitepages\\.com\\/name\\/[A-Za-z0-9-]+',
    stepsSummary: [
      'Locate Whitepages /name/ profile URL matching city and age range',
      'Paste profile URL into suppression-requests wizard and select privacy reason',
      'Pause cleanly if automated voice-call verification code is requested',
    ],
  },
  {
    adapterId: 'beenverified-network-playbook',
    brokerName: 'BeenVerified & NeighborWho',
    domains: ['beenverified.com', 'neighborwho.com', 'numberguru.com', 'owners.com'],
    networkGroup: 'BeenVerified Network',
    topology: 'search_select_verify',
    canonicalOptOutUrl: 'https://www.beenverified.com/app/optout/search',
    requiresListingUrlField: false,
    requiresEmailVerificationLink: true,
    knownAntiBotSensitivity: 'moderate',
    termsGateSelectors: ['input[type="checkbox"][name*="agree" i]'],
    preferredReasonPatterns: ['opt out', 'do not sell', 'delete'],
    listingLinkRegexSource: 'https?:\\/\\/(?:www\\.)?beenverified\\.com\\/people\\/[A-Za-z0-9-]+',
    stepsSummary: [
      'Query first name, last name, and state on BeenVerified opt-out search',
      'Score candidate person cards by age, current city, prior cities, and relatives',
      'Submit verification email and harvest BeenVerified confirmation link',
    ],
  },
  {
    adapterId: 'peopleconnect-hub-playbook',
    brokerName: 'PeopleConnect (Intelius / TruthFinder / Instant Checkmate / USPhoneBook)',
    domains: [
      'intelius.com',
      'truthfinder.com',
      'instantcheckmate.com',
      'usphonebook.com',
      'peopleconnect.us',
      'suppression.peopleconnect.us',
      'addresses.com',
      'zabasearch.com',
    ],
    networkGroup: 'PeopleConnect Suppression Center',
    topology: 'centralized_network_hub',
    canonicalOptOutUrl: 'https://suppression.peopleconnect.us/login',
    requiresListingUrlField: false,
    requiresEmailVerificationLink: true,
    knownAntiBotSensitivity: 'moderate',
    termsGateSelectors: [
      'input[type="checkbox"]',
      'button:has-text("Accept")',
      'button:has-text("Continue")',
    ],
    preferredReasonPatterns: ['suppress', 'opt out', 'delete'],
    listingLinkRegexSource: 'https?:\\/\\/suppression\\.peopleconnect\\.us\\/[A-Za-z0-9/_-]+',
    stepsSummary: [
      'Route multi-brand suppression through centralized PeopleConnect portal',
      'Enter consumer email, verify email token via Inbox Harvester, and match DOB/name',
      'Apply network-wide suppression flag across Intelius, TruthFinder & Instant Checkmate',
    ],
  },
  {
    adapterId: 'radaris-playbook',
    brokerName: 'Radaris',
    domains: ['radaris.com'],
    topology: 'profile_url_to_portal',
    canonicalOptOutUrl: 'https://radaris.com/control/privacy',
    requiresListingUrlField: true,
    requiresEmailVerificationLink: true,
    knownAntiBotSensitivity: 'moderate',
    termsGateSelectors: [],
    preferredReasonPatterns: ['remove', 'control privacy', 'delete'],
    listingLinkRegexSource: 'https?:\\/\\/(?:www\\.)?radaris\\.com\\/~[A-Za-z0-9_-]+|https?:\\/\\/(?:www\\.)?radaris\\.com\\/p\\/[A-Za-z0-9/-]+',
    stepsSummary: [
      'Resolve Radaris /p/First/Last/ profile record URL',
      'Populate profile link, full name, and email on radaris.com/control/privacy',
      'Complete Radaris email confirmation link',
    ],
  },
  {
    adapterId: 'fastpeoplesearch-playbook',
    brokerName: 'FastPeopleSearch',
    domains: ['fastpeoplesearch.com'],
    topology: 'terms_gate_search_remove',
    canonicalOptOutUrl: 'https://www.fastpeoplesearch.com/removal',
    requiresListingUrlField: false,
    requiresEmailVerificationLink: false,
    knownAntiBotSensitivity: 'high_turnstile',
    termsGateSelectors: [
      'input[type="checkbox"]',
      'button:has-text("Begin Opt-Out Process")',
      'a:has-text("Begin Opt-Out")',
    ],
    preferredReasonPatterns: ['remove my record', 'opt out'],
    listingLinkRegexSource: 'https?:\\/\\/(?:www\\.)?fastpeoplesearch\\.com\\/[A-Za-z0-9_-]+_id_[A-Za-z0-9]+',
    stepsSummary: [
      'Accept mandatory portal terms checkbox and initiate removal lookup',
      'Match exact residential record card and trigger Remove My Record',
      'Automatically hand off to 1-Click Bookmarklet if Cloudflare Turnstile challenges IP',
    ],
  },
  {
    adapterId: 'truepeoplesearch-playbook',
    brokerName: 'TruePeopleSearch',
    domains: ['truepeoplesearch.com'],
    topology: 'terms_gate_search_remove',
    canonicalOptOutUrl: 'https://www.truepeoplesearch.com/removal',
    requiresListingUrlField: false,
    requiresEmailVerificationLink: false,
    knownAntiBotSensitivity: 'high_turnstile',
    termsGateSelectors: [
      'input[type="checkbox"]',
      'button:has-text("Begin Removal")',
    ],
    preferredReasonPatterns: ['remove this record', 'opt out'],
    listingLinkRegexSource: 'https?:\\/\\/(?:www\\.)?truepeoplesearch\\.com\\/find\\/person\\/[A-Za-z0-9]+',
    stepsSummary: [
      'Accept removal terms checkbox and enter consumer email',
      'Locate matching person card and click Remove This Record',
      'Cleanly surface Turnstile handoff if datacenter challenge triggers',
    ],
  },
  {
    adapterId: 'nuwber-playbook',
    brokerName: 'Nuwber',
    domains: ['nuwber.com'],
    topology: 'profile_url_to_portal',
    canonicalOptOutUrl: 'https://nuwber.com/removal/link',
    requiresListingUrlField: true,
    requiresEmailVerificationLink: true,
    knownAntiBotSensitivity: 'low',
    termsGateSelectors: [],
    preferredReasonPatterns: ['remove', 'opt out', 'ccpa'],
    listingLinkRegexSource: 'https?:\\/\\/(?:www\\.)?nuwber\\.com\\/person\\/[A-Za-z0-9-]+',
    stepsSummary: [
      'Resolve or synthesize Nuwber /person/ listing URL',
      'Submit listing URL + consumer email on nuwber.com/removal/link',
      'Confirm activation link via Inbox Harvester',
    ],
  },
  {
    adapterId: 'clustrmaps-playbook',
    brokerName: 'ClustrMaps',
    domains: ['clustrmaps.com'],
    topology: 'profile_url_to_portal',
    canonicalOptOutUrl: 'https://clustrmaps.com/bl/opt-out',
    requiresListingUrlField: true,
    requiresEmailVerificationLink: false,
    knownAntiBotSensitivity: 'low',
    termsGateSelectors: [],
    preferredReasonPatterns: ['remove', 'privacy', 'ccpa'],
    listingLinkRegexSource: 'https?:\\/\\/(?:www\\.)?clustrmaps\\.com\\/person\\/[A-Za-z0-9-]+',
    stepsSummary: [
      'Resolve ClustrMaps person/parcel URL',
      'Populate name, email, and listing URL on clustrmaps.com/bl/opt-out',
      'Select exposed address rows for suppression',
    ],
  },
  {
    adapterId: 'mylife-playbook',
    brokerName: 'MyLife',
    domains: ['mylife.com'],
    topology: 'direct_statutory_form',
    canonicalOptOutUrl: 'https://www.mylife.com/ccpa/index.pubview',
    requiresListingUrlField: false,
    requiresEmailVerificationLink: false,
    knownAntiBotSensitivity: 'low',
    termsGateSelectors: [],
    preferredReasonPatterns: ['delete my personal information', 'do not sell', 'ccpa'],
    listingLinkRegexSource: 'https?:\\/\\/(?:www\\.)?mylife\\.com\\/[a-z0-9-]+',
    stepsSummary: [
      'Open MyLife CCPA / Do Not Sell statutory portal',
      'Populate full name, email, birth year, and ZIP/city fields',
      'Submit deletion demand and log SHA-256 receipt',
    ],
  },
  {
    adapterId: 'peekyou-playbook',
    brokerName: 'PeekYou',
    domains: ['peekyou.com'],
    topology: 'direct_statutory_form',
    canonicalOptOutUrl: 'https://www.peekyou.com/about/contact/ccpa_optout',
    requiresListingUrlField: false,
    requiresEmailVerificationLink: true,
    knownAntiBotSensitivity: 'low',
    termsGateSelectors: [],
    preferredReasonPatterns: ['delete', 'opt out', 'remove all'],
    listingLinkRegexSource: 'https?:\\/\\/(?:www\\.)?peekyou\\.com\\/[A-Za-z0-9_]+',
    stepsSummary: [
      'Resolve PeekYou unique_id slug from consumer name/state search',
      'Populate statutory CCPA deletion form at peekyou.com/about/contact/ccpa_optout',
      'Confirm inbound verification email link',
    ],
  },
];

function normalizeDomainKey(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split(':')[0];
}

export function resolveBrokerPlaybook(domainOrId?: string | null): BrokerPlaybookDescriptor | null {
  if (!domainOrId) return null;
  const cleaned = normalizeDomainKey(domainOrId);
  if (!cleaned) return null;

  for (const pb of BROKER_PLAYBOOK_CATALOG) {
    if (pb.adapterId === cleaned) return pb;
    for (const d of pb.domains) {
      if (cleaned === d || cleaned.endsWith(`.${d}`) || d.startsWith(`${cleaned}.`)) {
        return pb;
      }
    }
  }
  return null;
}

export function listAllBrokerPlaybooks(): BrokerPlaybookDescriptor[] {
  return BROKER_PLAYBOOK_CATALOG;
}

/**
 * Deterministic fallback profile URL builder when a broker's suppression form requires
 * a `profile_url` / `listing_url` input and no live candidate card link was rendered on the form page.
 */
export function synthesizeBrokerCandidateProfileUrl(
  brokerDomain: string,
  profile: UserProfile
): string {
  const domain = normalizeDomainKey(brokerDomain);
  const first = encodeURIComponent((profile.firstName || 'Jane').trim());
  const last = encodeURIComponent((profile.lastName || 'Doe').trim());
  const slugName = `${(profile.firstName || 'Jane').trim()}-${(profile.lastName || 'Doe').trim()}`
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/-+/g, '-');
  const citySlug = (profile.currentCity || '')
    .trim()
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/-+/g, '-');
  const state = (profile.currentState || 'CA').trim().toUpperCase();

  if (domain.includes('spokeo.com')) {
    return `https://www.spokeo.com/${slugName}/${state}${citySlug ? `/${citySlug}` : ''}`;
  }
  if (domain.includes('whitepages.com')) {
    return `https://www.whitepages.com/name/${slugName}/${citySlug ? `${citySlug}-` : ''}${state}`;
  }
  if (domain.includes('radaris.com')) {
    return `https://radaris.com/p/${first}/${last}/`;
  }
  if (domain.includes('nuwber.com')) {
    return `https://nuwber.com/search?name=${first}%20${last}&state=${encodeURIComponent(state)}`;
  }
  if (domain.includes('clustrmaps.com')) {
    return `https://clustrmaps.com/persons/${slugName}`;
  }
  if (domain.includes('peekyou.com')) {
    return `https://www.peekyou.com/${slugName.replace(/-/g, '_')}`;
  }
  return `https://${domain || 'example.com'}/search?q=${first}+${last}`;
}
