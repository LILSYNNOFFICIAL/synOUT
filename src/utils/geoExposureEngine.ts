import { DataBroker, ScanResult, UserProfile } from '../types';
import {
  US_STATE_BY_CODE,
  US_STATE_CODE_BY_NAME,
  US_STATE_METADATA,
  UsStateMetadata,
} from '../data/usStatesGeoJson';
import { findBrokerById } from '../services/emailConnectionStore';
import { getBrokerTargetState } from './scanEngine';

export interface StateBrokerAttribution {
  brokerId: string;
  brokerName: string;
  brokerDomain: string;
  risk: DataBroker['risk'];
  recordsCount: number;
  removalStatus: 'found' | 'submitted' | 'removed' | 'failed';
  connectionReasons: string[];
}

export interface StateExposureDatum {
  meta: UsStateMetadata;
  exposedBrokerCount: number;
  exposedRecordsCount: number;
  activePendingCount: number;
  submittedCount: number;
  removedCount: number;
  criticalRiskCount: number;
  connectionSources: string[];
  brokers: StateBrokerAttribution[];
}

export interface GeographicExposureSummary {
  states: StateExposureDatum[];
  statesByCode: Record<string, StateExposureDatum>;
  affectedStatesCount: number;
  totalAttributedRecords: number;
  topStates: StateExposureDatum[];
  maxStateRecords: number;
  maxStateBrokers: number;
}

/**
 * Extracts normalized 2-letter US state codes (50 states + DC) from free-form
 * location strings such as "Sacramento, CA 95814", "Austin, TX", or "California".
 */
export function extractUsStateCodesFromLocation(raw: string): string[] {
  if (!raw || typeof raw !== 'string') return [];
  const cleaned = raw.trim();
  if (!cleaned) return [];

  const found = new Set<string>();

  // 1. Direct exact 2-letter match
  const upper = cleaned.toUpperCase();
  if (US_STATE_BY_CODE[upper]) {
    found.add(upper);
    return Array.from(found);
  }

  // 2. Comma/space-separated 2-letter state abbreviation (e.g. "Sacramento, CA", "Austin, TX 78701")
  const abbrRegex = /(?:,\s*|\b)([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?|\s*$|\s*[·|/)])/g;
  let match: RegExpExecArray | null = null;
  while ((match = abbrRegex.exec(cleaned)) !== null) {
    const code = match[1].toUpperCase();
    if (US_STATE_BY_CODE[code]) {
      found.add(code);
    }
  }

  // 3. Full state name match (longest names checked first so "West Virginia" matches before "Virginia")
  const lower = cleaned.toLowerCase();
  const sortedNames = Object.keys(US_STATE_CODE_BY_NAME).sort((a, b) => b.length - a.length);
  for (const stateName of sortedNames) {
    const nameRegex = new RegExp(`\\b${stateName.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (nameRegex.test(lower)) {
      found.add(US_STATE_CODE_BY_NAME[stateName]);
    }
  }

  return Array.from(found);
}

/**
 * Determines all US states connected to a single `ScanResult` and why each state is implicated.
 */
export function resolveStatesForScanResult(
  result: ScanResult,
  profile: UserProfile | null
): Map<string, Set<string>> {
  const stateReasons = new Map<string, Set<string>>();
  const addReason = (code: string, reason: string) => {
    const norm = code.trim().toUpperCase();
    if (!US_STATE_BY_CODE[norm]) return;
    if (!stateReasons.has(norm)) {
      stateReasons.set(norm, new Set<string>());
    }
    stateReasons.get(norm)!.add(reason);
  };

  const currentState = profile?.currentState?.trim().toUpperCase() || '';
  const priorStates = new Set<string>();
  for (const prevLoc of profile?.previousLocations || []) {
    for (const c of extractUsStateCodesFromLocation(prevLoc)) {
      priorStates.add(c);
    }
  }

  const broker = findBrokerById(result.brokerId);

  // 1. Listing locations reported on the broker record
  for (const loc of result.mockListingData?.locations || []) {
    for (const code of extractUsStateCodesFromLocation(loc)) {
      if (code === currentState) {
        addReason(code, 'Current Residence');
      } else if (priorStates.has(code)) {
        addReason(code, 'Prior Address History');
      } else {
        addReason(code, 'Indexed Broker Location');
      }
    }
  }

  // 2. Cross-state evidence strings on the listing
  const rawCross = result.mockListingData?.crossStateEvidence;
  const crossEvidenceItems =
    typeof rawCross === 'string'
      ? rawCross.split(/[;|]/).map((s) => s.trim()).filter(Boolean)
      : Array.isArray(rawCross)
      ? rawCross
      : [];
  for (const ev of crossEvidenceItems) {
    for (const code of extractUsStateCodesFromLocation(ev)) {
      addReason(code, priorStates.has(code) ? 'Prior Address History' : 'Cross-State Trail');
    }
  }

  // 3. State-specific public record / registry brokers
  if (broker) {
    const targetState = getBrokerTargetState(broker);
    if (targetState && US_STATE_BY_CODE[targetState]) {
      addReason(targetState, 'State Public Record Portal');
    }

    if (
      broker.category === 'Vehicle & Asset Registry' &&
      profile?.vehicleInfo?.state &&
      US_STATE_BY_CODE[profile.vehicleInfo.state.toUpperCase()]
    ) {
      addReason(profile.vehicleInfo.state.toUpperCase(), 'Vehicle Registration');
    }

    if (
      profile?.driversLicense?.state &&
      US_STATE_BY_CODE[profile.driversLicense.state.toUpperCase()] &&
      (broker.category === 'Vehicle & Asset Registry' ||
        broker.category === 'Arrest & Court Records')
    ) {
      addReason(profile.driversLicense.state.toUpperCase(), 'Driver License Jurisdiction');
    }
  }

  // 4. Fallback to user's current state if a national broker listing didn't specify a state code
  if (stateReasons.size === 0 && currentState && US_STATE_BY_CODE[currentState]) {
    addReason(currentState, 'Current Residence');
  }

  return stateReasons;
}

/**
 * Predicate used by `ExposureReport` to filter broker cards when a state is clicked on the D3 map.
 */
export function resultMatchesUsState(
  result: ScanResult,
  profile: UserProfile | null,
  stateCode: string | null
): boolean {
  if (!stateCode) return true;
  const norm = stateCode.trim().toUpperCase();
  const statesMap = resolveStatesForScanResult(result, profile);
  return statesMap.has(norm);
}

/**
 * Aggregates exposed records and broker counts across all 50 US states + DC for D3 rendering.
 */
export function computeGeographicExposureDistribution(
  results: ScanResult[],
  profile: UserProfile | null
): GeographicExposureSummary {
  const accum = new Map<
    string,
    {
      meta: UsStateMetadata;
      brokers: StateBrokerAttribution[];
      exposedRecordsCount: number;
      activePendingCount: number;
      submittedCount: number;
      removedCount: number;
      criticalRiskCount: number;
      sourcesSet: Set<string>;
    }
  >();

  for (const meta of US_STATE_METADATA) {
    accum.set(meta.code, {
      meta,
      brokers: [],
      exposedRecordsCount: 0,
      activePendingCount: 0,
      submittedCount: 0,
      removedCount: 0,
      criticalRiskCount: 0,
      sourcesSet: new Set<string>(),
    });
  }

  const exposedResults = results.filter((r) => r.status === 'exposed');

  for (const res of exposedResults) {
    const broker = findBrokerById(res.brokerId);
    const brokerName = broker?.name || res.brokerId;
    const brokerDomain = broker?.domain || `${res.brokerId}.com`;
    const risk: DataBroker['risk'] = broker?.risk || res.mockListingData?.riskLevel || 'Medium';
    const recordsCount = Math.max(1, res.mockListingData?.recordsCount || 1);
    const removalStatus = res.removalStatus || 'found';

    const stateReasons = resolveStatesForScanResult(res, profile);
    for (const [code, reasons] of stateReasons.entries()) {
      const bucket = accum.get(code);
      if (!bucket) continue;

      const reasonArr = Array.from(reasons);
      for (const r of reasonArr) {
        bucket.sourcesSet.add(r);
      }

      bucket.brokers.push({
        brokerId: res.brokerId,
        brokerName,
        brokerDomain,
        risk,
        recordsCount,
        removalStatus,
        connectionReasons: reasonArr,
      });

      bucket.exposedRecordsCount += recordsCount;
      if (removalStatus === 'removed') {
        bucket.removedCount += 1;
      } else if (
        removalStatus === 'submitted' ||
        res.workflowState === 'awaiting_email_verification'
      ) {
        bucket.submittedCount += 1;
      } else {
        bucket.activePendingCount += 1;
      }
      if (risk === 'Critical') {
        bucket.criticalRiskCount += 1;
      }
    }
  }

  const states: StateExposureDatum[] = US_STATE_METADATA.map((meta) => {
    const b = accum.get(meta.code)!;
    const sortedBrokers = [...b.brokers].sort((x, y) => {
      const rank = { Critical: 3, High: 2, Medium: 1 };
      return rank[y.risk] - rank[x.risk] || y.recordsCount - x.recordsCount;
    });
    return {
      meta,
      exposedBrokerCount: sortedBrokers.length,
      exposedRecordsCount: b.exposedRecordsCount,
      activePendingCount: b.activePendingCount,
      submittedCount: b.submittedCount,
      removedCount: b.removedCount,
      criticalRiskCount: b.criticalRiskCount,
      connectionSources: Array.from(b.sourcesSet),
      brokers: sortedBrokers,
    };
  });

  const statesByCode: Record<string, StateExposureDatum> = Object.fromEntries(
    states.map((s) => [s.meta.code, s])
  );

  const affectedStates = states
    .filter((s) => s.exposedRecordsCount > 0)
    .sort(
      (a, b) =>
        b.exposedRecordsCount - a.exposedRecordsCount ||
        b.exposedBrokerCount - a.exposedBrokerCount
    );

  const totalAttributedRecords = affectedStates.reduce(
    (sum, s) => sum + s.exposedRecordsCount,
    0
  );
  const maxStateRecords = affectedStates.reduce(
    (max, s) => Math.max(max, s.exposedRecordsCount),
    0
  );
  const maxStateBrokers = affectedStates.reduce(
    (max, s) => Math.max(max, s.exposedBrokerCount),
    0
  );

  return {
    states,
    statesByCode,
    affectedStatesCount: affectedStates.length,
    totalAttributedRecords,
    topStates: affectedStates.slice(0, 8),
    maxStateRecords,
    maxStateBrokers,
  };
}
