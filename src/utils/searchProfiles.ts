import { UserProfile, ScanResult } from '../types';

export type SearchTypeCategory =
  | 'STANDARD_IDENTITY'
  | 'CROSS_STATE_JURISDICTION'
  | 'REVERSE_PHONE'
  | 'EMAIL_BREACH'
  | 'VEHICLE_REGISTRATION'
  | 'COURT_CRIMINAL_DOCKET'
  | 'PROPERTY_DEED_TAX'
  | 'FAMILY_MAIDEN_NAME'
  | 'CORPORATE_EXECUTIVE'
  | 'DARK_WEB_STEALER_LOG';

export interface StoredSearchProfile {
  id: string;
  name: string;
  searchType: SearchTypeCategory;
  typeLabel: string;
  timestamp: string;
  profileData: UserProfile;
  savedResults?: ScanResult[];
  exposedCount: number;
  totalScanned: number;
}

export const SEARCH_TYPES: { type: SearchTypeCategory; label: string; description: string }[] = [
  {
    type: 'STANDARD_IDENTITY',
    label: 'Standard Identity Search',
    description: 'Name, current primary city, and state residential dossier lookup.',
  },
  {
    type: 'CROSS_STATE_JURISDICTION',
    label: 'Cross-State Jurisdiction Search',
    description: 'Multi-jurisdictional query checking prior residence ties across secondary states (e.g. CA resident in TX/FL).',
  },
  {
    type: 'REVERSE_PHONE',
    label: 'Reverse Phone Dossier',
    description: 'Telco billing registry, cellular subscriber records, and reverse phone query.',
  },
  {
    type: 'EMAIL_BREACH',
    label: 'Email Breach & Intelligence Search',
    description: 'Corporate and personal email presence across aggregated credential syndicates.',
  },
  {
    type: 'VEHICLE_REGISTRATION',
    label: 'Vehicle VIN & License Plate Records',
    description: 'State DMV and automotive ownership public registry search.',
  },
  {
    type: 'COURT_CRIMINAL_DOCKET',
    label: 'Court Docket & Criminal Record Search',
    description: 'Municipal, county, and state docket filings and legal indexes.',
  },
  {
    type: 'PROPERTY_DEED_TAX',
    label: 'Property Deed & Tax Assessment Records',
    description: 'County assessor, deed transfer, parcel ownership, and mortgage registries.',
  },
  {
    type: 'FAMILY_MAIDEN_NAME',
    label: 'Family Tree & Maiden Name Linkage',
    description: 'Ancestry records, kinship linkages, and prior surname public filings.',
  },
  {
    type: 'CORPORATE_EXECUTIVE',
    label: 'Corporate Executive & Secretary of State Records',
    description: 'LLC filings, corporate officer registries, and SEC director records.',
  },
  {
    type: 'DARK_WEB_STEALER_LOG',
    label: 'Dark Web Stealer Log & Tor Threat Feed',
    description: 'Underground cyber market dumps, botnet combo lists, and onion paste queries.',
  },
];

export const MAX_STORED_SEARCHES = 10;

const STORAGE_KEY = 'synout_saved_searches';

function readSavedSearchesRaw(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSavedSearchesRaw(serialized: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Ignore iframe storage or quota restrictions
  }
}

export function getSavedSearches(): StoredSearchProfile[] {
  const raw = readSavedSearchesRaw();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSearchProfile(
  profile: UserProfile,
  searchType: SearchTypeCategory,
  results: ScanResult[]
): { success: boolean; message?: string; quotaReached?: boolean } {
  const existing = getSavedSearches();

  if (existing.length >= MAX_STORED_SEARCHES) {
    return {
      success: false,
      quotaReached: true,
      message: `Search limit reached (${MAX_STORED_SEARCHES}/${MAX_STORED_SEARCHES}). You must delete an existing search result before initiating a new search type.`,
    };
  }

  const typeConfig = SEARCH_TYPES.find((t) => t.type === searchType) || SEARCH_TYPES[0];
  const newProfile: StoredSearchProfile = {
    id: `search-${Date.now()}`,
    name: `${profile.firstName} ${profile.lastName} - ${typeConfig.label}`,
    searchType,
    typeLabel: typeConfig.label,
    timestamp: new Date().toLocaleString(),
    profileData: profile,
    savedResults: results,
    exposedCount: results.filter((r) => r.status === 'exposed').length,
    totalScanned: results.length,
  };

  const updated = [newProfile, ...existing];
  writeSavedSearchesRaw(JSON.stringify(updated));
  return { success: true };
}

export function deleteSearchProfile(id: string): StoredSearchProfile[] {
  const existing = getSavedSearches();
  const updated = existing.filter((s) => s.id !== id);
  writeSavedSearchesRaw(JSON.stringify(updated));
  return updated;
}

export function restoreSavedSearches(profiles: StoredSearchProfile[]): void {
  writeSavedSearchesRaw(JSON.stringify(profiles.slice(0, MAX_STORED_SEARCHES)));
}

export function clearAllSavedSearches(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage restriction errors
  }
}
