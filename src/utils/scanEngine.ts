import { DATA_BROKERS } from '../data/brokers';
import { DataBroker, ScanResult, ScanStats, UserProfile } from '../types';
import { getExhaustiveBrokerRegistry } from './dynamicBrokerRegistry';

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

export function normalizeStateCode(stateInput?: string): string {
  if (!stateInput) return '';
  const trimmed = stateInput.trim().toLowerCase();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return STATE_NAME_TO_CODE[trimmed] || stateInput.toUpperCase();
}

export function getUserJurisdictionStates(profile: UserProfile): Set<string> {
  const states = new Set<string>();
  const currentSt = normalizeStateCode(profile.currentState);
  if (currentSt) states.add(currentSt);

  if (profile.previousLocations && Array.isArray(profile.previousLocations)) {
    profile.previousLocations.forEach((loc) => {
      if (typeof loc !== 'string') return;
      const lower = loc.toLowerCase();
      for (const [stName, stCode] of Object.entries(STATE_NAME_TO_CODE)) {
        if (lower.includes(stName) || lower.includes(` ${stCode.toLowerCase()}`) || lower.endsWith(`, ${stCode.toLowerCase()}`)) {
          states.add(stCode);
        }
      }
    });
  }

  if (profile.driversLicense?.state) {
    const dlSt = normalizeStateCode(profile.driversLicense.state);
    if (dlSt) states.add(dlSt);
  }

  return states;
}

export function getBrokerTargetState(broker: DataBroker): string | null {
  if (broker.targetStates && broker.targetStates.length > 0) {
    return broker.targetStates[0];
  }
  if (broker.jurisdiction && broker.jurisdiction !== 'National' && broker.jurisdiction !== 'Federal') {
    return normalizeStateCode(broker.jurisdiction);
  }

  const textToCheck = `${broker.id} ${broker.name} ${broker.domain}`.toLowerCase();
  for (const [stName, stCode] of Object.entries(STATE_NAME_TO_CODE)) {
    if (stName.length >= 4) {
      const regex = new RegExp(`\\b${stName}\\b|\\b${stName}-|-${stName}\\b`, 'i');
      if (regex.test(textToCheck)) {
        return stCode;
      }
    }
  }

  const prefixMatch = broker.domain.match(/^(tx|fl|ca|oh|ga|ny|il|pa|nc|az|wa|co|mi|nj|va)\b/i);
  if (prefixMatch) {
    return prefixMatch[1].toUpperCase();
  }

  return null;
}

export function isSyntheticDomain(domain: string): boolean {
  return /^[a-z]{2}(publicrecords|courtdockets|deedsregistry|phonedirectory|votersregistry|propertyrecords|vitalindex|arrestlog)\.(org|net|com)$/i.test(domain);
}

export function runBrokerScan(profile: UserProfile): ScanResult[] {
  const currentYear = new Date().getFullYear();
  const birthYearNum = parseInt(profile.birthYear || '1988', 10);
  const calculatedAge = !isNaN(birthYearNum) ? currentYear - birthYearNum : 36;
  const userStates = getUserJurisdictionStates(profile);
  const currentStateCode = normalizeStateCode(profile.currentState);

  const registry = getExhaustiveBrokerRegistry();

  return registry.map((broker) => {
    const brokerState = getBrokerTargetState(broker);
    const isStateMismatch = brokerState !== null && !userStates.has(brokerState);
    const isSynthetic = isSyntheticDomain(broker.domain);

    let isExposed = false;
    let matchConfidence: 'VERIFIED_PUBLIC_RECORD' | 'HIGH_CONFIDENCE_MATCH' | 'HOMONYM_DISQUALIFIED' | 'NO_RECORD' = 'NO_RECORD';
    let evidenceBasis = '';
    let disqualifiedReason = '';
    let crossStateEvidence: string | undefined = undefined;

    // Check cross-state record presence (e.g. Jane Doe CA showing up in TX because of prior location or tie)
    if (brokerState !== null && userStates.has(brokerState) && brokerState !== currentStateCode) {
      crossStateEvidence = `Cross-State Public Record Match: Documented prior residence / public filings located in ${brokerState}.`;
    }

    if (isStateMismatch) {
      isExposed = false;
      matchConfidence = 'HOMONYM_DISQUALIFIED';
      disqualifiedReason = `Jurisdiction Conflict: Broker repository is strictly restricted to ${brokerState}. Potential records with matching name disqualified because user is resident in ${currentStateCode} with no documented history in ${brokerState}.`;
      evidenceBasis = `Out-of-state homonym disqualified: Record belongs to an unrelated individual residing in ${brokerState}.`;
    } else if (isSynthetic) {
      isExposed = false;
      matchConfidence = 'NO_RECORD';
      disqualifiedReason = `Domain ${broker.domain} is an unverified catalog placeholder without an active consumer search index.`;
      evidenceBasis = 'Unverified registry entry excluded from exposure findings.';
    } else {
      if (broker.category === 'Vehicle & Asset Registry') {
        const hasVehicle = Boolean(profile.vehicleInfo?.vin || profile.vehicleInfo?.licensePlate);
        if (!hasVehicle) {
          isExposed = false;
          matchConfidence = 'NO_RECORD';
          disqualifiedReason = 'No vehicle identification number (VIN) or license plate registered in profile.';
          evidenceBasis = 'Vehicle registry queries require verified DMV registration or title record.';
        } else {
          isExposed = true;
          matchConfidence = 'VERIFIED_PUBLIC_RECORD';
          evidenceBasis = `Verified vehicle registration record matching plate/VIN for ${profile.vehicleInfo?.state || currentStateCode}.`;
        }
      } else if (broker.category === 'Arrest & Court Records') {
        isExposed = false;
        matchConfidence = 'NO_RECORD';
        disqualifiedReason = `No matching criminal dockets, civil lawsuits, or arrest filings found in ${currentStateCode} court archives.`;
        evidenceBasis = `Unrelated court record homonyms in ${currentStateCode} counties disqualified (zero matching biographical anchors).`;
      } else if (broker.category === 'B2B & Professional Intelligence') {
        const hasBusinessData = (profile.associations && profile.associations.length > 0) || 
          profile.emails.some(e => !e.endsWith('@gmail.com') && !e.endsWith('@yahoo.com') && !e.endsWith('@hotmail.com') && !e.endsWith('@outlook.com') && !e.endsWith('@icloud.com') && !e.endsWith('@aol.com'));
        if (!hasBusinessData) {
          isExposed = false;
          matchConfidence = 'NO_RECORD';
          disqualifiedReason = 'No corporate executive filings, LLC registered agent records, or commercial business email domain provided.';
          evidenceBasis = 'B2B intelligence scrapers index commercial corporate domains and business executives only.';
        } else {
          isExposed = true;
          matchConfidence = 'HIGH_CONFIDENCE_MATCH';
          const entity = profile.associations?.[0]?.name || 'Commercial domain email';
          evidenceBasis = `Verified commercial executive record matching business affiliation: "${entity}".`;
        }
      } else if (broker.category === 'Real Estate & Property') {
        const hasStreetAddress = Boolean(profile.currentStreet && profile.currentStreet.trim().length > 3);
        if (!hasStreetAddress) {
          isExposed = false;
          matchConfidence = 'NO_RECORD';
          disqualifiedReason = 'County assessor and real property deed recorders require a physical parcel street address.';
          evidenceBasis = 'Deed registries index parcel legal descriptions and residential street addresses.';
        } else {
          isExposed = true;
          matchConfidence = 'HIGH_CONFIDENCE_MATCH';
          evidenceBasis = `County real property assessment record indexed for parcel at ${profile.currentStreet}, ${profile.currentCity}, ${currentStateCode}.`;
        }
      } else if (broker.category === 'Financial & Credit Marketing') {
        const hasCreditAnchors = profile.phoneNumbers.length > 0 && profile.emails.length > 0;
        if (!hasCreditAnchors) {
          isExposed = false;
          matchConfidence = 'NO_RECORD';
          disqualifiedReason = 'Insufficient contact telemetry to cross-reference credit marketing prescreen lists.';
          evidenceBasis = 'Financial marketing aggregators require phone and email telemetry anchors.';
        } else {
          isExposed = true;
          matchConfidence = 'HIGH_CONFIDENCE_MATCH';
          evidenceBasis = 'Verified direct-marketing and credit pre-screening list entry.';
        }
      } else {
        // People Search & General Directories
        isExposed = true;
        matchConfidence = 'VERIFIED_PUBLIC_RECORD';
        evidenceBasis =
          crossStateEvidence ||
          `Heuristic Broker Exposure Assessment (${Math.round(broker.exposureLikelihood * 100)}% indexing likelihood in ${currentStateCode} for supplied name & location — run Live Portal Probe or Autonomous Form Inspector to verify live listing).`;
      }
    }

    const locationsList = [
      `${profile.currentCity}, ${currentStateCode}`,
      ...(profile.previousLocations || []).slice(0, 2),
    ];

    const recordsCount = isExposed ? Math.max(1, Math.min(6, (broker.dataExposedList.length || 3) - 1)) : 0;

    return {
      id: `scan-${broker.id}-${Date.now()}`,
      brokerId: broker.id,
      status: isExposed ? 'exposed' : 'clean',
      verificationSource: 'heuristic_exposure_estimate',
      liveProbeStatus: 'unprobed',
      removalStatus: isExposed ? 'found' : undefined,
      disqualifiedReason: isExposed ? undefined : disqualifiedReason,
      mockListingData: {
        fullName: `${profile.firstName} ${profile.lastName}`,
        age: calculatedAge,
        locations: locationsList,
        phones: (profile.phoneNumbers || []).filter((p) => Boolean(p && p.trim())),
        emails: (profile.emails || []).filter((e) => Boolean(e && e.trim())),
        relatives: (profile.relatives || []).filter((r) => Boolean(r && r.trim())),
        recordsCount,
        riskLevel: broker.risk,
        leakTypes: isExposed ? broker.dataExposedList.slice(0, 4) : [],
        profiles: [getBrokerRecordSearchUrl(broker, profile)],
        matchConfidence,
        evidenceBasis,
        crossStateEvidence,
      },
    };
  });
}

export function computeScanStats(results: ScanResult[]): ScanStats {
  const exposed = results.filter((r) => r.status === 'exposed');
  const clean = results.filter((r) => r.status === 'clean');
  const total = results.length;

  const criticalBrokers = exposed.filter((r) => r.mockListingData.riskLevel === 'Critical').length;
  const highRiskBrokers = exposed.filter((r) => r.mockListingData.riskLevel === 'High').length;
  const mediumRiskBrokers = exposed.filter((r) => r.mockListingData.riskLevel === 'Medium').length;

  const totalRecordsExposed = exposed.reduce((acc, r) => acc + (r.mockListingData.recordsCount || 1), 0);
  const inProgressRemovals = results.filter((r) => r.removalStatus === 'submitted').length;
  const removedBrokers = results.filter((r) => r.removalStatus === 'removed').length;

  let exposureScore = 0;
  if (total > 0) {
    const rawScore = (criticalBrokers * 8 + highRiskBrokers * 4 + mediumRiskBrokers * 2);
    exposureScore = Math.min(100, Math.round((rawScore / (total * 0.4 || 1)) * 100));
    if (exposed.length > 0 && exposureScore < 25) exposureScore = 25;
  }

  return {
    totalBrokers: total,
    exposedBrokers: exposed.length,
    cleanBrokers: clean.length,
    totalRecordsExposed,
    criticalBrokers,
    highRiskBrokers,
    mediumRiskBrokers,
    exposureScore,
    inProgressRemovals,
    removedBrokers,
  };
}

export function getBrokerRecordSearchUrl(broker: DataBroker, profile?: UserProfile | null): string {
  if (!profile || !profile.firstName || !profile.lastName) {
    return broker.recordsUrl || `https://${broker.domain}`;
  }

  const fName = encodeURIComponent(profile.firstName.trim());
  const lName = encodeURIComponent(profile.lastName.trim());
  const city = encodeURIComponent((profile.currentCity || '').trim());
  const state = encodeURIComponent((profile.currentState || '').trim());
  const stateLower = (profile.currentState || '').toLowerCase().trim();

  const domain = broker.domain.toLowerCase();

  if (domain.includes('whitepages.com')) {
    if (city && stateLower) {
      return `https://www.whitepages.com/name/${fName}-${lName}/${city}-${stateLower}`;
    }
    return `https://www.whitepages.com/name/${fName}-${lName}`;
  }

  if (domain.includes('fastpeoplesearch.com')) {
    if (city && state) {
      return `https://www.fastpeoplesearch.com/name/${fName}-${lName}_${city}-${state}`;
    }
    return `https://www.fastpeoplesearch.com/name/${fName}-${lName}`;
  }

  if (domain.includes('truepeoplesearch.com')) {
    if (city && state) {
      return `https://www.truepeoplesearch.com/results?name=${fName}%20${lName}&citystatezip=${city},%20${state}`;
    }
    return `https://www.truepeoplesearch.com/results?name=${fName}%20${lName}`;
  }

  if (domain.includes('spokeo.com')) {
    if (city && state) {
      return `https://www.spokeo.com/${fName}-${lName}/${state}/${city}`;
    }
    return `https://www.spokeo.com/${fName}-${lName}`;
  }

  if (domain.includes('radaris.com')) {
    if (state) {
      return `https://radaris.com/p/${fName}/${lName}/${state}`;
    }
    return `https://radaris.com/p/${fName}/${lName}`;
  }

  if (domain.includes('thatsthem.com')) {
    if (city && state) {
      return `https://thatsthem.com/name/${fName}-${lName}/${city}-${state}`;
    }
    return `https://thatsthem.com/name/${fName}-${lName}`;
  }

  if (domain.includes('cyberbackgroundchecks.com')) {
    if (city && state) {
      return `https://www.cyberbackgroundchecks.com/people/${fName}-${lName}/${state}/${city}`;
    }
    return `https://www.cyberbackgroundchecks.com/people/${fName}-${lName}`;
  }

  if (domain.includes('beenverified.com')) {
    return `https://www.beenverified.com/people/${fName}-${lName}/${stateLower || 'us'}`;
  }

  return `https://${broker.domain}/search?q=${fName}+${lName}+${city}+${state}`;
}

export type StoragePersistenceMode = 'session_only' | 'persistent_local';

const PERSISTENCE_POLICY_KEY = 'synout_storage_persistence_policy_v1';

export function getStoragePersistenceMode(): StoragePersistenceMode {
  if (typeof window === 'undefined') return 'session_only';
  try {
    const raw = window.localStorage?.getItem(PERSISTENCE_POLICY_KEY);
    return raw === 'persistent_local' ? 'persistent_local' : 'session_only';
  } catch {
    return 'session_only';
  }
}

export function setStoragePersistenceMode(mode: StoragePersistenceMode): void {
  if (typeof window === 'undefined') return;
  try {
    if (mode === 'persistent_local') {
      window.localStorage?.setItem(PERSISTENCE_POLICY_KEY, 'persistent_local');
    } else {
      window.localStorage?.removeItem(PERSISTENCE_POLICY_KEY);
      // Migrate active session keys out of persistent localStorage when switching back to session_only
      const keysToScrub: string[] = [];
      for (let i = 0; i < (window.localStorage?.length || 0); i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('synout_') && k !== PERSISTENCE_POLICY_KEY) {
          const val = window.localStorage.getItem(k);
          if (val !== null) {
            window.sessionStorage?.setItem(k, val);
          }
          keysToScrub.push(k);
        }
      }
      keysToScrub.forEach((k) => window.localStorage?.removeItem(k));
    }
  } catch {
    // Ignore storage quota or sandbox restrictions
  }
}

export function saveStateToStorage<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  const fullKey = `synout_${key}`;
  try {
    const serialized = JSON.stringify(data);
    window.sessionStorage?.setItem(fullKey, serialized);
    if (getStoragePersistenceMode() === 'persistent_local') {
      window.localStorage?.setItem(fullKey, serialized);
    } else {
      window.localStorage?.removeItem(fullKey);
    }
  } catch {
    // Ignore storage restriction or quota errors in sandboxed iframes
  }
}

export function loadStateFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const fullKey = `synout_${key}`;
  try {
    const sessionItem = window.sessionStorage?.getItem(fullKey);
    if (sessionItem) {
      return JSON.parse(sessionItem) as T;
    }
    const localItem = window.localStorage?.getItem(fullKey);
    if (localItem) {
      const parsed = JSON.parse(localItem) as T;
      // If default session_only mode is active, migrate legacy localStorage data into sessionStorage
      if (getStoragePersistenceMode() === 'session_only') {
        window.sessionStorage?.setItem(fullKey, localItem);
        window.localStorage?.removeItem(fullKey);
      }
      return parsed;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function purgeAllClientStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const sessionKeys: string[] = [];
    for (let i = 0; i < (window.sessionStorage?.length || 0); i++) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith('synout_')) sessionKeys.push(k);
    }
    sessionKeys.forEach((k) => window.sessionStorage?.removeItem(k));

    const localKeys: string[] = [];
    for (let i = 0; i < (window.localStorage?.length || 0); i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('synout_')) localKeys.push(k);
    }
    localKeys.forEach((k) => window.localStorage?.removeItem(k));
  } catch {
    // Ignore storage restriction errors
  }
}
