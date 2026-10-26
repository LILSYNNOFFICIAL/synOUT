import {
  DataBroker,
  RemovalWorkflowState,
  UserProfile,
  VerificationSourceType,
} from '../types';
import {
  COMMON_OPTOUT_PATHS,
  type ConsumerDisclosurePolicy,
  type DiscoveredOptOutCandidate,
  type FormSafetyEvaluation,
  type OptOutDiscoveryReport,
  type OptOutPageInspection,
  type SemanticConsumerFieldRole,
  inspectRawOptOutHtml,
  isSafePublicOptOutUrl,
  scoreOptOutLinkCandidate,
} from '../utils/optOutFormEngine';
import { sessionFetch } from './sessionClient';

export interface ClientWebFormRelayResponse {
  success: boolean;
  httpStatus: number;
  finalUrl: string;
  internalSubmissionId: string;
  brokerConfirmationCode: string | null;
  confirmationTicket: string;
  outcomeClassification?:
    | 'awaiting_broker_processing'
    | 'awaiting_email_verification'
    | 'submitted_unconfirmed'
    | 'validation_error'
    | 'rejected'
    | 'blocked';
  outcomeSummary?: string;
  requiresBrowserCaptcha: boolean;
  antiBotGate: string;
  responseExcerpt: string;
  error?: string;
}

export type ClientWorkflowExecutionMode = 'inspect_and_preview' | 'autonomous_auto_submit';

export interface ClientCandidateRecordMatch {
  candidateId: string;
  selector: string;
  actionType: 'click_button' | 'click_link' | 'check_radio' | 'navigate_url';
  targetUrl?: string;
  fullName: string;
  age?: string;
  locations: string[];
  relatives: string[];
  rawSnippet: string;
  confidenceScore: number;
  disqualifiedHomonym: boolean;
  disqualifiedReason?: string;
  matchSignals: string[];
}

export interface ClientLiveDomFieldMapping {
  fieldKey: string;
  selector: string;
  tag: 'input' | 'select' | 'textarea' | 'custom_combobox';
  inputType: string;
  name: string;
  id: string;
  label: string;
  placeholder: string;
  required: boolean;
  options: Array<{ value: string; label: string }>;
  semanticRole: SemanticConsumerFieldRole;
  confidence: number;
  confidenceSignals: string[];
  disclosureAllowed: boolean;
  skipReason?: string;
  plannedValue: string;
  maskedPreview: string;
  preserveOriginalHidden: boolean;
}

export interface ClientWorkflowActionTraceStep {
  stepIndex: number;
  timestampIso: string;
  state: RemovalWorkflowState;
  action: string;
  url: string;
  httpStatus?: number;
  details: string;
}

export interface ClientSubmissionEvidenceArtifact {
  internalSubmissionId: string;
  brokerConfirmationCode: string | null;
  submittedAtIso: string;
  initialUrl: string;
  finalUrl: string;
  httpStatus: number;
  pageTitle: string;
  outcomeClassification:
    | 'awaiting_broker_processing'
    | 'awaiting_email_verification'
    | 'submitted_unconfirmed'
    | 'validation_error'
    | 'rejected'
    | 'blocked';
  outcomeSummary: string;
  domSnapshotSha256: string;
  evidenceManifestSha256: string;
  redactedResponseExcerpt: string;
  fieldAudit: Array<{
    fieldKey: string;
    label: string;
    semanticRole: string;
    confidence: number;
    maskedValue: string;
    populated: boolean;
  }>;
}

export interface ClientWorkflowBlockerInfo {
  kind: string;
  summary: string;
  handoffUrl?: string;
  requiresHumanAction: boolean;
}

export interface ClientRemovalWorkflowJob {
  jobId: string;
  idempotencyKey: string;
  sessionId: string;
  brokerId: string;
  brokerName: string;
  brokerDomain: string;
  adapterId: string;
  mode: ClientWorkflowExecutionMode;
  state: RemovalWorkflowState;
  targetUrl: string;
  currentUrl: string;
  discoveredTitle: string;
  createdAtIso: string;
  updatedAtIso: string;
  attemptCount: number;
  maxAttempts: number;
  blocker: ClientWorkflowBlockerInfo | null;
  candidateRecords: ClientCandidateRecordMatch[];
  selectedCandidateId: string | null;
  mappedFields: ClientLiveDomFieldMapping[];
  safetyEvaluation: FormSafetyEvaluation | null;
  disclosurePolicy: ConsumerDisclosurePolicy;
  internalSubmissionId: string;
  brokerConfirmationCode: string | null;
  evidence: ClientSubmissionEvidenceArtifact | null;
  ssrfBlockedRequests: string[];
  emailVerification: {
    verifiedAtIso: string;
    finalUrl: string;
    httpStatus: number;
    brokerConfirmationCode: string | null;
    summary: string;
  } | null;
  recheckResult: {
    checkedAtIso: string;
    listingStillPresent: boolean;
    verifiedRemoved: boolean;
    summary: string;
    httpStatus: number;
  } | null;
  steps: ClientWorkflowActionTraceStep[];
  errorMessage?: string;
}

export interface ClientAutomationCapabilities {
  headlessBrowserAvailable: boolean;
  workerMode: 'local_playwright' | 'remote_worker' | 'unavailable';
  browserEngine: string;
  maxConcurrency: number;
  activeContexts: number;
  reason?: string;
}

export interface LivePortalProbeResponse {
  probeUrl: string;
  finalUrl: string;
  httpStatus: number;
  liveProbeStatus:
    | 'listing_matched'
    | 'portal_reachable'
    | 'no_listing_found'
    | 'anti_bot_gated'
    | 'unreachable';
  verificationSource: VerificationSourceType;
  summary: string;
}

/**
 * Builds deterministic client-side opt-out candidates when running on a static host (e.g. GitHub Pages)
 * where the server-side HTML spider is unavailable.
 */
export function buildStaticFallbackDiscoveryReport(params: {
  domainOrUrl: string;
  knownOptOutUrl?: string;
  broker?: DataBroker;
}): OptOutDiscoveryReport {
  const safe = isSafePublicOptOutUrl(params.domainOrUrl);
  if (!safe.valid) {
    throw new Error(safe.reason || 'Enter a valid public website domain or URL.');
  }

  const origin = new URL(safe.normalizedUrl).origin;
  const candidates: DiscoveredOptOutCandidate[] = [];

  if (params.knownOptOutUrl && isSafePublicOptOutUrl(params.knownOptOutUrl).valid) {
    const cleanKnown = isSafePublicOptOutUrl(params.knownOptOutUrl).normalizedUrl;
    candidates.push({
      url: cleanKnown,
      anchorText: params.broker
        ? `${params.broker.name} Official Opt-Out Portal`
        : 'Known Opt-Out Endpoint',
      score: 90,
      signals: ['Verified Catalog Endpoint'],
      isThirdPartyPortal: false,
    });
  }

  for (const pathSlug of COMMON_OPTOUT_PATHS.slice(0, 10)) {
    const candidateUrl = `${origin}${pathSlug}`;
    if (candidates.some((c) => c.url === candidateUrl)) continue;
    const scored = scoreOptOutLinkCandidate({
      url: candidateUrl,
      baseDomain: safe.hostname,
    });
    candidates.push({
      url: candidateUrl,
      anchorText: `Common Broker Route: ${pathSlug}`,
      score: Math.max(30, scored.score),
      signals: scored.signals.length > 0 ? scored.signals : ['Heuristic Path Candidate'],
      isThirdPartyPortal: false,
    });
  }

  return {
    queriedDomain: safe.hostname,
    normalizedStartUrl: origin,
    scannedAtIso: new Date().toISOString(),
    bestCandidate: candidates[0] || null,
    bestInspection: null,
    candidates,
    probedUrlsCount: 0,
    fallbackReason:
      'Running in static browser-only mode: use the 1-Click Search Engine Opt-Out Finders, paste page HTML to inspect fields, or drag the Universal Auto-Fill Bookmarklet.',
  };
}

/**
 * Discovers arbitrarily-titled opt-out pages on any broker domain via backend spider,
 * gracefully falling back to heuristic + search-dork candidates on static hosts.
 */
export async function discoverOptOutPagesClient(params: {
  domainOrUrl: string;
  knownOptOutUrl?: string;
  profile?: UserProfile;
  senderEmail?: string;
  broker?: DataBroker;
}): Promise<OptOutDiscoveryReport> {
  const safe = isSafePublicOptOutUrl(params.domainOrUrl);
  if (!safe.valid) {
    throw new Error(safe.reason || 'Enter a valid domain or https:// URL.');
  }

  try {
    const res = await sessionFetch('/api/optout/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domainOrUrl: safe.normalizedUrl,
        knownOptOutUrl: params.knownOptOutUrl,
        profile: params.profile,
        senderEmail: params.senderEmail,
        broker: params.broker,
      }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.status === 404 || res.status === 405 || !contentType.includes('application/json')) {
      return buildStaticFallbackDiscoveryReport(params);
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Opt-out discovery scan failed.');
    }
    return data as OptOutDiscoveryReport;
  } catch (err) {
    if (err instanceof Error && /Invalid|Blocked|Malformed/i.test(err.message)) {
      throw err;
    }
    return buildStaticFallbackDiscoveryReport(params);
  }
}

/**
 * Inspects a specific opt-out URL's HTML forms and maps fields to the user's profile.
 */
export async function inspectOptOutUrlClient(params: {
  url: string;
  profile?: UserProfile;
  senderEmail?: string;
  broker?: DataBroker;
}): Promise<OptOutPageInspection> {
  const safe = isSafePublicOptOutUrl(params.url);
  if (!safe.valid) {
    throw new Error(safe.reason || 'Enter a valid opt-out page URL.');
  }

  const res = await sessionFetch('/api/optout/inspect-form', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: safe.normalizedUrl,
      profile: params.profile,
      senderEmail: params.senderEmail,
      broker: params.broker,
    }),
  });

  const contentType = res.headers.get('content-type') || '';
  if (res.status === 404 || res.status === 405 || !contentType.includes('application/json')) {
    throw new Error(
      'Live server form fetch is unavailable on static hosting. Open the page in a tab and use the 1-Click Auto-Fill Bookmarklet, or paste the page HTML source below.'
    );
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Could not inspect opt-out page HTML.');
  }
  return data as OptOutPageInspection;
}

/**
 * Parses user-pasted raw HTML source directly in the browser (works 100% offline / behind Cloudflare).
 */
export function inspectPastedHtmlClient(params: {
  rawHtml: string;
  pageUrl: string;
  profile?: UserProfile;
  senderEmail?: string;
  broker?: DataBroker;
}): OptOutPageInspection {
  if (!params.rawHtml || params.rawHtml.trim().length < 15) {
    throw new Error('Paste the HTML source from the broker opt-out page to analyze its form fields.');
  }
  return inspectRawOptOutHtml({
    html: params.rawHtml,
    pageUrl: params.pageUrl || 'https://broker-optout.example/optout',
    httpStatus: 200,
    profile: params.profile,
    senderEmail: params.senderEmail,
    broker: params.broker,
  });
}

/**
 * Submits mapped opt-out form fields via backend HTTP relay (with Sec-GPC: 1).
 */
export async function submitOptOutWebFormClient(params: {
  actionUrl: string;
  method: 'GET' | 'POST';
  fields: Record<string, string>;
  refererUrl?: string;
  brokerId?: string;
  brokerName?: string;
  brokerDomain?: string;
}): Promise<ClientWebFormRelayResponse> {
  const res = await sessionFetch('/api/optout/submit-web-form', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const contentType = res.headers.get('content-type') || '';
  if (res.status === 404 || res.status === 405 || !contentType.includes('application/json')) {
    throw new Error(
      'Direct server form relay is unavailable on static hosting. Open the opt-out page and run the synOUT 1-Click Auto-Fill Bookmarklet.'
    );
  }

  const data = await res.json();
  if (!res.ok && !data.internalSubmissionId) {
    throw new Error(data.error || 'Web form relay failed.');
  }
  return data as ClientWebFormRelayResponse;
}

/**
 * Queries server-side headless browser automation capabilities.
 */
export async function getWorkflowCapabilitiesClient(): Promise<ClientAutomationCapabilities> {
  try {
    const res = await sessionFetch('/api/workflows/capabilities');
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      return {
        headlessBrowserAvailable: false,
        workerMode: 'unavailable',
        browserEngine: 'static-client-only',
        maxConcurrency: 0,
        activeContexts: 0,
        reason: 'Headless browser backend is not reachable on this static host. Use the 1-Click Browser Auto-Fill Bookmarklet.',
      };
    }
    return (await res.json()) as ClientAutomationCapabilities;
  } catch {
    return {
      headlessBrowserAvailable: false,
      workerMode: 'unavailable',
      browserEngine: 'static-client-only',
      maxConcurrency: 0,
      activeContexts: 0,
      reason: 'Headless browser backend is offline. Use the 1-Click Browser Auto-Fill Bookmarklet.',
    };
  }
}

export async function listSessionWorkflowsClient(): Promise<ClientRemovalWorkflowJob[]> {
  try {
    const res = await sessionFetch('/api/workflows');
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) return [];
    const data = await res.json();
    return Array.isArray(data.jobs) ? (data.jobs as ClientRemovalWorkflowJob[]) : [];
  } catch {
    return [];
  }
}

export async function startWorkflowClient(params: {
  broker?: DataBroker;
  brokerId?: string;
  brokerName?: string;
  brokerDomain?: string;
  targetUrl?: string;
  profile: UserProfile;
  senderEmail?: string;
  mode: ClientWorkflowExecutionMode;
  disclosurePolicy?: Partial<ConsumerDisclosurePolicy>;
  fieldOverrides?: Record<string, string>;
  selectedCandidateId?: string;
  idempotencyKey?: string;
}): Promise<ClientRemovalWorkflowJob> {
  const res = await sessionFetch('/api/workflows/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const contentType = res.headers.get('content-type') || '';
  if (res.status === 404 || res.status === 405 || !contentType.includes('application/json')) {
    throw new Error(
      'Autonomous headless browser runner requires the synOUT backend server. On static hosting, open the opt-out page and run the 1-Click Auto-Fill Bookmarklet.'
    );
  }

  const data = await res.json();
  if (!res.ok || !data.job) {
    throw new Error(data.error || 'Could not start headless opt-out workflow.');
  }
  return data.job as ClientRemovalWorkflowJob;
}

export async function approveAndSubmitWorkflowClient(params: {
  jobId: string;
  fieldOverrides?: Record<string, string>;
  disclosurePolicy?: Partial<ConsumerDisclosurePolicy>;
  selectedCandidateId?: string;
}): Promise<ClientRemovalWorkflowJob> {
  const res = await sessionFetch(
    `/api/workflows/${encodeURIComponent(params.jobId)}/approve-and-submit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fieldOverrides: params.fieldOverrides,
        disclosurePolicy: params.disclosurePolicy,
        selectedCandidateId: params.selectedCandidateId,
      }),
    }
  );

  const data = await res.json();
  if (!res.ok || !data.job) {
    throw new Error(data.error || 'Workflow approval & submission failed.');
  }
  return data.job as ClientRemovalWorkflowJob;
}

export async function completeWorkflowEmailVerificationClient(params: {
  jobId: string;
  verificationUrl: string;
  rawEmailText?: string;
}): Promise<ClientRemovalWorkflowJob> {
  const res = await sessionFetch(
    `/api/workflows/${encodeURIComponent(params.jobId)}/verify-email`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verificationUrl: params.verificationUrl,
        rawEmailText: params.rawEmailText,
      }),
    }
  );

  const data = await res.json();
  if (!res.ok || !data.job) {
    throw new Error(data.error || 'Email verification link check failed.');
  }
  return data.job as ClientRemovalWorkflowJob;
}

export async function recheckWorkflowRemovalClient(params: {
  jobId: string;
  checkUrl?: string;
}): Promise<ClientRemovalWorkflowJob> {
  const res = await sessionFetch(
    `/api/workflows/${encodeURIComponent(params.jobId)}/recheck`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkUrl: params.checkUrl }),
    }
  );

  const data = await res.json();
  if (!res.ok || !data.job) {
    throw new Error(data.error || 'Post-submission listing re-check failed.');
  }
  return data.job as ClientRemovalWorkflowJob;
}

export async function recordManualHandoffClient(params: {
  jobId: string;
  userProvidedConfirmationCode?: string;
  requiresEmailVerification?: boolean;
}): Promise<ClientRemovalWorkflowJob> {
  const res = await sessionFetch(
    `/api/workflows/${encodeURIComponent(params.jobId)}/handoff-complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userProvidedConfirmationCode: params.userProvidedConfirmationCode,
        requiresEmailVerification: params.requiresEmailVerification,
      }),
    }
  );

  const data = await res.json();
  if (!res.ok || !data.job) {
    throw new Error(data.error || 'Could not record manual browser handoff.');
  }
  return data.job as ClientRemovalWorkflowJob;
}

export async function cancelWorkflowClient(jobId: string): Promise<ClientRemovalWorkflowJob> {
  const res = await sessionFetch(`/api/workflows/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok || !data.job) {
    throw new Error(data.error || 'Could not cancel workflow.');
  }
  return data.job as ClientRemovalWorkflowJob;
}

export async function runLivePortalProbeClient(params: {
  broker: DataBroker;
  profile: UserProfile;
}): Promise<LivePortalProbeResponse> {
  const res = await sessionFetch('/api/scan/live-probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const contentType = res.headers.get('content-type') || '';
  if (res.status === 404 || res.status === 405 || !contentType.includes('application/json')) {
    throw new Error('Live server portal probe requires the synOUT backend server.');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Live portal probe failed.');
  }
  return data as LivePortalProbeResponse;
}
