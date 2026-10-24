export type BrokerCategory = 
  | 'People Search'
  | 'Financial & Credit Marketing'
  | 'Marketing & Advertising'
  | 'Recruitment & Professional'
  | 'Real Estate & Property'
  | 'Arrest & Court Records'
  | 'Vehicle & Asset Registry'
  | 'B2B & Professional Intelligence';

export type RiskLevel = 'Critical' | 'High' | 'Medium';

export type RemovalMethod = 'Online Form' | 'Email CCPA Demand' | 'Mail-In' | 'Phone' | 'Automated Opt-Out API';

export type EmailDeliverabilityTier = 'verified_dpo' | 'parent_dpo' | 'portal_primary';

export interface DataBroker {
  id: string;
  name: string;
  domain: string;
  category: BrokerCategory;
  risk: RiskLevel;
  optOutUrl: string;
  recordsUrl: string;
  privacyEmail: string;
  fallbackEmails?: string[];
  parentEntity?: string;
  emailDeliverability?: EmailDeliverabilityTier;
  removalMethod: RemovalMethod;
  removalTime: string;
  dataExposedList: string[];
  overview: string;
  instructions: string[];
  exposureLikelihood: number;
  jurisdiction?: string;
  targetStates?: string[];
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  middleName?: string;
  birthYear?: string;
  currentCity: string;
  currentState: string;
  currentZip?: string;
  currentStreet?: string;
  previousLocations: string[];
  phoneNumbers: string[];
  emails: string[];
  relatives: string[];
  vehicleInfo?: {
    vin?: string;
    licensePlate?: string;
    state?: string;
  };
  associations?: { name: string; role?: string }[];
  driversLicense?: {
    state?: string;
    hash?: string;
    lastFour?: string;
  };
  ssnToken?: {
    lastFour?: string;
    hash?: string;
  };
  powerOfAttorney?: PowerOfAttorneyData;
}

export interface PowerOfAttorneyData {
  fullName: string;
  address: string;
  state: string;
  signedDate: string;
  isSigned: boolean;
  authCode: string;
  agentName: string;
  scopeOfAuthority: string;
}

export interface MockListingData {
  fullName: string;
  age: number;
  locations: string[];
  phones: string[];
  emails: string[];
  relatives: string[];
  recordsCount: number;
  riskLevel: RiskLevel;
  leakTypes: string[];
  profiles: string[];
  matchConfidence: 'VERIFIED_PUBLIC_RECORD' | 'HIGH_CONFIDENCE_MATCH' | 'HOMONYM_DISQUALIFIED' | 'NO_RECORD';
  evidenceBasis?: string;
  crossStateEvidence?: string;
}

export interface ScanResult {
  id: string;
  brokerId: string;
  status: 'exposed' | 'clean' | 'scanning' | 'error';
  mockListingData: MockListingData;
  removalStatus?: 'found' | 'submitted' | 'removed' | 'failed';
  optOutConfirmationCode?: string;
  submissionDate?: string;
  submittedAtIso?: string;
  verifiedRemovedAtIso?: string;
  escalationCount?: number;
  lastEscalatedAt?: string;
  lastEscalationReceipt?: string;
  isRegression?: boolean;
  lastCheckedDate?: string;
  disqualifiedReason?: string;
  brokerConfirmationTicket?: string;
  replyTriageSummary?: string;
}

export type SearchEngineId = 'google' | 'bing' | 'duckduckgo' | 'yahoo' | 'brave';

export type DeindexStatus =
  | 'detected'
  | 'submitted_to_engine'
  | 'cache_purge_emailed'
  | 'deindexed';

export interface DeindexItem {
  id: string;
  url: string;
  brokerId?: string;
  brokerName: string;
  engine: SearchEngineId;
  status: DeindexStatus;
  createdAtIso: string;
  updatedAtIso: string;
  emailReceipt?: string;
  notes?: string;
}

export interface ScanHistorySnapshot {
  id: string;
  timestampIso: string;
  profileName: string;
  exposedBrokerIds: string[];
  submittedBrokerIds: string[];
  removedBrokerIds: string[];
  exposureScore: number;
}

export type CanaryStatus = 'active' | 'leak_detected' | 'revoked';

export interface CanaryAliasRecord {
  id: string;
  vendorName: string;
  vendorDomain: string;
  vendorPrivacyEmail?: string;
  aliasEmail: string;
  compartmentPhone?: string;
  tagToken: string;
  category: 'Retail & Loyalty' | 'Data Broker Opt-Out' | 'Financial / FinTech' | 'Healthcare / Portal' | 'General Signup';
  status: CanaryStatus;
  createdAtIso: string;
  leakDetectedAtIso?: string;
  leakEvidenceHeader?: string;
  demandReceipt?: string;
}

export interface PublicRecordChecklistState {
  completed?: boolean;
  submittedAtIso?: string;
  referenceNote?: string;
  emailReceipt?: string;
  updatedAtIso: string;
}

export type BrokerReplyCategory =
  | 'DELIVERY_BOUNCE_NDR'
  | 'CONFIRMATION_LINK_REQUIRED'
  | 'DELETION_CONFIRMED'
  | 'EXCESSIVE_ID_DEMAND'
  | 'EXEMPTION_CLAIM_OR_REFUSAL'
  | 'GENERAL_ACKNOWLEDGMENT';

export interface ScanStats {
  totalBrokers: number;
  exposedBrokers: number;
  cleanBrokers: number;
  totalRecordsExposed: number;
  criticalBrokers: number;
  highRiskBrokers: number;
  mediumRiskBrokers: number;
  exposureScore: number;
  inProgressRemovals: number;
  removedBrokers: number;
}

