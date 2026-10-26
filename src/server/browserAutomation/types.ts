import type { DataBroker, RemovalWorkflowState, UserProfile } from '../../types/index.ts';
import type {
  ConsumerDisclosurePolicy,
  FormSafetyEvaluation,
  SemanticConsumerFieldRole,
} from '../../utils/optOutFormEngine.ts';
import type { CustomDnsLookupFn } from '../urlSafety.ts';

export type WorkflowExecutionMode = 'inspect_and_preview' | 'autonomous_auto_submit';

export type BlockerKind =
  | 'none'
  | 'recaptcha'
  | 'hcaptcha'
  | 'turnstile'
  | 'cloudflare_waf'
  | 'bot_interstitial'
  | 'login_required'
  | 'phone_otp_required'
  | 'excessive_id_demand'
  | 'ambiguous_record_match'
  | 'ambiguous_required_fields'
  | 'missing_profile_fields'
  | 'worker_unavailable'
  | 'network_or_ssrf_blocked';

export interface CandidateRecordMatch {
  candidateId: string;
  selector: string;
  actionType: 'click_button' | 'click_link' | 'check_radio' | 'check_checkbox' | 'navigate_url';
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

export interface LiveDomFieldMapping {
  fieldKey: string;
  selector: string;
  labelSelector?: string;
  tag: 'input' | 'select' | 'textarea' | 'custom_combobox' | 'custom_checkbox';
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

export interface WorkflowActionTraceStep {
  stepIndex: number;
  timestampIso: string;
  state: RemovalWorkflowState;
  action: string;
  url: string;
  httpStatus?: number;
  details: string;
}

export type PostSubmitOutcomeKind =
  | 'awaiting_broker_processing'
  | 'awaiting_email_verification'
  | 'submitted_unconfirmed'
  | 'validation_error'
  | 'rejected'
  | 'blocked';

export interface SubmissionEvidenceArtifact {
  internalSubmissionId: string;
  /**
   * Strictly null unless a genuine confirmation/ticket/reference identifier
   * was explicitly returned by the broker portal response.
   */
  brokerConfirmationCode: string | null;
  submittedAtIso: string;
  initialUrl: string;
  finalUrl: string;
  httpStatus: number;
  pageTitle: string;
  outcomeClassification: PostSubmitOutcomeKind;
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

export interface WorkflowBlockerInfo {
  kind: BlockerKind;
  summary: string;
  handoffUrl?: string;
  requiresHumanAction: boolean;
}

export interface RemovalWorkflowJob {
  jobId: string;
  idempotencyKey: string;
  sessionId: string;
  brokerId: string;
  brokerName: string;
  brokerDomain: string;
  adapterId: string;
  mode: WorkflowExecutionMode;
  state: RemovalWorkflowState;
  targetUrl: string;
  currentUrl: string;
  discoveredTitle: string;
  createdAtIso: string;
  updatedAtIso: string;
  attemptCount: number;
  maxAttempts: number;
  blocker: WorkflowBlockerInfo | null;
  candidateRecords: CandidateRecordMatch[];
  selectedCandidateId: string | null;
  mappedFields: LiveDomFieldMapping[];
  safetyEvaluation: FormSafetyEvaluation | null;
  disclosurePolicy: ConsumerDisclosurePolicy;
  internalSubmissionId: string;
  brokerConfirmationCode: string | null;
  evidence: SubmissionEvidenceArtifact | null;
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
  steps: WorkflowActionTraceStep[];
  errorMessage?: string;
}

export interface AutomationCapabilities {
  headlessBrowserAvailable: boolean;
  workerMode: 'local_playwright' | 'remote_worker' | 'unavailable';
  browserEngine: string;
  maxConcurrency: number;
  activeContexts: number;
  reason?: string;
}

export interface StartWorkflowOptions {
  sessionId: string;
  broker?: DataBroker;
  brokerId?: string;
  brokerName?: string;
  brokerDomain?: string;
  targetUrl?: string;
  profile: UserProfile;
  senderEmail?: string;
  mode?: WorkflowExecutionMode;
  disclosurePolicy?: Partial<ConsumerDisclosurePolicy>;
  fieldOverrides?: Record<string, string>;
  selectedCandidateId?: string;
  idempotencyKey?: string;
  /**
   * Test-only hooks for controlled integration and security verification.
   */
  allowLoopbackForTests?: boolean;
  dnsLookupForTests?: CustomDnsLookupFn;
  forceWorkerUnavailableForTests?: boolean;
}
