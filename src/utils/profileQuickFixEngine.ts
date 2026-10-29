import { ScanResult, UserProfile } from '../types';
import { findBrokerById } from '../services/emailConnectionStore';
import { normalizeStateCode } from './scanEngine';

export type DiscrepancyCategory =
  | 'outdated_address'
  | 'state_jurisdiction'
  | 'property_anchor'
  | 'contact_telemetry'
  | 'homonym_disambiguation'
  | 'asset_corporate';

export type DiscrepancySeverity = 'high' | 'medium' | 'low';

export type QuickFixInputKind =
  | 'none'
  | 'street_and_zip'
  | 'prior_location'
  | 'phone'
  | 'email'
  | 'birth_year'
  | 'relative_name';

export interface ProfileDiscrepancyItem {
  id: string;
  category: DiscrepancyCategory;
  severity: DiscrepancySeverity;
  title: string;
  description: string;
  impactLabel: string;
  affectedBrokersCount: number;
  canAutoFixImmediately: boolean;
  autoFixPreview?: string;
  inputKind: QuickFixInputKind;
  applyFix: (profile: UserProfile, inputValues?: Record<string, string>) => UserProfile;
}

export interface ProfileMatchAccuracyAudit {
  accuracyScore: number;
  discrepancies: ProfileDiscrepancyItem[];
  autoFixableCount: number;
  skippedRealEstateCount: number;
  skippedFinancialCount: number;
  skippedAssetB2BCount: number;
}

const VALID_US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
]);

function toTitleCaseWords(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => {
      if (!word) return '';
      if (word.length <= 2 && word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function isLikelyStateToken(raw: string): boolean {
  const code = normalizeStateCode(raw.trim());
  return code.length === 2 && VALID_US_STATE_CODES.has(code);
}

/**
 * Normalizes a city/state string such as "austin, texas" or "austin tx" into "Austin, TX".
 */
export function normalizeLocationCityState(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';

  const commaParts = cleaned
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (commaParts.length >= 2) {
    const cityPart = toTitleCaseWords(commaParts.slice(0, -1).join(' '));
    const stateCandidate = normalizeStateCode(commaParts[commaParts.length - 1]);
    if (VALID_US_STATE_CODES.has(stateCandidate)) {
      return `${cityPart}, ${stateCandidate}`;
    }
    return `${cityPart}, ${commaParts[commaParts.length - 1]}`;
  }

  // Handle "Austin TX" or "Austin Texas" without a comma
  const words = cleaned.split(' ');
  if (words.length >= 2) {
    const twoWordState = words.slice(-2).join(' ');
    const twoWordCode = normalizeStateCode(twoWordState);
    if (words.length >= 3 && VALID_US_STATE_CODES.has(twoWordCode)) {
      const city = toTitleCaseWords(words.slice(0, -2).join(' '));
      return `${city}, ${twoWordCode}`;
    }

    const oneWordState = words[words.length - 1];
    const oneWordCode = normalizeStateCode(oneWordState);
    if (VALID_US_STATE_CODES.has(oneWordCode)) {
      const city = toTitleCaseWords(words.slice(0, -1).join(' '));
      return `${city}, ${oneWordCode}`;
    }
  }

  return toTitleCaseWords(cleaned);
}

/**
 * Parses prior locations from either a raw user input string ("Austin, TX; Denver, CO")
 * or an existing string[] array (repairing accidentally comma-split pairs like ["Austin", "TX"]).
 */
export function parsePriorLocationsList(input: string | string[]): string[] {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return [];

    // If separated by semicolons, pipes, or newlines, split directly on those
    if (/[;|\n]/.test(trimmed)) {
      return trimmed
        .split(/[;|\n]+/)
        .map((entry) => normalizeLocationCityState(entry))
        .filter(Boolean);
    }

    // Otherwise split by commas and coalesce [City, State] pairs
    const tokens = trimmed
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    return coalesceLocationTokens(tokens);
  }

  if (!Array.isArray(input)) return [];
  const flatTokens = input.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
  return coalesceLocationTokens(flatTokens);
}

function coalesceLocationTokens(tokens: string[]): string[] {
  const coalesced: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const current = tokens[i];
    const next = tokens[i + 1];

    // If current already has a comma ("Austin, TX"), normalize it directly
    if (current.includes(',')) {
      const norm = normalizeLocationCityState(current);
      if (norm) coalesced.push(norm);
      i += 1;
      continue;
    }

    // If current is a city name and next is a standalone state name/code ("Austin", "TX")
    if (next && !next.includes(',') && !isLikelyStateToken(current) && isLikelyStateToken(next)) {
      coalesced.push(`${toTitleCaseWords(current)}, ${normalizeStateCode(next)}`);
      i += 2;
      continue;
    }

    const norm = normalizeLocationCityState(current);
    if (norm) coalesced.push(norm);
    i += 1;
  }

  // Case-insensitive deduplication preserving order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const loc of coalesced) {
    const key = loc.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(loc);
    }
  }
  return deduped;
}

/**
 * Formats 10-digit or 1-prefixed 11-digit US phone numbers as (XXX) XXX-XXXX.
 */
export function normalizeUsPhoneNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return trimmed;
}

function normalizePhoneArray(phones: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of phones || []) {
    if (!raw || !raw.trim()) continue;
    const formatted = normalizeUsPhoneNumber(raw);
    const digitsKey = formatted.replace(/\D/g, '') || formatted.toLowerCase();
    if (!seen.has(digitsKey)) {
      seen.add(digitsKey);
      out.push(formatted);
    }
  }
  return out;
}

function normalizeEmailArray(emails: string[], connectedEmail?: string | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const candidates = [...(emails || [])];
  if (connectedEmail && connectedEmail.includes('@')) {
    candidates.push(connectedEmail);
  }
  for (const raw of candidates) {
    if (!raw || !raw.trim()) continue;
    const lowered = raw.trim().toLowerCase();
    if (!lowered.includes('@')) continue;
    if (!seen.has(lowered)) {
      seen.add(lowered);
      out.push(lowered);
    }
  }
  return out;
}

function arraysEqualExact(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

/**
 * Scans the active UserProfile and ScanResult[] for common profile discrepancies
 * (outdated/duplicate/split prior addresses, unnormalized state/city casing, missing
 * parcel street/ZIP anchors, unformatted phones, unsynced emails, and missing homonym
 * disambiguators) and returns actionable Quick Fixes.
 */
export function analyzeProfileDiscrepancies(
  profile: UserProfile,
  results: ScanResult[],
  connectedEmail?: string | null
): ProfileMatchAccuracyAudit {
  const discrepancies: ProfileDiscrepancyItem[] = [];
  const currentYear = new Date().getFullYear();

  const normalizedState = normalizeStateCode(profile.currentState);
  const normalizedCity = profile.currentCity.trim() ? toTitleCaseWords(profile.currentCity) : '';
  const normalizedFirst = profile.firstName.trim() ? toTitleCaseWords(profile.firstName) : '';
  const normalizedLast = profile.lastName.trim() ? toTitleCaseWords(profile.lastName) : '';
  const canonicalCurrentLoc =
    normalizedCity && normalizedState ? `${normalizedCity}, ${normalizedState}`.toLowerCase() : '';

  const exposedCount = results.filter((r) => r.status === 'exposed').length;

  const skippedRealEstateCount = results.filter((r) => {
    if (r.status !== 'clean') return false;
    const broker = findBrokerById(r.brokerId);
    return broker?.category === 'Real Estate & Property';
  }).length;

  const skippedFinancialCount = results.filter((r) => {
    if (r.status !== 'clean') return false;
    const broker = findBrokerById(r.brokerId);
    return broker?.category === 'Financial & Credit Marketing';
  }).length;

  const skippedAssetB2BCount = results.filter((r) => {
    if (r.status !== 'clean') return false;
    const broker = findBrokerById(r.brokerId);
    return (
      broker?.category === 'Vehicle & Asset Registry' ||
      broker?.category === 'B2B & Professional Intelligence'
    );
  }).length;

  // 1. Outdated / Split / Duplicate / Unnormalized Prior Addresses
  const rawPrev = (profile.previousLocations || []).filter((item) => typeof item === 'string');
  const coalescedPrev = parsePriorLocationsList(rawPrev);
  const cleanedPrevWithoutCurrent = coalescedPrev.filter(
    (loc) => loc.toLowerCase() !== canonicalCurrentLoc
  );

  const hadCurrentDuplicateInPrev = coalescedPrev.length !== cleanedPrevWithoutCurrent.length;
  const hadFormattingOrSplitDriftInPrev = !arraysEqualExact(rawPrev, cleanedPrevWithoutCurrent);

  if (rawPrev.length > 0 && (hadCurrentDuplicateInPrev || hadFormattingOrSplitDriftInPrev)) {
    const previewBefore = rawPrev.join(' | ');
    const previewAfter =
      cleanedPrevWithoutCurrent.length > 0
        ? cleanedPrevWithoutCurrent.join(' · ')
        : 'Cleared redundant current-city duplicate';

    discrepancies.push({
      id: 'fix-outdated-prior-addresses',
      category: 'outdated_address',
      severity: 'high',
      title: hadCurrentDuplicateInPrev
        ? 'Current Residence Duplicated in Prior Address History'
        : 'Prior Address Formatting / Split State Discrepancy',
      description: hadCurrentDuplicateInPrev
        ? `Your current city (${normalizedCity}, ${normalizedState}) also appears in previous addresses, which causes NCOA move-history collisions on multi-state people-search aggregators.`
        : 'Prior address entries contain split city/state tokens, full state names, or duplicates that weaken cross-state public record matching.',
      impactLabel: `Improves cross-state NCOA matching across ${Math.max(exposedCount, 12)} brokers`,
      affectedBrokersCount: Math.max(exposedCount, 12),
      canAutoFixImmediately: true,
      autoFixPreview: `${previewBefore} → ${previewAfter}`,
      inputKind: 'none',
      applyFix: (currentProfile) => ({
        ...currentProfile,
        previousLocations: parsePriorLocationsList(currentProfile.previousLocations || []).filter(
          (loc) =>
            loc.toLowerCase() !==
            `${toTitleCaseWords(currentProfile.currentCity)}, ${normalizeStateCode(
              currentProfile.currentState
            )}`.toLowerCase()
        ),
      }),
    });
  } else if (cleanedPrevWithoutCurrent.length === 0) {
    discrepancies.push({
      id: 'add-historical-prior-address',
      category: 'outdated_address',
      severity: 'medium',
      title: 'No Prior Address History (7–15 Year NCOA Window)',
      description:
        'People-search brokers retain 7–15 years of USPS NCOA forwarding addresses. Adding a prior City, ST uncovers lingering listings tied to former residences.',
      impactLabel: 'Expands multi-state broker jurisdiction coverage',
      affectedBrokersCount: Math.max(8, Math.round(results.length * 0.15)),
      canAutoFixImmediately: false,
      inputKind: 'prior_location',
      applyFix: (currentProfile, inputValues) => {
        const rawInput = inputValues?.priorLocation || '';
        const parsedNew = parsePriorLocationsList(rawInput);
        if (parsedNew.length === 0) return currentProfile;
        const merged = parsePriorLocationsList([
          ...(currentProfile.previousLocations || []),
          ...parsedNew,
        ]).filter(
          (loc) =>
            loc.toLowerCase() !==
            `${toTitleCaseWords(currentProfile.currentCity)}, ${normalizeStateCode(
              currentProfile.currentState
            )}`.toLowerCase()
        );
        return {
          ...currentProfile,
          previousLocations: merged,
        };
      },
    });
  }

  // 2. Primary State Code & Name/City Normalization
  const hasPrimaryDrift =
    (profile.currentState.trim() !== '' && profile.currentState !== normalizedState) ||
    (profile.currentCity.trim() !== '' && profile.currentCity !== normalizedCity) ||
    (profile.firstName.trim() !== '' && profile.firstName !== normalizedFirst) ||
    (profile.lastName.trim() !== '' && profile.lastName !== normalizedLast);

  if (hasPrimaryDrift) {
    discrepancies.push({
      id: 'fix-primary-identity-normalization',
      category: 'state_jurisdiction',
      severity: 'high',
      title: 'Unnormalized Primary State Code or Name Casing',
      description:
        'Data broker opt-out portals and statutory CCPA/TDPSA templates expect standardized 2-letter postal state codes and clean title-cased names.',
      impactLabel: `Standardizes opt-out autofill across ${Math.max(exposedCount, 10)} portals`,
      affectedBrokersCount: Math.max(exposedCount, 10),
      canAutoFixImmediately: true,
      autoFixPreview: `${profile.firstName} ${profile.lastName} (${profile.currentCity}, ${profile.currentState}) → ${normalizedFirst} ${normalizedLast} (${normalizedCity}, ${normalizedState})`,
      inputKind: 'none',
      applyFix: (currentProfile) => ({
        ...currentProfile,
        firstName: toTitleCaseWords(currentProfile.firstName),
        lastName: toTitleCaseWords(currentProfile.lastName),
        currentCity: toTitleCaseWords(currentProfile.currentCity),
        currentState: normalizeStateCode(currentProfile.currentState),
      }),
    });
  }

  // 3. Missing Physical Street Address or 5-Digit ZIP (Unlocks Real Estate & Property Brokers)
  const hasValidStreet = Boolean(profile.currentStreet && profile.currentStreet.trim().length > 3);
  const hasValidZip = Boolean(
    profile.currentZip && /^\d{5}(-\d{4})?$/.test(profile.currentZip.trim())
  );

  if (!hasValidStreet || !hasValidZip) {
    const missingParts = [
      !hasValidStreet ? 'street parcel address' : null,
      !hasValidZip ? '5-digit ZIP code' : null,
    ]
      .filter(Boolean)
      .join(' and ');

    discrepancies.push({
      id: 'add-street-and-zip-anchor',
      category: 'property_anchor',
      severity: skippedRealEstateCount > 0 ? 'high' : 'medium',
      title: `Missing ${!hasValidStreet && !hasValidZip ? 'Street Address & ZIP Code' : !hasValidStreet ? 'Physical Street Address' : '5-Digit ZIP Code'}`,
      description: `Your profile is missing a ${missingParts}. County deed/property brokers require a street parcel to check property tax indexes, and web forms use ZIP codes to verify exact household records.`,
      impactLabel:
        skippedRealEstateCount > 0
          ? `Unlocks ${skippedRealEstateCount} skipped Property & Deed brokers + form autofill`
          : 'Completes residential address autofill for web opt-out forms',
      affectedBrokersCount: Math.max(skippedRealEstateCount, 6),
      canAutoFixImmediately: false,
      inputKind: 'street_and_zip',
      applyFix: (currentProfile, inputValues) => {
        const nextStreet = (inputValues?.street ?? currentProfile.currentStreet ?? '').trim();
        const nextZip = (inputValues?.zip ?? currentProfile.currentZip ?? '').trim();
        return {
          ...currentProfile,
          currentStreet: nextStreet || currentProfile.currentStreet,
          currentZip: nextZip || currentProfile.currentZip,
        };
      },
    });
  }

  // 4. Phone Number Formatting / Missing Telemetry
  const rawPhones = profile.phoneNumbers || [];
  const normalizedPhones = normalizePhoneArray(rawPhones);
  if (normalizedPhones.length === 0) {
    discrepancies.push({
      id: 'add-primary-phone-anchor',
      category: 'contact_telemetry',
      severity: skippedFinancialCount > 0 ? 'high' : 'medium',
      title: 'Missing Phone Telemetry Anchor',
      description:
        'Reverse-phone directories and credit-marketing clearinghouses index records by 10-digit subscriber number. Adding a phone number improves record verification.',
      impactLabel:
        skippedFinancialCount > 0
          ? `Unlocks ${skippedFinancialCount} Financial & Credit Marketing brokers`
          : 'Enables reverse-phone directory matching',
      affectedBrokersCount: Math.max(skippedFinancialCount, 8),
      canAutoFixImmediately: false,
      inputKind: 'phone',
      applyFix: (currentProfile, inputValues) => {
        const rawPhone = (inputValues?.phone || '').trim();
        if (!rawPhone) return currentProfile;
        return {
          ...currentProfile,
          phoneNumbers: normalizePhoneArray([...(currentProfile.phoneNumbers || []), rawPhone]),
        };
      },
    });
  } else if (!arraysEqualExact(rawPhones, normalizedPhones)) {
    discrepancies.push({
      id: 'fix-phone-formatting',
      category: 'contact_telemetry',
      severity: 'medium',
      title: 'Unstandardized or Duplicate Phone Numbers',
      description:
        'Standardizing phone numbers to (XXX) XXX-XXXX ensures automated opt-out web forms pass US phone input masks on Whitepages, Spokeo, and BeenVerified.',
      impactLabel: `Standardizes phone mask for ${Math.max(exposedCount, 8)} opt-out forms`,
      affectedBrokersCount: Math.max(exposedCount, 8),
      canAutoFixImmediately: true,
      autoFixPreview: `${rawPhones.filter(Boolean).join(', ')} → ${normalizedPhones.join(', ')}`,
      inputKind: 'none',
      applyFix: (currentProfile) => ({
        ...currentProfile,
        phoneNumbers: normalizePhoneArray(currentProfile.phoneNumbers || []),
      }),
    });
  }

  // 5. Email Hygiene & Connected Inbox Sync
  const rawEmails = profile.emails || [];
  const cleanedExistingEmails = normalizeEmailArray(rawEmails, null);
  const syncedWithConnectedEmails = normalizeEmailArray(rawEmails, connectedEmail);
  const missingConnectedInProfile =
    Boolean(connectedEmail && connectedEmail.includes('@')) &&
    !cleanedExistingEmails.includes(connectedEmail!.trim().toLowerCase());

  if (syncedWithConnectedEmails.length === 0) {
    discrepancies.push({
      id: 'add-primary-email-anchor',
      category: 'contact_telemetry',
      severity: 'high',
      title: 'No Verification Email in Profile',
      description:
        'Most online opt-out forms send a confirmation link to your email address, and credit-marketing brokers require email + phone anchors.',
      impactLabel:
        skippedFinancialCount > 0
          ? `Unlocks ${skippedFinancialCount} Financial & Credit brokers + form receipts`
          : 'Required for opt-out confirmation links',
      affectedBrokersCount: Math.max(skippedFinancialCount, 10),
      canAutoFixImmediately: false,
      inputKind: 'email',
      applyFix: (currentProfile, inputValues) => {
        const rawEmail = (inputValues?.email || '').trim();
        if (!rawEmail || !rawEmail.includes('@')) return currentProfile;
        return {
          ...currentProfile,
          emails: normalizeEmailArray([...(currentProfile.emails || []), rawEmail], null),
        };
      },
    });
  } else if (missingConnectedInProfile || !arraysEqualExact(rawEmails, syncedWithConnectedEmails)) {
    discrepancies.push({
      id: 'fix-email-sync-and-casing',
      category: 'contact_telemetry',
      severity: missingConnectedInProfile ? 'medium' : 'low',
      title: missingConnectedInProfile
        ? 'Connected Dispatch Email Not Added to Scan Profile'
        : 'Email Casing / Blank Entry Discrepancy',
      description: missingConnectedInProfile
        ? `Your active sender address (${connectedEmail}) is not yet listed in your scan profile's monitored emails.`
        : 'Normalizing email casing and removing blank entries prevents web-form validation errors.',
      impactLabel: 'Aligns scan matching with verification inbox',
      affectedBrokersCount: Math.max(exposedCount, 6),
      canAutoFixImmediately: true,
      autoFixPreview: `${rawEmails.filter(Boolean).join(', ') || '(empty)'} → ${syncedWithConnectedEmails.join(', ')}`,
      inputKind: 'none',
      applyFix: (currentProfile) => ({
        ...currentProfile,
        emails: normalizeEmailArray(currentProfile.emails || [], connectedEmail),
      }),
    });
  }

  // 6. Homonym Disambiguation: Birth Year & Relatives
  const parsedBirthYear = parseInt((profile.birthYear || '').trim(), 10);
  const hasValidBirthYear =
    !Number.isNaN(parsedBirthYear) &&
    parsedBirthYear >= 1900 &&
    parsedBirthYear <= currentYear - 13;

  if (!hasValidBirthYear) {
    discrepancies.push({
      id: 'add-birth-year-disambiguator',
      category: 'homonym_disambiguation',
      severity: 'medium',
      title: 'Missing or Invalid 4-Digit Birth Year',
      description:
        'People-search sites display age bands (e.g., Age 37) to separate homonyms sharing the same first and last name. Adding your birth year sharpens match confidence.',
      impactLabel: `Eliminates same-name false positives across ${Math.max(exposedCount, 10)} sites`,
      affectedBrokersCount: Math.max(exposedCount, 10),
      canAutoFixImmediately: false,
      inputKind: 'birth_year',
      applyFix: (currentProfile, inputValues) => {
        const yr = (inputValues?.birthYear || '').trim();
        if (!/^\d{4}$/.test(yr)) return currentProfile;
        return {
          ...currentProfile,
          birthYear: yr,
        };
      },
    });
  }

  const validRelatives = (profile.relatives || []).map((r) => r.trim()).filter(Boolean);
  if (validRelatives.length === 0) {
    discrepancies.push({
      id: 'add-household-relative-anchor',
      category: 'homonym_disambiguation',
      severity: 'low',
      title: 'No Household Relative Disambiguator Set',
      description:
        'Aggregators like Spokeo, Radaris, and PeopleConnect group listings by "Related To" household links. Adding 1 relative name helps distinguish your record from namesakes.',
      impactLabel: 'Boosts homonym disambiguation accuracy',
      affectedBrokersCount: Math.max(Math.round(exposedCount * 0.6), 5),
      canAutoFixImmediately: false,
      inputKind: 'relative_name',
      applyFix: (currentProfile, inputValues) => {
        const rel = toTitleCaseWords(inputValues?.relativeName || '');
        if (!rel) return currentProfile;
        return {
          ...currentProfile,
          relatives: Array.from(new Set([...(currentProfile.relatives || []).filter(Boolean), rel])),
        };
      },
    });
  }

  // Compute deterministic 0-100 Match Accuracy Score
  let penalties = 0;
  for (const item of discrepancies) {
    if (item.severity === 'high') penalties += 14;
    else if (item.severity === 'medium') penalties += 8;
    else penalties += 4;
  }
  const accuracyScore = Math.max(35, Math.min(100, 100 - penalties));
  const autoFixableCount = discrepancies.filter((d) => d.canAutoFixImmediately).length;

  return {
    accuracyScore,
    discrepancies,
    autoFixableCount,
    skippedRealEstateCount,
    skippedFinancialCount,
    skippedAssetB2BCount,
  };
}

/**
 * Applies all 1-click deterministic Auto-Fixes that do not require manual text entry.
 */
export function applyAllAutoQuickFixes(
  profile: UserProfile,
  results: ScanResult[],
  connectedEmail?: string | null
): { updatedProfile: UserProfile; appliedFixIds: string[]; summaries: string[] } {
  const audit = analyzeProfileDiscrepancies(profile, results, connectedEmail);
  let nextProfile: UserProfile = { ...profile };
  const appliedFixIds: string[] = [];
  const summaries: string[] = [];

  for (const item of audit.discrepancies) {
    if (!item.canAutoFixImmediately) continue;
    nextProfile = item.applyFix(nextProfile);
    appliedFixIds.push(item.id);
    summaries.push(item.title);
  }

  return {
    updatedProfile: nextProfile,
    appliedFixIds,
    summaries,
  };
}

/**
 * Merges a freshly computed broker scan with previous ScanResult items so that
 * existing removal statuses, Message-ID receipts, web-form confirmation codes,
 * live portal probe results, and custom-discovered broker entries are preserved.
 */
export function mergeRescanPreservingProgress(
  previousResults: ScanResult[],
  freshResults: ScanResult[]
): ScanResult[] {
  const prevByBrokerId = new Map<string, ScanResult>();
  for (const prev of previousResults) {
    prevByBrokerId.set(prev.brokerId, prev);
  }

  const freshBrokerIds = new Set<string>();
  const merged: ScanResult[] = freshResults.map((fresh) => {
    freshBrokerIds.add(fresh.brokerId);
    const prev = prevByBrokerId.get(fresh.brokerId);
    if (!prev) return fresh;

    const hasPriorAction =
      prev.removalStatus === 'submitted' ||
      prev.removalStatus === 'removed' ||
      Boolean(prev.optOutConfirmationCode) ||
      Boolean(prev.webFormSubmittedAtIso) ||
      Boolean(prev.submittedAtIso) ||
      Boolean(prev.verifiedRemovedAtIso) ||
      Boolean(prev.workflowJobId);

    const hasLiveProbe =
      prev.liveProbeStatus && prev.liveProbeStatus !== 'unprobed';

    if (!hasPriorAction && !hasLiveProbe) {
      return {
        ...fresh,
        id: prev.id,
      };
    }

    return {
      ...fresh,
      id: prev.id,
      // Keep exposed if user already submitted/removed so audit trail remains visible
      status: hasPriorAction ? 'exposed' : fresh.status,
      removalStatus: prev.removalStatus ?? fresh.removalStatus,
      optOutConfirmationCode: prev.optOutConfirmationCode,
      submissionDate: prev.submissionDate,
      submittedAtIso: prev.submittedAtIso,
      verifiedRemovedAtIso: prev.verifiedRemovedAtIso,
      escalationCount: prev.escalationCount,
      lastEscalatedAt: prev.lastEscalatedAt,
      lastEscalationReceipt: prev.lastEscalationReceipt,
      isRegression: prev.isRegression,
      brokerConfirmationTicket: prev.brokerConfirmationTicket,
      replyTriageSummary: prev.replyTriageSummary,
      webFormSubmittedAtIso: prev.webFormSubmittedAtIso,
      webFormConfirmationCode: prev.webFormConfirmationCode,
      submittedOptOutUrl: prev.submittedOptOutUrl,
      discoveredOptOutTitle: prev.discoveredOptOutTitle,
      workflowJobId: prev.workflowJobId,
      workflowState: prev.workflowState,
      internalSubmissionId: prev.internalSubmissionId,
      submissionEvidenceHash: prev.submissionEvidenceHash,
      brokerConfirmedReceipt: prev.brokerConfirmedReceipt,
      verificationSource: hasLiveProbe ? prev.verificationSource : fresh.verificationSource,
      liveProbeStatus: hasLiveProbe ? prev.liveProbeStatus : fresh.liveProbeStatus,
      liveProbeCheckedAtIso: prev.liveProbeCheckedAtIso,
      liveProbeSummary: prev.liveProbeSummary,
    };
  });

  // Preserve any custom/directory/webform broker results not in standard freshResults
  for (const prev of previousResults) {
    if (!freshBrokerIds.has(prev.brokerId)) {
      merged.push(prev);
    }
  }

  return merged;
}
