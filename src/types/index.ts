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

export interface DataBroker {
  id: string;
  name: string;
  domain: string;
  category: BrokerCategory;
  risk: RiskLevel;
  optOutUrl: string;
  recordsUrl: string;
  privacyEmail: string;
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
  lastCheckedDate?: string;
  disqualifiedReason?: string;
}

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
