import { DataBroker, RiskLevel, ScanResult } from '../types';
import { getExhaustiveBrokerRegistry } from './dynamicBrokerRegistry';

export type SupplyChainTier = 'clearinghouse' | 'parent_network' | 'downstream_broker';

export type DataFeedVector =
  | 'credit_header'
  | 'property_deed'
  | 'telecom_cnam'
  | 'shared_network_db'
  | 'commercial_resale'
  | 'court_voter_index';

export type NodeExposureState = 'exposed' | 'submitted' | 'removed' | 'clean';

export interface SupplyChainNode {
  id: string;
  label: string;
  domain: string;
  tier: SupplyChainTier;
  tierIndex: 0 | 1 | 2;
  brokerId?: string;
  optOutUrl: string;
  risk: RiskLevel;
  exposureState: NodeExposureState;
  recordsCount: number;
  downstreamBrokerIds: string[];
  downstreamExposedCount: number;
  keystonePriorityScore: number;
  feedDescription: string;
}

export interface SupplyChainLink {
  id: string;
  sourceId: string;
  targetId: string;
  feedType: DataFeedVector;
  feedLabel: string;
  activeExposureFlow: boolean;
}

export interface KeystoneSuppressionStep {
  order: number;
  nodeId: string;
  brokerId?: string;
  name: string;
  domain: string;
  tier: SupplyChainTier;
  exposureState: NodeExposureState;
  downstreamExposedCount: number;
  totalDownstreamCount: number;
  keystonePriorityScore: number;
  recommendedAction: string;
  optOutUrl: string;
}

export interface SupplyChainGraphReport {
  nodes: SupplyChainNode[];
  links: SupplyChainLink[];
  suppressionPlan: KeystoneSuppressionStep[];
  stats: {
    totalNodes: number;
    totalLinks: number;
    exposedUpstreamCount: number;
    exposedDownstreamCount: number;
    activeSyndicationFlows: number;
    topKeystoneName: string | null;
  };
}

interface UpstreamFeederSpec {
  id: string;
  label: string;
  domain: string;
  tier: 'clearinghouse' | 'parent_network';
  brokerId?: string;
  optOutUrl: string;
  risk: RiskLevel;
  feedType: DataFeedVector;
  feedLabel: string;
  feedDescription: string;
  upstreamParentIds?: string[];
  matchBrokerPredicate: (broker: DataBroker) => boolean;
}

const UPSTREAM_FEEDERS: UpstreamFeederSpec[] = [
  {
    id: 'feeder-lexisnexis',
    label: 'LexisNexis Accurint',
    domain: 'lexisnexis.com',
    tier: 'clearinghouse',
    brokerId: 'lexisnexis',
    optOutUrl: 'https://optout.lexisnexis.com/',
    risk: 'Critical',
    feedType: 'court_voter_index',
    feedLabel: 'Court, Lien & Public Record Header Feed',
    feedDescription:
      'Wholesale public-record & skip-tracing aggregator supplying address history, court filings, and relative graphs to commercial directories.',
    matchBrokerPredicate: (b) =>
      b.category === 'Arrest & Court Records' ||
      ['beenverified', 'intelius', 'truthfinder', 'instantcheckmate', 'spokeo', 'radaris', 'infotracer'].includes(b.id),
  },
  {
    id: 'feeder-acxiom',
    label: 'Acxiom InfoBase',
    domain: 'acxiom.com',
    tier: 'clearinghouse',
    brokerId: 'acxiom',
    optOutUrl: 'https://isapps.acxiom.com/optout/optout.aspx',
    risk: 'Critical',
    feedType: 'commercial_resale',
    feedLabel: 'Household & Demographic Syndication',
    feedDescription:
      'Master consumer marketing clearinghouse licensing demographic, household, and address change records to downstream people-search portals.',
    matchBrokerPredicate: (b) =>
      b.category === 'Marketing & Advertising' ||
      ['spokeo', 'whitepages', 'mylife', 'peoplefinders', 'fastpeoplesearch', 'thatsthem'].includes(b.id),
  },
  {
    id: 'feeder-corelogic',
    label: 'CoreLogic Property & Tax',
    domain: 'corelogic.com',
    tier: 'clearinghouse',
    brokerId: 'corelogic',
    optOutUrl: 'https://www.corelogic.com/privacy-center/',
    risk: 'Critical',
    feedType: 'property_deed',
    feedLabel: 'County Assessor, Deed & Mortgage Feed',
    feedDescription:
      'Aggregates county recorder deeds, property tax rolls, and residential ownership chains syndicated into real-estate and address lookup sites.',
    matchBrokerPredicate: (b) =>
      b.category === 'Real Estate & Property' ||
      ['neighborwho', 'clustrmaps', 'whitepages', 'nuwber', 'cyberbackgroundchecks', 'officialusa'].includes(b.id),
  },
  {
    id: 'feeder-experian-telecom',
    label: 'Credit Header & CNAM Exchange',
    domain: 'experian.com',
    tier: 'clearinghouse',
    brokerId: 'experian-marketing',
    optOutUrl: 'https://www.experian.com/privacy/opt-out-targeted-advertising',
    risk: 'High',
    feedType: 'telecom_cnam',
    feedLabel: 'Subscriber CNAM & Non-FCRA Header Feed',
    feedDescription:
      'Supplies subscriber phone-to-address bindings and marketing segments consumed by reverse-phone and caller-ID directories.',
    matchBrokerPredicate: (b) =>
      b.category === 'Financial & Credit Marketing' ||
      ['truepeoplesearch', 'usphonebook', 'fastpeoplesearch', 'cocofinder', 'spytox', 'zabasearch'].includes(b.id),
  },
  {
    id: 'network-peopleconnect',
    label: 'PeopleConnect Holdings',
    domain: 'peopleconnect.us',
    tier: 'parent_network',
    brokerId: 'intelius',
    optOutUrl: 'https://suppression.peopleconnect.us/login',
    risk: 'Critical',
    feedType: 'shared_network_db',
    feedLabel: 'PeopleConnect Unified Suppression Graph',
    feedDescription:
      'Parent operator of Intelius, TruthFinder, Instant CheckMate, USPhoneBook, and Addresses.com sharing a unified identity database.',
    upstreamParentIds: ['feeder-lexisnexis', 'feeder-acxiom', 'feeder-experian-telecom'],
    matchBrokerPredicate: (b) =>
      Boolean(b.parentEntity && /peopleconnect|intelius/i.test(b.parentEntity)) ||
      ['intelius', 'truthfinder', 'instantcheckmate', 'usphonebook', 'addresses-com', 'zabasearch'].includes(b.id),
  },
  {
    id: 'network-beenverified',
    label: 'BeenVerified Network',
    domain: 'beenverified.com',
    tier: 'parent_network',
    brokerId: 'beenverified',
    optOutUrl: 'https://www.beenverified.com/app/optout/search',
    risk: 'Critical',
    feedType: 'shared_network_db',
    feedLabel: 'BeenVerified Affiliate Directory Mesh',
    feedDescription:
      'Operates BeenVerified, NeighborWho, NumberGuru, and Ownerly on a shared consumer record index.',
    upstreamParentIds: ['feeder-lexisnexis', 'feeder-corelogic'],
    matchBrokerPredicate: (b) =>
      Boolean(b.parentEntity && /beenverified/i.test(b.parentEntity)) ||
      ['beenverified', 'neighborwho', 'numberguru', 'ownerly'].includes(b.id),
  },
  {
    id: 'network-peoplefinders',
    label: 'PeopleFinders Network',
    domain: 'peoplefinders.com',
    tier: 'parent_network',
    brokerId: 'peoplefinders',
    optOutUrl: 'https://www.peoplefinders.com/opt-out',
    risk: 'High',
    feedType: 'shared_network_db',
    feedLabel: 'PeopleFinders & PublicRecordsNow Syndication',
    feedDescription:
      'Supplies identity profiles to PeopleFinders, PublicRecordsNow, SmartBackgroundChecks, and partner lookup mirrors.',
    upstreamParentIds: ['feeder-acxiom', 'feeder-corelogic'],
    matchBrokerPredicate: (b) =>
      Boolean(b.parentEntity && /peoplefinders/i.test(b.parentEntity)) ||
      ['peoplefinders', 'publicrecordsnow', 'smartbackgroundchecks', 'veripages', 'checkpeople'].includes(b.id),
  },
  {
    id: 'network-b2b-enrichment',
    label: 'B2B Lead & Executive Enrichment',
    domain: 'zoominfo.com',
    tier: 'parent_network',
    brokerId: 'zoominfo',
    optOutUrl: 'https://privacyrequest.zoominfo.com/remove',
    risk: 'High',
    feedType: 'commercial_resale',
    feedLabel: 'Corporate Contact & Direct-Dial Graph',
    feedDescription:
      'Scrapes and cross-licenses work emails, direct mobile numbers, and corporate titles across sales-intelligence platforms.',
    upstreamParentIds: ['feeder-acxiom'],
    matchBrokerPredicate: (b) =>
      b.category === 'B2B & Professional Intelligence' ||
      b.category === 'Recruitment & Professional' ||
      ['zoominfo', 'apollo', 'lusha', 'rocketreach', 'peekyou', 'pipl'].includes(b.id),
  },
];

function resolveStateFromScan(
  brokerId: string | undefined,
  resultByBrokerId: Map<string, ScanResult>
): { state: NodeExposureState; recordsCount: number } {
  if (!brokerId) return { state: 'clean', recordsCount: 0 };
  const match = resultByBrokerId.get(brokerId);
  if (!match) return { state: 'clean', recordsCount: 0 };
  if (match.removalStatus === 'removed') {
    return { state: 'removed', recordsCount: match.mockListingData?.recordsCount || 0 };
  }
  if (match.removalStatus === 'submitted') {
    return { state: 'submitted', recordsCount: match.mockListingData?.recordsCount || 0 };
  }
  if (match.status === 'exposed') {
    return { state: 'exposed', recordsCount: Math.max(1, match.mockListingData?.recordsCount || 1) };
  }
  return { state: 'clean', recordsCount: 0 };
}

export function buildSupplyChainGraph(scanResults: ScanResult[]): SupplyChainGraphReport {
  const allBrokers = getExhaustiveBrokerRegistry();
  const brokerById = new Map<string, DataBroker>(allBrokers.map((b) => [b.id, b]));
  const resultByBrokerId = new Map<string, ScanResult>(scanResults.map((r) => [r.brokerId, r]));

  const feederBrokerIds = new Set(
    UPSTREAM_FEEDERS.map((f) => f.brokerId).filter(Boolean) as string[]
  );

  // Pick downstream brokers (prioritizing scanned/exposed brokers plus representative catalog entries)
  const downstreamCandidates = allBrokers
    .filter((b) => !feederBrokerIds.has(b.id))
    .sort((a, b) => {
      const aExposed = resultByBrokerId.get(a.id)?.status === 'exposed' ? 1 : 0;
      const bExposed = resultByBrokerId.get(b.id)?.status === 'exposed' ? 1 : 0;
      if (aExposed !== bExposed) return bExposed - aExposed;
      const riskWeight = { Critical: 3, High: 2, Medium: 1 };
      return riskWeight[b.risk] - riskWeight[a.risk];
    })
    .slice(0, 18);

  const downstreamNodeMap = new Map<string, SupplyChainNode>();
  for (const broker of downstreamCandidates) {
    const resolved = resolveStateFromScan(broker.id, resultByBrokerId);
    downstreamNodeMap.set(`broker-${broker.id}`, {
      id: `broker-${broker.id}`,
      label: broker.name,
      domain: broker.domain,
      tier: 'downstream_broker',
      tierIndex: 2,
      brokerId: broker.id,
      optOutUrl: broker.optOutUrl,
      risk: broker.risk,
      exposureState: resolved.state,
      recordsCount: resolved.recordsCount,
      downstreamBrokerIds: [],
      downstreamExposedCount: 0,
      keystonePriorityScore: resolved.state === 'exposed' ? (broker.risk === 'Critical' ? 28 : 18) : 5,
      feedDescription: broker.overview,
    });
  }

  const links: SupplyChainLink[] = [];
  const upstreamNodeMap = new Map<string, SupplyChainNode>();

  for (const spec of UPSTREAM_FEEDERS) {
    const matchedDownstreamBrokers = downstreamCandidates.filter((b) =>
      spec.matchBrokerPredicate(b)
    );
    const matchedIds = matchedDownstreamBrokers.map((b) => b.id);
    const resolvedSelf = resolveStateFromScan(spec.brokerId, resultByBrokerId);

    const downstreamExposedCount = matchedDownstreamBrokers.filter((b) => {
      const st = resolveStateFromScan(b.id, resultByBrokerId).state;
      return st === 'exposed';
    }).length;

    // If a clearinghouse isn't explicitly scanned as exposed, check if >=2 of its downstream children are exposed
    const effectiveState: NodeExposureState =
      resolvedSelf.state !== 'clean'
        ? resolvedSelf.state
        : downstreamExposedCount >= 2
        ? 'exposed'
        : 'clean';

    const tierBonus = spec.tier === 'clearinghouse' ? 35 : 25;
    const selfBonus = effectiveState === 'exposed' ? 30 : effectiveState === 'submitted' ? 12 : 4;
    const keystonePriorityScore =
      tierBonus + selfBonus + downstreamExposedCount * 14 + matchedIds.length * 3;

    const catalogBroker = spec.brokerId ? brokerById.get(spec.brokerId) : undefined;

    upstreamNodeMap.set(spec.id, {
      id: spec.id,
      label: spec.label,
      domain: catalogBroker?.domain || spec.domain,
      tier: spec.tier,
      tierIndex: spec.tier === 'clearinghouse' ? 0 : 1,
      brokerId: catalogBroker?.id || spec.brokerId,
      optOutUrl: catalogBroker?.optOutUrl || spec.optOutUrl,
      risk: spec.risk,
      exposureState: effectiveState,
      recordsCount:
        resolvedSelf.recordsCount || (effectiveState === 'exposed' ? Math.max(1, downstreamExposedCount) : 0),
      downstreamBrokerIds: matchedIds,
      downstreamExposedCount,
      keystonePriorityScore,
      feedDescription: spec.feedDescription,
    });
  }

  // Tier 0 -> Tier 1 links
  for (const spec of UPSTREAM_FEEDERS) {
    if (spec.tier === 'parent_network' && spec.upstreamParentIds) {
      const targetNode = upstreamNodeMap.get(spec.id);
      for (const parentId of spec.upstreamParentIds) {
        const sourceNode = upstreamNodeMap.get(parentId);
        if (!sourceNode || !targetNode) continue;
        const activeFlow =
          (sourceNode.exposureState === 'exposed' || sourceNode.exposureState === 'submitted') &&
          (targetNode.exposureState === 'exposed' || targetNode.downstreamExposedCount > 0);
        links.push({
          id: `${sourceNode.id}->${targetNode.id}`,
          sourceId: sourceNode.id,
          targetId: targetNode.id,
          feedType: sourceNode.tier === 'clearinghouse' ? 'credit_header' : spec.feedType,
          feedLabel: 'Upstream Record Wholesale Feed',
          activeExposureFlow: activeFlow,
        });
      }
    }
  }

  // Upstream (Tier 1 preferred, else Tier 0) -> Tier 2 downstream links
  for (const broker of downstreamCandidates) {
    const targetNodeId = `broker-${broker.id}`;
    const targetNode = downstreamNodeMap.get(targetNodeId);
    if (!targetNode) continue;

    const matchingNetworks = UPSTREAM_FEEDERS.filter(
      (f) => f.tier === 'parent_network' && f.matchBrokerPredicate(broker)
    );
    const matchingClearinghouses = UPSTREAM_FEEDERS.filter(
      (f) => f.tier === 'clearinghouse' && f.matchBrokerPredicate(broker)
    );

    const chosenFeeders =
      matchingNetworks.length > 0
        ? matchingNetworks
        : matchingClearinghouses.length > 0
        ? matchingClearinghouses.slice(0, 2)
        : [UPSTREAM_FEEDERS[1]];

    for (const feeder of chosenFeeders) {
      const sourceNode = upstreamNodeMap.get(feeder.id);
      if (!sourceNode) continue;
      const activeFlow =
        targetNode.exposureState === 'exposed' && sourceNode.exposureState !== 'removed';
      links.push({
        id: `${sourceNode.id}->${targetNode.id}`,
        sourceId: sourceNode.id,
        targetId: targetNode.id,
        feedType: feeder.feedType,
        feedLabel: feeder.feedLabel,
        activeExposureFlow: activeFlow,
      });
    }
  }

  const allNodes: SupplyChainNode[] = [
    ...Array.from(upstreamNodeMap.values()),
    ...Array.from(downstreamNodeMap.values()),
  ];

  // Build ordered Root-to-Leaf Keystone Suppression Plan
  const actionableNodes = allNodes
    .filter((n) => n.exposureState === 'exposed' || n.downstreamExposedCount > 0)
    .sort((a, b) => {
      if (a.tierIndex !== b.tierIndex) return a.tierIndex - b.tierIndex;
      return b.keystonePriorityScore - a.keystonePriorityScore;
    });

  const planNodes = actionableNodes.length > 0 ? actionableNodes : allNodes.filter((n) => n.tierIndex < 2);

  const suppressionPlan: KeystoneSuppressionStep[] = planNodes.map((node, index) => {
    const actionText =
      node.tier === 'clearinghouse'
        ? `Suppress wholesale clearinghouse feed first to starve ${node.downstreamBrokerIds.length} downstream directories.`
        : node.tier === 'parent_network'
        ? `File network-wide suppression to purge ${node.downstreamBrokerIds.length} affiliated mirror brands simultaneously.`
        : 'Submit direct record suppression after upstream feeders are locked.';

    return {
      order: index + 1,
      nodeId: node.id,
      brokerId: node.brokerId,
      name: node.label,
      domain: node.domain,
      tier: node.tier,
      exposureState: node.exposureState,
      downstreamExposedCount: node.downstreamExposedCount,
      totalDownstreamCount: node.downstreamBrokerIds.length,
      keystonePriorityScore: node.keystonePriorityScore,
      recommendedAction: actionText,
      optOutUrl: node.optOutUrl,
    };
  });

  const exposedUpstreamCount = allNodes.filter(
    (n) => n.tierIndex < 2 && n.exposureState === 'exposed'
  ).length;
  const exposedDownstreamCount = allNodes.filter(
    (n) => n.tierIndex === 2 && n.exposureState === 'exposed'
  ).length;
  const activeSyndicationFlows = links.filter((l) => l.activeExposureFlow).length;

  return {
    nodes: allNodes,
    links,
    suppressionPlan,
    stats: {
      totalNodes: allNodes.length,
      totalLinks: links.length,
      exposedUpstreamCount,
      exposedDownstreamCount,
      activeSyndicationFlows,
      topKeystoneName: suppressionPlan[0]?.name || null,
    },
  };
}

export function exportSupplyChainPlanMarkdown(
  report: SupplyChainGraphReport,
  subjectName: string
): string {
  const lines: string[] = [
    '# synOUT Upstream Supply-Chain & Cascade Suppression Plan',
    '',
    `- **Protected Subject**: ${subjectName || 'Consumer Workspace'}`,
    `- **Generated**: ${new Date().toISOString()}`,
    `- **Active Syndication Flows**: ${report.stats.activeSyndicationFlows}`,
    `- **Exposed Upstream Clearinghouses / Networks**: ${report.stats.exposedUpstreamCount}`,
    `- **Exposed Downstream Mirrors**: ${report.stats.exposedDownstreamCount}`,
    '',
    '## Ordered Root-to-Leaf Suppression Sequence',
    '',
    '| Order | Target Entity | Tier | Status | Exposed Mirrors Fed | Priority Score | Official Opt-Out Portal |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const step of report.suppressionPlan) {
    lines.push(
      `| ${step.order} | ${step.name} (${step.domain}) | ${step.tier} | ${step.exposureState} | ${step.downstreamExposedCount}/${step.totalDownstreamCount} | ${step.keystonePriorityScore} | ${step.optOutUrl} |`
    );
  }

  lines.push(
    '',
    '## Why Root-to-Leaf Order Matters',
    '',
    '1. Suppress **Tier 0 Wholesale Clearinghouses** (LexisNexis, Acxiom, CoreLogic, Experian Marketing) first so fresh address/phone headers stop flowing downstream.',
    '2. Suppress **Tier 1 Parent Networks** (PeopleConnect, BeenVerified, PeopleFinders) to clear entire clusters of affiliated people-search domains in a single cycle.',
    '3. Clear remaining **Tier 2 Independent Mirrors** and verify absence at the 30/45-day statutory SLA window.'
  );

  return lines.join('\n');
}
