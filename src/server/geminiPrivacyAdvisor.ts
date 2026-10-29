import { GoogleGenAI, GenerateContentResponse, Content } from '@google/genai';

export type AdvisorRoleId = 'statutory_counsel' | 'broker_researcher' | 'rapid_triage';

export type AdvisorSpeedMode = 'grounded_standard' | 'fast_lite';

export interface GroundingCitation {
  uri: string;
  title: string;
}

export interface AdvisorHistoryItem {
  role: 'user' | 'model';
  text: string;
}

export interface SanitizedScanContext {
  jurisdictionState?: string;
  exposureScore?: number;
  totalBrokersScanned?: number;
  exposedCount?: number;
  inProgressCount?: number;
  removedCount?: number;
  topExposedBrokers?: Array<{
    name: string;
    domain: string;
    risk: string;
    removalStatus?: string;
  }>;
}

export interface MultiTurnChatResult {
  replyText: string;
  citations: GroundingCitation[];
  searchQueries: string[];
  modelUsed: 'gemini-3.8-flash' | 'gemini-3.1-flash-lite';
  roleId: AdvisorRoleId;
  groundedWithSearch: boolean;
  timestampIso: string;
}

export interface BrokerLiveIntelResult {
  brokerName: string;
  brokerDomain: string;
  summaryText: string;
  citations: GroundingCitation[];
  searchQueries: string[];
  modelUsed: 'gemini-3.8-flash';
  checkedAtIso: string;
}

const ROLE_SYSTEM_INSTRUCTIONS: Record<AdvisorRoleId, string> = {
  statutory_counsel: `You are synOUT's Statutory Privacy & Opt-Out Counsel.
Your role is to give clear, accurate, plain-English consumer privacy guidance grounded in US state and federal privacy statutes, including:
- California CCPA / CPRA (Cal. Civ. Code § 1798.105 right to delete, § 1798.120 right to opt out, 11 CCR § 7060 data minimization prohibiting unnecessary government ID demands) and the California Delete Act (SB 362 / CPPA DROP registry).
- Texas Data Privacy and Security Act (TDPSA), Oregon Consumer Privacy Act (OCPA), Virginia VCDPA, Colorado CPA, and state data broker registration laws (CA, TX, OR, VT).
- Fair Credit Reporting Act (FCRA) for specialty consumer reporting bureaus (LexisNexis, ChexSystems, NCTUE) vs. unregulated people-search data brokers.
Keep answers structured, actionable, and easy for everyday consumers to follow without legalistic intimidation. Never ask the user to paste SSNs, unredacted IDs, or passwords.`,

  broker_researcher: `You are synOUT's Live Data Broker & Portal Researcher.
Your role is to verify current, real-world opt-out procedures, parent clearinghouse networks (such as PeopleConnect / Intelius / TruthFinder, BeenVerified, Spokeo, Whitepages, Radaris, Acxiom, LexisNexis), verification steps (email link vs. online form vs. phone code), and recent regulator enforcement actions.
When Google Search grounding is active, prioritize current official opt-out URLs, step-by-step removal updates, and regulatory advisories. Summarize steps clearly so the user knows whether synOUT's automated web-form runner or legal email demand is the fastest path.`,

  rapid_triage: `You are synOUT's Rapid Exposure Triage Specialist.
Your role is to deliver concise, prioritized action plans in 3 to 5 bullet points:
1. Rank which exposed brokers carry the highest doxxing, identity-theft, or financial risk.
2. Tell the user the fastest removal action for each tier (Automated Online Form vs. Statutory Deletion Email vs. Bureau Freeze).
3. Explain how to handle broker pushback (such as unlawful Driver's License requests or false public-record exemption claims) in one step.
Keep responses brief, scannable, and direct.`,
};

function scrubPiiTokens(input: string): string {
  if (!input) return '';
  return input
    .replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, '[REDACTED_SSN]')
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[REDACTED_CARD]');
}

export function buildAdvisorSystemInstruction(
  roleId: AdvisorRoleId,
  scanContext?: SanitizedScanContext
): string {
  const base = ROLE_SYSTEM_INSTRUCTIONS[roleId] || ROLE_SYSTEM_INSTRUCTIONS.statutory_counsel;
  if (!scanContext) {
    return base;
  }

  const lines: string[] = [base, '', 'Current Audited Workspace Summary (Non-Sensitive):'];
  if (scanContext.jurisdictionState) {
    lines.push(`- Primary Consumer Jurisdiction State: ${scanContext.jurisdictionState}`);
  }
  if (typeof scanContext.exposureScore === 'number') {
    lines.push(`- Current Exposure Score: ${scanContext.exposureScore}/100`);
  }
  if (typeof scanContext.totalBrokersScanned === 'number') {
    lines.push(
      `- Scan Breakdown: ${scanContext.exposedCount ?? 0} exposed out of ${scanContext.totalBrokersScanned} brokers scanned (${scanContext.inProgressCount ?? 0} removals in progress, ${scanContext.removedCount ?? 0} confirmed removed).`
    );
  }
  if (Array.isArray(scanContext.topExposedBrokers) && scanContext.topExposedBrokers.length > 0) {
    const sample = scanContext.topExposedBrokers
      .slice(0, 12)
      .map(
        (b) =>
          `${b.name} (${b.domain}, ${b.risk} risk, status: ${b.removalStatus || 'found'})`
      )
      .join('; ');
    lines.push(`- Priority Exposed Brokers in Dossier: ${sample}`);
  }

  return lines.join('\n');
}

export function extractGroundingMetadataFromResponse(
  response: GenerateContentResponse
): { citations: GroundingCitation[]; searchQueries: string[] } {
  const metadata = response.candidates?.[0]?.groundingMetadata;
  const rawChunks = metadata?.groundingChunks || [];
  const seenUris = new Set<string>();
  const citations: GroundingCitation[] = [];

  for (const chunk of rawChunks) {
    const uri = chunk?.web?.uri?.trim();
    if (!uri || !/^https?:\/\//i.test(uri)) continue;
    if (seenUris.has(uri)) continue;
    seenUris.add(uri);

    let fallbackTitle = uri;
    try {
      fallbackTitle = new URL(uri).hostname.replace(/^www\./, '');
    } catch {
      // Keep raw URI fallback
    }

    citations.push({
      uri,
      title: (chunk?.web?.title || fallbackTitle).trim().slice(0, 140),
    });
  }

  const rawQueries = metadata?.webSearchQueries;
  const searchQueries = Array.isArray(rawQueries)
    ? rawQueries
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .map((q) => q.trim().slice(0, 120))
        .slice(0, 6)
    : [];

  return { citations, searchQueries };
}

export function classifyGeminiServerError(err: unknown): {
  httpStatus: number;
  userMessage: string;
} {
  const rawMessage = err instanceof Error ? err.message : String(err || 'Unexpected error');
  const statusMatch = (err as { status?: number })?.status;

  if (
    statusMatch === 403 ||
    statusMatch === 401 ||
    /PERMISSION_DENIED|API_KEY_INVALID|API key not valid|not configured/i.test(rawMessage)
  ) {
    return {
      httpStatus: 403,
      userMessage:
        'Privacy Advisor could not authenticate with the attached API key. Please verify your API key in the Settings > Secrets panel.',
    };
  }

  if (statusMatch === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(rawMessage)) {
    return {
      httpStatus: 429,
      userMessage:
        'API request quota reached. Wait a moment and try again, or select a billing-enabled API key in the Settings > Secrets panel for higher throughput.',
    };
  }

  return {
    httpStatus: 502,
    userMessage: `Privacy Advisor request failed: ${rawMessage.slice(0, 220)}`,
  };
}

function getServerGenAiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please check your attached API key in the Settings > Secrets panel.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function runMultiTurnPrivacyChat(params: {
  message: string;
  history?: AdvisorHistoryItem[];
  roleId?: AdvisorRoleId;
  speedMode?: AdvisorSpeedMode;
  useSearchGrounding?: boolean;
  scanContext?: SanitizedScanContext;
}): Promise<MultiTurnChatResult> {
  const ai = getServerGenAiClient();
  const roleId: AdvisorRoleId =
    params.roleId === 'broker_researcher' || params.roleId === 'rapid_triage'
      ? params.roleId
      : 'statutory_counsel';

  const groundedWithSearch = Boolean(params.useSearchGrounding);
  // Google Search grounding uses gemini-3.8-flash; Fast Triage without web search uses gemini-3.1-flash-lite
  const modelUsed: 'gemini-3.8-flash' | 'gemini-3.1-flash-lite' =
    groundedWithSearch || params.speedMode !== 'fast_lite'
      ? 'gemini-3.8-flash'
      : 'gemini-3.1-flash-lite';

  const systemInstruction = buildAdvisorSystemInstruction(roleId, params.scanContext);

  const sanitizedHistory: Content[] = (params.history || [])
    .filter(
      (item) =>
        item &&
        (item.role === 'user' || item.role === 'model') &&
        typeof item.text === 'string' &&
        item.text.trim().length > 0
    )
    .slice(-20)
    .map((item) => ({
      role: item.role,
      parts: [{ text: scrubPiiTokens(item.text.trim().slice(0, 4000)) }],
    }));

  const cleanMessage = scrubPiiTokens(params.message.trim().slice(0, 3000));

  const chat = ai.chats.create({
    model: modelUsed,
    history: sanitizedHistory,
    config: {
      systemInstruction,
      ...(groundedWithSearch ? { tools: [{ googleSearch: {} }] } : {}),
    },
  });

  const response: GenerateContentResponse = await chat.sendMessage({
    message: cleanMessage,
  });

  const replyText =
    scrubPiiTokens(response.text || '').trim() ||
    'No response text returned for that query. Please try rephrasing your question.';

  const { citations, searchQueries } = extractGroundingMetadataFromResponse(response);

  return {
    replyText,
    citations,
    searchQueries,
    modelUsed,
    roleId,
    groundedWithSearch,
    timestampIso: new Date().toISOString(),
  };
}

export async function lookupBrokerLiveSearchIntel(params: {
  brokerName: string;
  brokerDomain: string;
  optOutUrl?: string;
  jurisdictionState?: string;
}): Promise<BrokerLiveIntelResult> {
  const ai = getServerGenAiClient();
  const brokerName = params.brokerName.trim().slice(0, 100);
  const brokerDomain = params.brokerDomain.trim().toLowerCase().slice(0, 140);
  const stateClause = params.jurisdictionState
    ? `Consumer resident state: ${params.jurisdictionState.slice(0, 30)}.`
    : '';
  const knownOptOutClause = params.optOutUrl
    ? `Catalog opt-out URL on file: ${params.optOutUrl.slice(0, 260)}.`
    : '';

  const prompt = `Search current web information for the data broker "${brokerName}" (${brokerDomain}). ${knownOptOutClause} ${stateClause}
Provide a concise 3-part operational brief (under 140 words total):
1. Current Official Opt-Out Portal & Parent Network (confirm if URL or parent company changed).
2. Verification Requirements (e.g., email confirmation link, web form checkboxes, CAPTCHA, or statutory email acceptance).
3. Recent State Data Broker Registry or Privacy Enforcement Notes.`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: {
      systemInstruction: ROLE_SYSTEM_INSTRUCTIONS.broker_researcher,
      tools: [{ googleSearch: {} }],
    },
  });

  const summaryText =
    scrubPiiTokens(response.text || '').trim() ||
    `Unable to retrieve additional web intelligence for ${brokerName} (${brokerDomain}).`;
  const { citations, searchQueries } = extractGroundingMetadataFromResponse(response);

  return {
    brokerName,
    brokerDomain,
    summaryText,
    citations,
    searchQueries,
    modelUsed: 'gemini-3.8-flash',
    checkedAtIso: new Date().toISOString(),
  };
}
