import type { Feature, FeatureCollection, Polygon } from 'geojson';

export interface UsStateMetadata {
  code: string;
  name: string;
  region: 'West' | 'Midwest' | 'South' | 'Northeast';
  gridRow: number;
  gridCol: number;
  statuteLabel: string;
  hasComprehensivePrivacyLaw: boolean;
}

export const US_STATE_METADATA: UsStateMetadata[] = [
  { code: 'AK', name: 'Alaska', region: 'West', gridRow: 0, gridCol: 0, statuteLabel: 'Alaska Personal Information Protection Act', hasComprehensivePrivacyLaw: false },
  { code: 'ME', name: 'Maine', region: 'Northeast', gridRow: 0, gridCol: 10, statuteLabel: 'Maine ISP Privacy Law', hasComprehensivePrivacyLaw: false },

  { code: 'VT', name: 'Vermont', region: 'Northeast', gridRow: 1, gridCol: 9, statuteLabel: '9 V.S.A. § 2446 Data Broker Registry', hasComprehensivePrivacyLaw: true },
  { code: 'NH', name: 'New Hampshire', region: 'Northeast', gridRow: 1, gridCol: 10, statuteLabel: 'New Hampshire Privacy Act (RSA 507-H)', hasComprehensivePrivacyLaw: true },

  { code: 'WA', name: 'Washington', region: 'West', gridRow: 2, gridCol: 0, statuteLabel: 'WA My Health My Data Act & RCW 19.255', hasComprehensivePrivacyLaw: true },
  { code: 'ID', name: 'Idaho', region: 'West', gridRow: 2, gridCol: 1, statuteLabel: 'Idaho Consumer Protection Act', hasComprehensivePrivacyLaw: false },
  { code: 'MT', name: 'Montana', region: 'West', gridRow: 2, gridCol: 2, statuteLabel: 'Montana Consumer Data Privacy Act', hasComprehensivePrivacyLaw: true },
  { code: 'ND', name: 'North Dakota', region: 'Midwest', gridRow: 2, gridCol: 3, statuteLabel: 'NDCC Ch. 51-15 Consumer Privacy', hasComprehensivePrivacyLaw: false },
  { code: 'MN', name: 'Minnesota', region: 'Midwest', gridRow: 2, gridCol: 4, statuteLabel: 'Minnesota Consumer Data Privacy Act', hasComprehensivePrivacyLaw: true },
  { code: 'WI', name: 'Wisconsin', region: 'Midwest', gridRow: 2, gridCol: 5, statuteLabel: 'Wis. Stat. § 995.50 Privacy Right', hasComprehensivePrivacyLaw: false },
  { code: 'MI', name: 'Michigan', region: 'Midwest', gridRow: 2, gridCol: 6, statuteLabel: 'Michigan Consumer Protection Act', hasComprehensivePrivacyLaw: false },
  { code: 'NY', name: 'New York', region: 'Northeast', gridRow: 2, gridCol: 8, statuteLabel: 'NY SHIELD Act & General Business Law', hasComprehensivePrivacyLaw: false },
  { code: 'MA', name: 'Massachusetts', region: 'Northeast', gridRow: 2, gridCol: 9, statuteLabel: 'Mass. Gen. Laws ch. 93H Data Safeguards', hasComprehensivePrivacyLaw: false },
  { code: 'RI', name: 'Rhode Island', region: 'Northeast', gridRow: 2, gridCol: 10, statuteLabel: 'Rhode Island Data Transparency & Privacy Act', hasComprehensivePrivacyLaw: true },

  { code: 'OR', name: 'Oregon', region: 'West', gridRow: 3, gridCol: 0, statuteLabel: 'Oregon Consumer Privacy Act & Broker Registry', hasComprehensivePrivacyLaw: true },
  { code: 'NV', name: 'Nevada', region: 'West', gridRow: 3, gridCol: 1, statuteLabel: 'Nevada NRS 603A Sale Opt-Out Law', hasComprehensivePrivacyLaw: true },
  { code: 'WY', name: 'Wyoming', region: 'West', gridRow: 3, gridCol: 2, statuteLabel: 'Wyoming Consumer Protection Act', hasComprehensivePrivacyLaw: false },
  { code: 'SD', name: 'South Dakota', region: 'Midwest', gridRow: 3, gridCol: 3, statuteLabel: 'SDCL Ch. 37-24 Deceptive Practices', hasComprehensivePrivacyLaw: false },
  { code: 'IA', name: 'Iowa', region: 'Midwest', gridRow: 3, gridCol: 4, statuteLabel: 'Iowa Consumer Data Protection Act (ICDPA)', hasComprehensivePrivacyLaw: true },
  { code: 'IL', name: 'Illinois', region: 'Midwest', gridRow: 3, gridCol: 5, statuteLabel: 'Illinois BIPA & Personal Information Protection', hasComprehensivePrivacyLaw: false },
  { code: 'IN', name: 'Indiana', region: 'Midwest', gridRow: 3, gridCol: 6, statuteLabel: 'Indiana Consumer Data Protection Act', hasComprehensivePrivacyLaw: true },
  { code: 'OH', name: 'Ohio', region: 'Midwest', gridRow: 3, gridCol: 7, statuteLabel: 'Ohio Personal Privacy & Consumer Protection', hasComprehensivePrivacyLaw: false },
  { code: 'PA', name: 'Pennsylvania', region: 'Northeast', gridRow: 3, gridCol: 8, statuteLabel: 'PA Unfair Trade Practices & Consumer Law', hasComprehensivePrivacyLaw: false },
  { code: 'NJ', name: 'New Jersey', region: 'Northeast', gridRow: 3, gridCol: 9, statuteLabel: 'New Jersey Data Privacy Act (NJDPA) & Daniel\'s Law', hasComprehensivePrivacyLaw: true },
  { code: 'CT', name: 'Connecticut', region: 'Northeast', gridRow: 3, gridCol: 10, statuteLabel: 'Connecticut Data Privacy Act (CTDPA)', hasComprehensivePrivacyLaw: true },

  { code: 'CA', name: 'California', region: 'West', gridRow: 4, gridCol: 0, statuteLabel: 'CCPA / CPRA § 1798.105 & Delete Act (SB 362)', hasComprehensivePrivacyLaw: true },
  { code: 'UT', name: 'Utah', region: 'West', gridRow: 4, gridCol: 1, statuteLabel: 'Utah Consumer Privacy Act (UCPA)', hasComprehensivePrivacyLaw: true },
  { code: 'CO', name: 'Colorado', region: 'West', gridRow: 4, gridCol: 2, statuteLabel: 'Colorado Privacy Act (CPA § 6-1-1306)', hasComprehensivePrivacyLaw: true },
  { code: 'NE', name: 'Nebraska', region: 'Midwest', gridRow: 4, gridCol: 3, statuteLabel: 'Nebraska Data Privacy Act (NDPA)', hasComprehensivePrivacyLaw: true },
  { code: 'MO', name: 'Missouri', region: 'Midwest', gridRow: 4, gridCol: 4, statuteLabel: 'Missouri Merchandising Practices Act', hasComprehensivePrivacyLaw: false },
  { code: 'KY', name: 'Kentucky', region: 'South', gridRow: 4, gridCol: 5, statuteLabel: 'Kentucky Consumer Data Protection Act (KCDPA)', hasComprehensivePrivacyLaw: true },
  { code: 'WV', name: 'West Virginia', region: 'South', gridRow: 4, gridCol: 6, statuteLabel: 'WV Consumer Credit & Protection Act', hasComprehensivePrivacyLaw: false },
  { code: 'VA', name: 'Virginia', region: 'South', gridRow: 4, gridCol: 7, statuteLabel: 'Virginia Consumer Data Protection Act (VCDPA)', hasComprehensivePrivacyLaw: true },
  { code: 'MD', name: 'Maryland', region: 'South', gridRow: 4, gridCol: 8, statuteLabel: 'Maryland Online Data Privacy Act (MODPA)', hasComprehensivePrivacyLaw: true },
  { code: 'DE', name: 'Delaware', region: 'South', gridRow: 4, gridCol: 9, statuteLabel: 'Delaware Personal Data Privacy Act (DPDPA)', hasComprehensivePrivacyLaw: true },

  { code: 'AZ', name: 'Arizona', region: 'West', gridRow: 5, gridCol: 1, statuteLabel: 'Arizona Consumer Fraud & Data Breach Law', hasComprehensivePrivacyLaw: false },
  { code: 'NM', name: 'New Mexico', region: 'West', gridRow: 5, gridCol: 2, statuteLabel: 'NM Unfair Practices & Data Breach Act', hasComprehensivePrivacyLaw: false },
  { code: 'KS', name: 'Kansas', region: 'Midwest', gridRow: 5, gridCol: 3, statuteLabel: 'Kansas Consumer Protection Act', hasComprehensivePrivacyLaw: false },
  { code: 'AR', name: 'Arkansas', region: 'South', gridRow: 5, gridCol: 4, statuteLabel: 'Arkansas Personal Information Protection Act', hasComprehensivePrivacyLaw: false },
  { code: 'TN', name: 'Tennessee', region: 'South', gridRow: 5, gridCol: 5, statuteLabel: 'Tennessee Information Protection Act (TIPA)', hasComprehensivePrivacyLaw: true },
  { code: 'NC', name: 'North Carolina', region: 'South', gridRow: 5, gridCol: 6, statuteLabel: 'NC Identity Theft Protection Act', hasComprehensivePrivacyLaw: false },
  { code: 'SC', name: 'South Carolina', region: 'South', gridRow: 5, gridCol: 7, statuteLabel: 'SC Financial Identity Fraud Protection Act', hasComprehensivePrivacyLaw: false },
  { code: 'DC', name: 'District of Columbia', region: 'South', gridRow: 5, gridCol: 8, statuteLabel: 'DC Consumer Protection Procedures Act', hasComprehensivePrivacyLaw: false },

  { code: 'OK', name: 'Oklahoma', region: 'South', gridRow: 6, gridCol: 3, statuteLabel: 'Oklahoma Consumer Protection Act', hasComprehensivePrivacyLaw: false },
  { code: 'LA', name: 'Louisiana', region: 'South', gridRow: 6, gridCol: 4, statuteLabel: 'Louisiana Database Security Breach Law', hasComprehensivePrivacyLaw: false },
  { code: 'MS', name: 'Mississippi', region: 'South', gridRow: 6, gridCol: 5, statuteLabel: 'Mississippi Consumer Protection Act', hasComprehensivePrivacyLaw: false },
  { code: 'AL', name: 'Alabama', region: 'South', gridRow: 6, gridCol: 6, statuteLabel: 'Alabama Data Breach Notification Act', hasComprehensivePrivacyLaw: false },
  { code: 'GA', name: 'Georgia', region: 'South', gridRow: 6, gridCol: 7, statuteLabel: 'Georgia Fair Business Practices Act', hasComprehensivePrivacyLaw: false },

  { code: 'HI', name: 'Hawaii', region: 'West', gridRow: 7, gridCol: 0, statuteLabel: 'Hawaii HRS § 487N Personal Information Law', hasComprehensivePrivacyLaw: false },
  { code: 'TX', name: 'Texas', region: 'South', gridRow: 7, gridCol: 3, statuteLabel: 'Texas TDPSA (Ch. 541) & Broker Registry (Ch. 509)', hasComprehensivePrivacyLaw: true },
  { code: 'FL', name: 'Florida', region: 'South', gridRow: 7, gridCol: 8, statuteLabel: 'Florida Digital Bill of Rights (FDBR)', hasComprehensivePrivacyLaw: true },
];

export const US_STATE_BY_CODE: Record<string, UsStateMetadata> = Object.fromEntries(
  US_STATE_METADATA.map((s) => [s.code, s])
);

export const US_STATE_CODE_BY_NAME: Record<string, string> = Object.fromEntries(
  US_STATE_METADATA.map((s) => [s.name.toLowerCase(), s.code])
);

/**
 * Ensures exterior ring vertices are wound clockwise in `[lon, lat]` space so
 * `d3.geoArea(feature)` treats the state interior (rather than the complement of the globe)
 * as the filled polygon when projected by `d3.geoAlbersUsa()`.
 */
function ensureClockwiseD3Ring(points: Array<[number, number]>): Array<[number, number]> {
  const closed = [...points];
  const first = closed[0];
  const last = closed[closed.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    closed.push([first[0], first[1]]);
  }
  // Shoelace signed area in (lon, lat): negative = clockwise, positive = counter-clockwise
  let area2 = 0;
  for (let i = 0; i < closed.length - 1; i++) {
    const [x1, y1] = closed[i];
    const [x2, y2] = closed[i + 1];
    area2 += x1 * y2 - x2 * y1;
  }
  if (area2 > 0) {
    closed.reverse();
  }
  return closed;
}

function rectRing(west: number, south: number, east: number, north: number): Array<[number, number]> {
  return ensureClockwiseD3Ring([
    [west, south],
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ]);
}

const RAW_STATE_POLYGONS: Record<string, Array<[number, number]>> = {
  WA: [[-124.6, 46.2], [-124.7, 48.4], [-122.8, 49.0], [-117.0, 49.0], [-117.0, 46.0], [-121.2, 45.6], [-124.6, 46.2]],
  OR: [[-124.5, 42.0], [-124.2, 46.2], [-121.2, 45.6], [-117.0, 46.0], [-116.5, 44.2], [-117.0, 42.0], [-124.5, 42.0]],
  CA: [[-124.4, 40.4], [-124.2, 42.0], [-120.0, 42.0], [-120.0, 39.0], [-114.6, 35.0], [-114.7, 32.7], [-117.1, 32.5], [-120.6, 34.5], [-122.5, 37.8], [-124.4, 40.4]],
  NV: [[-120.0, 39.0], [-120.0, 42.0], [-114.0, 42.0], [-114.0, 37.0], [-114.6, 35.0], [-120.0, 39.0]],
  ID: [[-117.0, 44.2], [-117.0, 49.0], [-116.0, 49.0], [-114.4, 46.6], [-111.0, 44.5], [-111.0, 42.0], [-117.0, 42.0], [-117.0, 44.2]],
  MT: rectRing(-116.0, 44.5, -104.0, 49.0),
  WY: rectRing(-111.0, 41.0, -104.0, 45.0),
  UT: [[-114.0, 37.0], [-114.0, 42.0], [-111.0, 42.0], [-111.0, 41.0], [-109.0, 41.0], [-109.0, 37.0], [-114.0, 37.0]],
  AZ: rectRing(-114.7, 31.3, -109.0, 37.0),
  CO: rectRing(-109.0, 37.0, -102.0, 41.0),
  NM: rectRing(-109.0, 31.8, -103.0, 37.0),
  ND: rectRing(-104.0, 45.9, -96.6, 49.0),
  SD: rectRing(-104.0, 42.8, -96.4, 45.9),
  NE: [[-104.0, 41.0], [-104.0, 42.8], [-96.4, 42.8], [-95.4, 40.0], [-102.0, 40.0], [-102.0, 41.0], [-104.0, 41.0]],
  KS: rectRing(-102.0, 37.0, -94.6, 40.0),
  OK: [[-103.0, 36.5], [-103.0, 37.0], [-94.6, 37.0], [-94.5, 33.8], [-100.0, 34.5], [-100.0, 36.5], [-103.0, 36.5]],
  TX: [[-106.5, 31.8], [-103.0, 31.8], [-103.0, 36.5], [-100.0, 36.5], [-100.0, 34.5], [-94.0, 33.5], [-93.8, 29.8], [-97.1, 26.0], [-99.5, 27.5], [-103.0, 29.0], [-106.5, 31.8]],
  MN: [[-97.2, 49.0], [-92.0, 48.0], [-89.6, 48.0], [-92.1, 46.7], [-91.2, 43.5], [-96.4, 43.5], [-97.2, 49.0]],
  IA: rectRing(-96.5, 40.4, -90.4, 43.5),
  MO: rectRing(-95.5, 36.5, -89.5, 40.4),
  AR: rectRing(-94.5, 33.0, -89.7, 36.5),
  LA: [[-94.0, 29.8], [-94.0, 33.0], [-91.1, 33.0], [-91.2, 31.0], [-89.7, 31.0], [-89.2, 29.1], [-94.0, 29.8]],
  WI: rectRing(-92.8, 42.5, -87.0, 46.8),
  IL: rectRing(-91.4, 37.0, -87.5, 42.5),
  MI: [[-86.8, 41.8], [-86.5, 45.8], [-83.5, 45.8], [-82.5, 43.0], [-83.4, 41.8], [-86.8, 41.8]],
  IN: rectRing(-87.5, 37.9, -84.8, 41.8),
  OH: rectRing(-84.8, 38.6, -80.5, 41.9),
  KY: [[-89.5, 36.5], [-88.0, 37.9], [-84.8, 39.1], [-82.0, 37.5], [-83.7, 36.6], [-89.5, 36.5]],
  TN: rectRing(-90.0, 35.0, -81.7, 36.6),
  MS: rectRing(-91.5, 30.2, -88.1, 35.0),
  AL: rectRing(-88.5, 30.3, -85.0, 35.0),
  GA: [[-85.6, 35.0], [-83.1, 35.0], [-80.9, 32.0], [-81.5, 30.7], [-85.0, 30.7], [-85.6, 35.0]],
  FL: [[-87.5, 30.9], [-85.0, 30.9], [-81.5, 30.7], [-80.1, 25.4], [-81.2, 25.2], [-82.8, 27.9], [-84.3, 30.0], [-87.5, 30.3], [-87.5, 30.9]],
  SC: [[-83.3, 34.8], [-78.6, 33.9], [-80.9, 32.0], [-83.3, 34.8]],
  NC: [[-84.3, 35.0], [-81.7, 36.5], [-75.8, 36.5], [-75.5, 35.2], [-78.6, 33.9], [-84.3, 35.0]],
  VA: [[-83.7, 36.6], [-79.5, 38.5], [-77.3, 39.2], [-75.6, 38.0], [-75.9, 36.5], [-83.7, 36.6]],
  WV: rectRing(-82.5, 37.3, -78.8, 40.2),
  MD: rectRing(-79.5, 38.0, -75.2, 39.7),
  DE: rectRing(-75.8, 38.4, -75.0, 39.8),
  DC: rectRing(-77.2, 38.8, -76.9, 39.0),
  PA: rectRing(-80.5, 39.7, -74.9, 42.2),
  NJ: rectRing(-75.6, 39.0, -74.0, 41.3),
  NY: [[-79.8, 42.2], [-79.0, 43.3], [-76.0, 45.0], [-73.4, 45.0], [-73.5, 41.0], [-74.3, 40.5], [-75.4, 42.0], [-79.8, 42.2]],
  CT: rectRing(-73.7, 41.0, -71.8, 42.0),
  RI: rectRing(-71.9, 41.3, -71.1, 42.0),
  MA: rectRing(-73.5, 42.0, -70.0, 42.9),
  VT: rectRing(-73.4, 42.7, -71.5, 45.0),
  NH: rectRing(-72.5, 42.7, -70.7, 45.3),
  ME: [[-71.1, 43.1], [-70.7, 45.3], [-69.2, 47.4], [-67.8, 47.1], [-67.0, 44.8], [-70.3, 43.5], [-71.1, 43.1]],
  AK: [[-166.0, 54.5], [-165.0, 65.5], [-156.5, 71.2], [-141.0, 69.6], [-141.0, 60.0], [-134.0, 56.0], [-152.0, 58.0], [-166.0, 54.5]],
  HI: rectRing(-160.2, 19.0, -154.8, 22.2),
};

export const US_STATES_GEOJSON: FeatureCollection<Polygon, UsStateMetadata> = {
  type: 'FeatureCollection',
  features: US_STATE_METADATA.map((meta): Feature<Polygon, UsStateMetadata> => {
    const rawCoords = RAW_STATE_POLYGONS[meta.code] || rectRing(-99, 38, -97, 40);
    const ring = ensureClockwiseD3Ring(rawCoords);
    return {
      type: 'Feature',
      id: meta.code,
      properties: meta,
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
    };
  }),
};
