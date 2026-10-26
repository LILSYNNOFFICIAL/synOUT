import { DataBroker } from '../types';
import { DATA_BROKERS } from '../data/brokers';
import { isSyntheticDomain } from './scanEngine';

/**
 * synOUT Autonomous Broker Discovery & Growth Engine
 * Expands the monitoring registry exclusively with real, DNS-resolvable public record
 * aggregators, California Delete Act registered brokers, and verified parent DPO desks.
 */

const SEED_DISCOVERY_POOL: DataBroker[] = [
  {
    id: 'searchpeoplefree',
    name: 'SearchPeopleFree',
    domain: 'searchpeoplefree.com',
    category: 'People Search',
    risk: 'High',
    optOutUrl: 'https://www.searchpeoplefree.com/opt-out',
    recordsUrl: 'https://www.searchpeoplefree.com',
    privacyEmail: 'privacy@searchpeoplefree.com',
    fallbackEmails: ['support@searchpeoplefree.com'],
    emailDeliverability: 'portal_primary',
    removalMethod: 'Online Form',
    removalTime: '24-48 Hours',
    dataExposedList: ['Full Legal Name', 'Phone History', 'Associated Relatives', 'Current Address'],
    overview: 'High-volume free public index aggregating residential addresses and mobile carrier histories.',
    instructions: ['Submit opt-out request through their direct record removal portal.', 'Verify confirmation link sent via email.'],
    exposureLikelihood: 0.88,
  },
  {
    id: 'nuwber',
    name: 'Nuwber',
    domain: 'nuwber.com',
    category: 'People Search',
    risk: 'High',
    optOutUrl: 'https://nuwber.com/removal/link',
    recordsUrl: 'https://nuwber.com',
    privacyEmail: 'support@nuwber.com',
    fallbackEmails: ['privacy@nuwber.com'],
    emailDeliverability: 'verified_dpo',
    removalMethod: 'Online Form',
    removalTime: '24-48 Hours',
    dataExposedList: ['Past & Present Addresses', 'Landline & Cell Numbers', 'Known Associates'],
    overview: 'Fast-growing digital directory compiling state voter files, census indexes, and social profiles.',
    instructions: ['Search profile on Nuwber.', 'Paste profile URL into Nuwber removal link portal.', 'Click email activation link.'],
    exposureLikelihood: 0.85,
  },
  {
    id: 'neighborwho',
    name: 'NeighborWho',
    domain: 'neighborwho.com',
    category: 'Real Estate & Property',
    risk: 'High',
    optOutUrl: 'https://www.neighborwho.com/opt-out',
    recordsUrl: 'https://www.neighborwho.com',
    privacyEmail: 'privacy@beenverified.com',
    fallbackEmails: ['privacy@neighborwho.com', 'support@neighborwho.com'],
    parentEntity: 'BeenVerified Network',
    emailDeliverability: 'parent_dpo',
    removalMethod: 'Online Form',
    removalTime: '7 Days',
    dataExposedList: ['Property Deed Information', 'Assessed Property Values', 'Neighbor Names', 'Mortgage Records'],
    overview: 'Property intelligence aggregator exposing household demographics and neighborhood dossiers under the BeenVerified network.',
    instructions: ['Route statutory demand to BeenVerified Compliance (privacy@beenverified.com) or use neighborwho.com/opt-out.'],
    exposureLikelihood: 0.79,
  },
  {
    id: 'smartbackgroundchecks',
    name: 'SmartBackgroundChecks',
    domain: 'smartbackgroundchecks.com',
    category: 'People Search',
    risk: 'High',
    optOutUrl: 'https://www.smartbackgroundchecks.com/optout',
    recordsUrl: 'https://www.smartbackgroundchecks.com',
    privacyEmail: 'privacy@smartbackgroundchecks.com',
    fallbackEmails: ['support@smartbackgroundchecks.com'],
    emailDeliverability: 'portal_primary',
    removalMethod: 'Online Form',
    removalTime: '48 Hours',
    dataExposedList: ['Age & Birth Year', 'Phone Numbers', 'Prior 10-Year Address Trail'],
    overview: 'Aggregates commercial marketing databases and municipal court records.',
    instructions: ['Accept terms on opt-out page.', 'Search and select consumer listing.', 'Confirm via email.'],
    exposureLikelihood: 0.82,
  },
  {
    id: 'clustrmaps',
    name: 'ClustrMaps',
    domain: 'clustrmaps.com',
    category: 'People Search',
    risk: 'High',
    optOutUrl: 'https://clustrmaps.com/bl/opt-out',
    recordsUrl: 'https://clustrmaps.com',
    privacyEmail: 'support@clustrmaps.com',
    fallbackEmails: ['privacy@clustrmaps.com'],
    emailDeliverability: 'verified_dpo',
    removalMethod: 'Online Form',
    removalTime: '24-72 Hours',
    dataExposedList: ['Residential Parcel Maps', 'Household Occupants', 'Phone Numbers', 'Associated Associates'],
    overview: 'Geospatial household and residential address directory indexing US parcel occupants.',
    instructions: ['Open ClustrMaps opt-out portal.', 'Paste your listing URL and select exposed address rows to remove.'],
    exposureLikelihood: 0.84,
  },
  {
    id: 'peoplebyname',
    name: 'PeopleByName',
    domain: 'peoplebyname.com',
    category: 'People Search',
    risk: 'Medium',
    optOutUrl: 'https://www.peoplebyname.com/remove.php',
    recordsUrl: 'https://www.peoplebyname.com',
    privacyEmail: 'privacy@peoplebyname.com',
    fallbackEmails: ['support@peoplebyname.com'],
    emailDeliverability: 'portal_primary',
    removalMethod: 'Online Form',
    removalTime: '3-5 Days',
    dataExposedList: ['Whitepages Listings', 'Reverse Address'],
    overview: 'Historical whitepages directory compiling telephone listings.',
    instructions: ['Submit listing record ID and email to the remove.php portal.'],
    exposureLikelihood: 0.72,
  },
  {
    id: 'usphonebook',
    name: 'US Phone Book',
    domain: 'usphonebook.com',
    category: 'People Search',
    risk: 'High',
    optOutUrl: 'https://www.usphonebook.com/opt-out',
    recordsUrl: 'https://www.usphonebook.com',
    privacyEmail: 'privacy@usphonebook.com',
    fallbackEmails: ['support@usphonebook.com'],
    emailDeliverability: 'portal_primary',
    removalMethod: 'Online Form',
    removalTime: '24-48 Hours',
    dataExposedList: ['Cell Carrier', 'Billing Address', 'Known Relatives'],
    overview: 'Major US telecommunications directory exposing mobile subscriber details.',
    instructions: ['Accept opt-out portal terms, search your phone number or name, and click Opt-Out.'],
    exposureLikelihood: 0.86,
  },
];

/**
 * Curated expansion catalog of real, live US data brokers with real DNS MX records
 * and verified statutory opt-out endpoints (zero synthetic / NXDOMAIN domains).
 */
const VERIFIED_EXPANSION_CATALOG: DataBroker[] = [
  {
    id: 'peekyou',
    name: 'PeekYou',
    domain: 'peekyou.com',
    category: 'People Search',
    risk: 'High',
    optOutUrl: 'https://www.peekyou.com/about/contact/ccpa_optout',
    recordsUrl: 'https://www.peekyou.com',
    privacyEmail: 'ccpa@peekyou.com',
    fallbackEmails: ['privacy@peekyou.com', 'feedback@peekyou.com'],
    emailDeliverability: 'verified_dpo',
    removalMethod: 'Online Form',
    removalTime: '3-7 Days',
    dataExposedList: ['Social Handles', 'Usernames', 'Full Legal Name', 'City & State', 'Web Links'],
    overview: 'Digital footprint aggregator linking usernames, public social profiles, and residential records.',
    instructions: ['Note the Unique ID at the end of your PeekYou profile URL.', 'Submit the CCPA opt-out form or email ccpa@peekyou.com.'],
    exposureLikelihood: 0.83,
  },
  {
    id: 'checkpeople',
    name: 'CheckPeople',
    domain: 'checkpeople.com',
    category: 'People Search',
    risk: 'High',
    optOutUrl: 'https://www.checkpeople.com/opt-out',
    recordsUrl: 'https://www.checkpeople.com',
    privacyEmail: 'support@checkpeople.com',
    fallbackEmails: ['privacy@checkpeople.com'],
    emailDeliverability: 'verified_dpo',
    removalMethod: 'Online Form',
    removalTime: '24-72 Hours',
    dataExposedList: ['Background Summaries', 'Phone Numbers', 'Address History', 'Relatives'],
    overview: 'Commercial background report and people search subscription directory.',
    instructions: ['Search your listing on checkpeople.com/opt-out and confirm via verification email.'],
    exposureLikelihood: 0.85,
  },
  {
    id: 'cocofinder',
    name: 'CocoFinder',
    domain: 'cocofinder.com',
    category: 'People Search',
    risk: 'High',
    optOutUrl: 'https://cocofinder.com/remove-my-info',
    recordsUrl: 'https://cocofinder.com',
    privacyEmail: 'support@cocofinder.com',
    fallbackEmails: ['privacy@cocofinder.com'],
    emailDeliverability: 'verified_dpo',
    removalMethod: 'Online Form',
    removalTime: '48-72 Hours',
    dataExposedList: ['Phone Directory', 'Residential Address', 'Age', 'Known Relatives'],
    overview: 'International people-finder directory indexing US residential and telecom listings.',
    instructions: ['Submit deletion demand to support@cocofinder.com or complete remove-my-info portal.'],
    exposureLikelihood: 0.78,
  },
  {
    id: 'mylife',
    name: 'MyLife',
    domain: 'mylife.com',
    category: 'People Search',
    risk: 'Critical',
    optOutUrl: 'https://www.mylife.com/ccpa/index.pubview',
    recordsUrl: 'https://www.mylife.com',
    privacyEmail: 'privacy@mylife.com',
    fallbackEmails: ['removalrequests@mylife.com', 'service@mylife.com'],
    emailDeliverability: 'verified_dpo',
    removalMethod: 'Email CCPA Demand',
    removalTime: '7-14 Days',
    dataExposedList: ['Reputation Score', 'Court Filings', 'Net Worth Estimate', 'Address & Phone History'],
    overview: 'Publishes public reputation profiles combining court records, property deeds, and biographical dossiers.',
    instructions: ['Send statutory CCPA deletion demand to privacy@mylife.com or submit the CCPA web form.'],
    exposureLikelihood: 0.87,
  },
  {
    id: 'zabasearch',
    name: 'ZabaSearch',
    domain: 'zabasearch.com',
    category: 'People Search',
    risk: 'High',
    optOutUrl: 'https://suppression.peopleconnect.us/login',
    recordsUrl: 'https://www.zabasearch.com',
    privacyEmail: 'privacy@peopleconnect.us',
    fallbackEmails: ['privacy@zabasearch.com', 'response@zabasearch.com'],
    parentEntity: 'PeopleConnect Holdings',
    emailDeliverability: 'parent_dpo',
    removalMethod: 'Online Form',
    removalTime: '48 Hours',
    dataExposedList: ['Unlisted Landlines', 'Birth Year', 'Current & Historical Addresses'],
    overview: 'Free public people-search engine operated under the PeopleConnect Holdings data network.',
    instructions: ['Route statutory email to PeopleConnect DPO (privacy@peopleconnect.us) or use suppression.peopleconnect.us.'],
    exposureLikelihood: 0.84,
  },
  {
    id: 'addresses-com',
    name: 'Addresses.com',
    domain: 'addresses.com',
    category: 'People Search',
    risk: 'Medium',
    optOutUrl: 'https://suppression.peopleconnect.us/login',
    recordsUrl: 'https://www.addresses.com',
    privacyEmail: 'privacy@peopleconnect.us',
    fallbackEmails: ['privacy@addresses.com'],
    parentEntity: 'PeopleConnect Holdings',
    emailDeliverability: 'parent_dpo',
    removalMethod: 'Online Form',
    removalTime: '48 Hours',
    dataExposedList: ['Whitepages Address Directory', 'Phone Numbers', 'Zip Code History'],
    overview: 'Legacy residential directory syndicated by PeopleConnect Holdings.',
    instructions: ['Submit statutory suppression via privacy@peopleconnect.us or the PeopleConnect portal.'],
    exposureLikelihood: 0.77,
  },
  {
    id: 'anywho',
    name: 'AnyWho Directory',
    domain: 'anywho.com',
    category: 'People Search',
    risk: 'High',
    optOutUrl: 'https://www.anywho.com/optout',
    recordsUrl: 'https://www.anywho.com',
    privacyEmail: 'privacy@yp.com',
    fallbackEmails: ['privacy@thryv.com'],
    parentEntity: 'Thryv / YP Holdings',
    emailDeliverability: 'parent_dpo',
    removalMethod: 'Online Form',
    removalTime: '3-5 Days',
    dataExposedList: ['Reverse Telephone Lookup', 'Street Address', 'Household Adults'],
    overview: 'AT&T / YP heritage telephone and reverse-address directory operated by Thryv.',
    instructions: ['Complete AnyWho opt-out form or send statutory notice to privacy@yp.com.'],
    exposureLikelihood: 0.81,
  },
  {
    id: 'officialusa',
    name: 'OfficialUSA',
    domain: 'officialusa.com',
    category: 'People Search',
    risk: 'Medium',
    optOutUrl: 'https://www.officialusa.com/stateguides/optout/',
    recordsUrl: 'https://www.officialusa.com',
    privacyEmail: 'support@officialusa.com',
    fallbackEmails: ['privacy@officialusa.com'],
    emailDeliverability: 'portal_primary',
    removalMethod: 'Online Form',
    removalTime: '3-7 Days',
    dataExposedList: ['Public Vital Indexes', 'Phone & Street Directory', 'State Licensing Links'],
    overview: 'Public directory aggregating state record indexes and residential contact tables.',
    instructions: ['Locate your listing URL and submit on the OfficialUSA opt-out form.'],
    exposureLikelihood: 0.75,
  },
  {
    id: 'voterrecords',
    name: 'VoterRecords',
    domain: 'voterrecords.com',
    category: 'People Search',
    risk: 'High',
    optOutUrl: 'https://voterrecords.com/faq',
    recordsUrl: 'https://voterrecords.com',
    privacyEmail: 'admin@voterrecords.com',
    fallbackEmails: ['privacy@voterrecords.com'],
    emailDeliverability: 'portal_primary',
    removalMethod: 'Online Form',
    removalTime: '3-7 Days',
    dataExposedList: ['Party Affiliation', 'Residential Street Address', 'Voter Precinct', 'Birth Year'],
    overview: 'Publishes state voter registration files on the open web indexed by Google.',
    instructions: ['Open your VoterRecords profile page, scroll to the bottom, and click Record Opt-Out.'],
    exposureLikelihood: 0.80,
  },
  {
    id: 'advancedbackgroundchecks',
    name: 'AdvancedBackgroundChecks',
    domain: 'advancedbackgroundchecks.com',
    category: 'People Search',
    risk: 'High',
    optOutUrl: 'https://www.advancedbackgroundchecks.com/removal',
    recordsUrl: 'https://www.advancedbackgroundchecks.com',
    privacyEmail: 'privacy@advancedbackgroundchecks.com',
    fallbackEmails: ['support@advancedbackgroundchecks.com'],
    emailDeliverability: 'portal_primary',
    removalMethod: 'Online Form',
    removalTime: '24-48 Hours',
    dataExposedList: ['Full Name & Aliases', 'Phone Numbers', 'Email Addresses', 'Relatives'],
    overview: 'High-traffic people search portal indexing residential and phone carrier headers.',
    instructions: ['Submit email on the removal portal, select your profile, and click the inbox verification link.'],
    exposureLikelihood: 0.85,
    provenanceSource: 'verified_privacy_portal',
  },
  {
    id: 'pipl',
    name: 'Pipl Identity Intelligence',
    domain: 'pipl.com',
    category: 'B2B & Professional Intelligence',
    risk: 'High',
    optOutUrl: 'https://pipl.com/personal-information-removal-request',
    recordsUrl: 'https://pipl.com',
    privacyEmail: 'privacy@pipl.com',
    fallbackEmails: ['dpo@pipl.com'],
    emailDeliverability: 'verified_dpo',
    removalMethod: 'Online Form',
    removalTime: '15-30 Days',
    dataExposedList: ['Cross-Referenced Identity Graph', 'Work & Personal Emails', 'Phone Numbers', 'Social Profiles'],
    overview: 'Enterprise identity resolution engine registered under the California Delete Act.',
    instructions: ['Submit the Pipl Personal Information Removal Request form and confirm via email.'],
    exposureLikelihood: 0.82,
    adapterId: 'generic_dom_form',
    workflowType: 'direct_web_form',
    requiresEmailVerification: true,
    provenanceSource: 'cpra_data_broker_registry',
  },
  {
    id: 'zoominfo',
    name: 'ZoomInfo Privacy Center',
    domain: 'zoominfo.com',
    category: 'B2B & Professional Intelligence',
    risk: 'High',
    optOutUrl: 'https://www.zoominfo.com/about-zoominfo/privacy-manage-profile',
    recordsUrl: 'https://www.zoominfo.com',
    privacyEmail: 'privacy@zoominfo.com',
    fallbackEmails: ['remove@zoominfo.com'],
    emailDeliverability: 'verified_dpo',
    removalMethod: 'Online Form',
    removalTime: '7-14 Days',
    dataExposedList: ['Direct Dial Phone', 'Business Email', 'Job History', 'Corporate Org Chart'],
    overview: 'Commercial B2B contact intelligence database indexing corporate directories and email signatures.',
    instructions: ['Enter your email address in the ZoomInfo Manage Profile portal and verify the code sent to your inbox.'],
    exposureLikelihood: 0.84,
    adapterId: 'generic_dom_form',
    workflowType: 'direct_web_form',
    requiresEmailVerification: true,
    provenanceSource: 'cpra_data_broker_registry',
  },
  {
    id: 'rocketreach',
    name: 'RocketReach',
    domain: 'rocketreach.co',
    category: 'B2B & Professional Intelligence',
    risk: 'High',
    optOutUrl: 'https://rocketreach.co/claim-profile',
    recordsUrl: 'https://rocketreach.co',
    privacyEmail: 'privacy@rocketreach.co',
    fallbackEmails: ['support@rocketreach.co'],
    emailDeliverability: 'verified_dpo',
    removalMethod: 'Online Form',
    removalTime: '5-10 Days',
    dataExposedList: ['Personal & Work Emails', 'Direct Phone Numbers', 'Employment Links'],
    overview: 'Professional contact finder indexing executive profiles, emails, and direct phone numbers.',
    instructions: ['Submit profile removal via RocketReach claim/removal portal or email privacy@rocketreach.co.'],
    exposureLikelihood: 0.79,
    adapterId: 'generic_dom_form',
    workflowType: 'profile_url_form',
    requiresEmailVerification: true,
    provenanceSource: 'cpra_data_broker_registry',
  },
  {
    id: 'lusha',
    name: 'Lusha Privacy Center',
    domain: 'lusha.com',
    category: 'B2B & Professional Intelligence',
    risk: 'High',
    optOutUrl: 'https://www.lusha.com/privacy/removal/',
    recordsUrl: 'https://www.lusha.com',
    privacyEmail: 'privacy@lusha.com',
    fallbackEmails: ['support@lusha.com'],
    emailDeliverability: 'verified_dpo',
    removalMethod: 'Online Form',
    removalTime: '7-14 Days',
    dataExposedList: ['Direct Mobile Numbers', 'Work Emails', 'Company Title'],
    overview: 'Crowdsourced B2B contact enrichment broker registered in California and Texas.',
    instructions: ['Complete the Lusha Privacy Removal form and click the confirmation email link.'],
    exposureLikelihood: 0.78,
    adapterId: 'generic_dom_form',
    workflowType: 'direct_web_form',
    requiresEmailVerification: true,
    provenanceSource: 'cpra_data_broker_registry',
  },
  {
    id: 'melissa',
    name: 'Melissa Data Corp',
    domain: 'melissa.com',
    category: 'Marketing & Advertising',
    risk: 'High',
    optOutUrl: 'https://www.melissa.com/privacy-center',
    recordsUrl: 'https://www.melissa.com',
    privacyEmail: 'privacy@melissa.com',
    fallbackEmails: ['ccpa@melissa.com'],
    emailDeliverability: 'verified_dpo',
    removalMethod: 'Online Form',
    removalTime: '15-30 Days',
    dataExposedList: ['Postal Address Verification', 'Property Owner Lists', 'Household Demographics'],
    overview: 'National address verification and direct-mail consumer list broker.',
    instructions: ['Submit deletion request through the Melissa Privacy Center form or email privacy@melissa.com.'],
    exposureLikelihood: 0.83,
    adapterId: 'generic_dom_form',
    workflowType: 'direct_web_form',
    provenanceSource: 'cpra_data_broker_registry',
  },
  {
    id: 'veripages',
    name: 'Veripages',
    domain: 'veripages.com',
    category: 'People Search',
    risk: 'High',
    optOutUrl: 'https://veripages.com/ClassAction/OptOut',
    recordsUrl: 'https://veripages.com',
    privacyEmail: 'support@veripages.com',
    fallbackEmails: ['privacy@veripages.com'],
    emailDeliverability: 'verified_dpo',
    removalMethod: 'Online Form',
    removalTime: '48-72 Hours',
    dataExposedList: ['Full Name', 'Address History', 'Phone Numbers', 'Relatives'],
    overview: 'Public people-finder directory indexing US residential addresses and phone records.',
    instructions: ['Complete the Veripages Opt-Out form and confirm via email link.'],
    exposureLikelihood: 0.80,
    adapterId: 'generic_dom_form',
    workflowType: 'direct_web_form',
    requiresEmailVerification: true,
    provenanceSource: 'verified_privacy_portal',
  },
  {
    id: 'publicrecordsnow',
    name: 'PublicRecordsNow',
    domain: 'publicrecordsnow.com',
    category: 'People Search',
    risk: 'High',
    optOutUrl: 'https://www.publicrecordsnow.com/static/view/optout/',
    recordsUrl: 'https://www.publicrecordsnow.com',
    privacyEmail: 'privacy@peoplefinders.com',
    fallbackEmails: ['privacy@publicrecordsnow.com'],
    parentEntity: 'PeopleFinders Network',
    emailDeliverability: 'parent_dpo',
    removalMethod: 'Online Form',
    removalTime: '2-5 Days',
    dataExposedList: ['Address History', 'Phone Numbers', 'Age & Relatives'],
    overview: 'PeopleFinders-affiliated public record directory.',
    instructions: ['Paste your profile URL on the PublicRecordsNow opt-out form or contact privacy@peoplefinders.com.'],
    exposureLikelihood: 0.79,
    adapterId: 'generic_dom_form',
    workflowType: 'profile_url_form',
    requiresProfileUrl: true,
    provenanceSource: 'parent_network_dpo',
  },
  {
    id: 'infotracer',
    name: 'InfoTracer',
    domain: 'infotracer.com',
    category: 'People Search',
    risk: 'High',
    optOutUrl: 'https://infotracer.com/optout/',
    recordsUrl: 'https://infotracer.com',
    privacyEmail: 'privacy@infotracer.com',
    fallbackEmails: ['support@infotracer.com'],
    emailDeliverability: 'verified_dpo',
    removalMethod: 'Online Form',
    removalTime: '3-7 Days',
    dataExposedList: ['Public Records Summary', 'Vehicle & Property Indexes', 'Phone Numbers'],
    overview: 'Public records search portal indexing residential, property, and telecom records.',
    instructions: ['Search your record or submit the InfoTracer opt-out form and confirm via email.'],
    exposureLikelihood: 0.81,
    adapterId: 'generic_dom_form',
    workflowType: 'record_search_then_form',
    requiresEmailVerification: true,
    provenanceSource: 'cpra_data_broker_registry',
  },
];

const CUSTOM_BROKERS_STORAGE_KEY = 'synout_custom_discovered_brokers_v1';

let dynamicallyDiscoveredBrokers: DataBroker[] = [];

function loadStoredCustomBrokers(): DataBroker[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw =
      window.sessionStorage?.getItem(CUSTOM_BROKERS_STORAGE_KEY) ||
      window.localStorage?.getItem(CUSTOM_BROKERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((b) => Boolean(b && typeof b.id === 'string' && typeof b.domain === 'string'))
      : [];
  } catch {
    return [];
  }
}

export function registerCustomDiscoveredBroker(broker: DataBroker): void {
  if (!broker || !broker.id || !broker.domain) return;
  const enriched: DataBroker = {
    ...broker,
    provenanceSource: broker.provenanceSource || 'user_custom_discovered',
  };
  const idx = dynamicallyDiscoveredBrokers.findIndex((b) => b.id === enriched.id);
  if (idx >= 0) {
    dynamicallyDiscoveredBrokers[idx] = enriched;
  } else {
    dynamicallyDiscoveredBrokers.unshift(enriched);
  }
  try {
    if (typeof window !== 'undefined') {
      const stored = loadStoredCustomBrokers();
      const next = [enriched, ...stored.filter((b) => b.id !== enriched.id)].slice(0, 100);
      window.sessionStorage?.setItem(CUSTOM_BROKERS_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function clearCustomDiscoveredBrokers(): void {
  dynamicallyDiscoveredBrokers = [];
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage?.removeItem(CUSTOM_BROKERS_STORAGE_KEY);
      window.localStorage?.removeItem(CUSTOM_BROKERS_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Returns the combined exhaustive broker pool:
 * Static verified brokers + seed discovery pool + runtime/custom discovered real registries
 */
export function getExhaustiveBrokerRegistry(): DataBroker[] {
  const map = new Map<string, DataBroker>();

  // Add verified base catalog (excluding any synthetics)
  DATA_BROKERS.forEach((b) => {
    if (!isSyntheticDomain(b.domain)) {
      map.set(b.id, b);
    }
  });

  // Add seed discovery pool
  SEED_DISCOVERY_POOL.forEach((b) => {
    if (b.id && !map.has(b.id)) {
      map.set(b.id, b);
    }
  });

  // Add persisted custom websites discovered by the user
  loadStoredCustomBrokers().forEach((b) => {
    if (b.id && !map.has(b.id)) {
      map.set(b.id, b);
    }
  });

  // Add runtime discovered brokers
  dynamicallyDiscoveredBrokers.forEach((b) => {
    if (!map.has(b.id)) {
      map.set(b.id, b);
    }
  });

  return Array.from(map.values());
}

export function getUnaddedExpansionCatalogCount(): number {
  const existingIds = new Set(getExhaustiveBrokerRegistry().map((b) => b.id));
  return VERIFIED_EXPANSION_CATALOG.filter((b) => !existingIds.has(b.id)).length;
}

/**
 * Expands the active broker registry exclusively with real, verified data brokers
 * from the curated expansion catalog (never fabricating synthetic `-affiliate-N` entries).
 */
export function triggerAutonomousRegistryExpansion(): {
  newlyDiscoveredCount: number;
  totalRegistrySize: number;
  newBrokers: DataBroker[];
} {
  const currentPool = getExhaustiveBrokerRegistry();
  const existingIds = new Set(currentPool.map((b) => b.id));
  const newItems: DataBroker[] = [];

  const unadded = VERIFIED_EXPANSION_CATALOG.filter((b) => !existingIds.has(b.id));

  if (unadded.length > 0) {
    const candidate = unadded[0];
    dynamicallyDiscoveredBrokers.push(candidate);
    newItems.push(candidate);
  }

  const updatedTotal = getExhaustiveBrokerRegistry().length;

  return {
    newlyDiscoveredCount: newItems.length,
    totalRegistrySize: updatedTotal,
    newBrokers: newItems,
  };
}
