import crypto from 'node:crypto';
import type { Page } from 'playwright-core';
import type { RemovalWorkflowState, UserProfile } from '../../types/index.ts';
import {
  type ConsumerDisclosurePolicy,
  DEFAULT_DISCLOSURE_POLICY,
} from '../../utils/optOutFormEngine.ts';
import { crawlDomainForOptOutPages } from '../optOutCrawler.ts';
import { assertSafeOutboundUrl, redactPiiForLogs } from '../urlSafety.ts';
import {
  getAutomationCapabilities,
  withIsolatedPlaywrightPage,
} from './BrowserAutomationService.ts';
import {
  dismissBlockingCookieBannersOnPage,
  extractAndMapLiveDomFields,
  handlePostSubmitConfirmationPopupOnPage,
  populateMappedFieldsOnPage,
  sweepDynamicConsentCheckboxesOnPage,
} from './FormFieldMapper.ts';
import { buildSubmissionEvidenceArtifact } from './SubmissionEvidence.ts';
import type {
  RemovalWorkflowJob,
  StartWorkflowOptions,
  WorkflowExecutionMode,
} from './types.ts';
import {
  classifyPostSubmitOutcome,
  detectLivePageBlocker,
  extractAndScoreCandidateRecords,
  extractGenuineBrokerConfirmationCode,
  validateInboundVerificationLink,
} from './VerificationDetector.ts';
import {
  enrichFieldOverridesWithAdapter,
  resolveBrokerPlaybook,
  runAdapterPreStepHooks,
} from './BrokerAdapters.ts';

const MAX_JOBS_PER_SESSION = 100;
const MAX_WIZARD_STEPS = 4;

/**
 * Session-partitioned in-memory workflow store.
 * Session A can never read, resume, approve, or cancel Session B's jobs.
 */
const jobsById = new Map<string, RemovalWorkflowJob>();
const idempotencyIndex = new Map<string, string>();
const jobRuntimeOptions = new Map<
  string,
  {
    profile: UserProfile;
    senderEmail?: string;
    allowLoopbackForTests?: boolean;
    dnsLookupForTests?: StartWorkflowOptions['dnsLookupForTests'];
  }
>();

function appendJobStep(
  job: RemovalWorkflowJob,
  state: RemovalWorkflowState,
  action: string,
  url: string,
  details: string,
  httpStatus?: number
): void {
  job.state = state;
  job.updatedAtIso = new Date().toISOString();
  job.steps.push({
    stepIndex: job.steps.length + 1,
    timestampIso: job.updatedAtIso,
    state,
    action,
    url,
    httpStatus,
    details: redactPiiForLogs(details).slice(0, 320),
  });
}

function buildCanonicalIdempotencyKey(params: {
  sessionId: string;
  brokerId: string;
  targetUrl: string;
  mode: WorkflowExecutionMode;
  explicitKey?: string;
}): string {
  if (params.explicitKey && params.explicitKey.trim()) {
    return `${params.sessionId}:explicit:${params.explicitKey.trim().slice(0, 120)}`;
  }
  return crypto
    .createHash('sha256')
    .update(`${params.sessionId}:${params.brokerId}:${params.targetUrl}:${params.mode}`)
    .digest('hex');
}

function enforceSessionJobQuota(sessionId: string): void {
  const sessionJobs = Array.from(jobsById.values())
    .filter((j) => j.sessionId === sessionId)
    .sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));

  while (sessionJobs.length >= MAX_JOBS_PER_SESSION) {
    const oldest = sessionJobs.shift();
    if (oldest) {
      jobsById.delete(oldest.jobId);
      jobRuntimeOptions.delete(oldest.jobId);
    }
  }
}

async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => null);
  // Allow client-side React/Vue/SPA hydration to mount form controls
  await page.waitForTimeout(180);
}

/**
 * Inspects, searches/matches records, steps through multi-step wizards, and optionally submits
 * the target opt-out form inside an isolated SSRF-guarded Playwright page.
 */
async function executePageWorkflowPass(params: {
  job: RemovalWorkflowJob;
  page: Page;
  ssrfBlockedUrls: string[];
  profile: UserProfile;
  senderEmail?: string;
  fieldOverrides?: Record<string, string>;
  selectedCandidateId?: string;
  submitNow: boolean;
  allowLoopbackForTests?: boolean;
  dnsLookupForTests?: StartWorkflowOptions['dnsLookupForTests'];
}): Promise<void> {
  const { job, page, profile, senderEmail } = params;

  await assertSafeOutboundUrl(job.targetUrl, {
    allowLoopbackForTests: params.allowLoopbackForTests,
    dnsLookup: params.dnsLookupForTests,
  });

  appendJobStep(job, 'inspecting', 'NAVIGATE_PORTAL', job.targetUrl, `Opening ${job.targetUrl} in isolated headless browser context.`);

  const navRes = await page.goto(job.targetUrl, { waitUntil: 'domcontentloaded', timeout: 14000 });
  await waitForPageReady(page);
  await dismissBlockingCookieBannersOnPage(page);

  const initialStatus = navRes?.status() ?? 200;
  job.currentUrl = page.url();
  job.discoveredTitle = (await page.title().catch(() => '')) || job.brokerName;
  job.ssrfBlockedRequests = [...params.ssrfBlockedUrls];

  const checkBlocker = async (statusHint: number): Promise<boolean> => {
    const html = await page.content().catch(() => '');
    const visibleText = await page
      .evaluate(() => document.body?.innerText || '')
      .catch(() => '');
    const blocker = detectLivePageBlocker({
      html,
      visibleText,
      url: page.url(),
      httpStatus: statusHint,
    });
    if (blocker) {
      job.blocker = blocker;
      appendJobStep(job, 'blocked', 'BLOCKER_DETECTED', page.url(), blocker.summary, statusHint);
      return true;
    }
    return false;
  };

  if (await checkBlocker(initialStatus)) {
    return;
  }

  const desiredCandidateId = params.selectedCandidateId || job.selectedCandidateId || null;
  let candidateSelectedInPass = false;
  const activePlaybook = resolveBrokerPlaybook(job.brokerDomain || job.brokerId);
  let adapterListingUrl: string | null = null;

  // Multi-step navigation loop (handles Record Search -> Candidate Selection -> Step 1/2 -> Final Form)
  for (let wizardStep = 0; wizardStep < MAX_WIZARD_STEPS; wizardStep++) {
    job.currentUrl = page.url();
    job.discoveredTitle = (await page.title().catch(() => '')) || job.discoveredTitle;

    if (activePlaybook) {
      const hookRes = await runAdapterPreStepHooks({
        page,
        playbook: activePlaybook,
        profile,
      });
      if (hookRes.extractedListingUrl) {
        adapterListingUrl = hookRes.extractedListingUrl;
      }
      if (hookRes.actionsTaken.length > 0 && wizardStep === 0) {
        appendJobStep(
          job,
          'inspecting',
          'ADAPTER_PLAYBOOK_APPLIED',
          page.url(),
          `${activePlaybook.brokerName} adapter: ${hookRes.actionsTaken.join('; ')}`
        );
      }
    }

    // 1. Check if candidate listing records are rendered on the current view
    const candidates = await extractAndScoreCandidateRecords(page, profile);
    const nonDisqualified = candidates.filter((c) => !c.disqualifiedHomonym);

    const selectCandidateOnPage = async (cand: (typeof candidates)[number]) => {
      const loc = page.locator(cand.selector).first();
      if (cand.actionType === 'check_checkbox' || cand.actionType === 'check_radio') {
        await loc.check({ timeout: 3000 }).catch(async () => {
          await loc.check({ force: true, timeout: 2500 }).catch(async () => {
            await loc.click({ force: true, timeout: 2500 });
          });
        });
        // Many multi-step portals require checking the record box and clicking Continue / Remove Selected
        const advanceSelector = await page.evaluate(() => {
          const btns = Array.from(
            document.querySelectorAll(
              'button, input[type="submit"], input[type="button"], a[role="button"]'
            )
          ) as HTMLElement[];
          for (let i = 0; i < btns.length; i++) {
            const b = btns[i];
            if ((b as HTMLButtonElement).disabled || b.hidden) continue;
            const st = window.getComputedStyle(b);
            if (st.display === 'none' || st.visibility === 'hidden') continue;
            const txt = (
              b.tagName === 'INPUT'
                ? (b as HTMLInputElement).value || ''
                : b.innerText || b.textContent || ''
            )
              .replace(/\s+/g, ' ')
              .trim();
            if (
              /\b(continue|next|remove\s+selected|opt[\s-]?out\s+selected|delete\s+selected|submit\s+selected|proceed|remove\s+my\s+record)\b/i.test(
                txt
              )
            ) {
              b.setAttribute('data-synout-cand-advance', String(i));
              return `[data-synout-cand-advance="${i}"]`;
            }
          }
          return null;
        });
        if (advanceSelector) {
          await page.locator(advanceSelector).first().click({ timeout: 3500 }).catch(() => undefined);
        }
      } else {
        await loc.click({ timeout: 4000 });
      }
    };

    if (candidates.length > 0 && !candidateSelectedInPass) {
      job.candidateRecords = candidates;

      if (desiredCandidateId) {
        const chosen = candidates.find((c) => c.candidateId === desiredCandidateId);
        if (chosen) {
          candidateSelectedInPass = true;
          job.selectedCandidateId = chosen.candidateId;
          appendJobStep(
            job,
            'matching_record',
            'USER_SELECTED_RECORD',
            page.url(),
            `Selected confirmed record ${chosen.candidateId} (${chosen.actionType}).`
          );
          await selectCandidateOnPage(chosen);
          await waitForPageReady(page);
          if (await checkBlocker(200)) return;
          continue;
        }
      }

      if (nonDisqualified.length === 0) {
        job.blocker = {
          kind: 'ambiguous_record_match',
          summary:
            'All person listings returned by the portal were disqualified as out-of-state or age-mismatched homonyms. Review candidates before taking action.',
          handoffUrl: page.url(),
          requiresHumanAction: true,
        };
        appendJobStep(
          job,
          'awaiting_user_input',
          'HOMONYM_PROTECTION_PAUSED',
          page.url(),
          job.blocker.summary
        );
        return;
      }

      const best = nonDisqualified[0];
      const second = nonDisqualified[1];
      const isUnambiguous =
        best.confidenceScore >= 0.78 &&
        (!second || best.confidenceScore - second.confidenceScore >= 0.15);

      if (!isUnambiguous) {
        job.blocker = {
          kind: 'ambiguous_record_match',
          summary: `Found ${nonDisqualified.length} potential matching listings for ${profile.firstName} ${profile.lastName}. Select the exact record to prevent removing a homonym.`,
          handoffUrl: page.url(),
          requiresHumanAction: true,
        };
        appendJobStep(
          job,
          'awaiting_user_input',
          'CANDIDATE_SELECTION_REQUIRED',
          page.url(),
          job.blocker.summary
        );
        return;
      }

      // Unambiguous single match -> select/check it automatically on user's behalf!
      candidateSelectedInPass = true;
      job.selectedCandidateId = best.candidateId;
      appendJobStep(
        job,
        'matching_record',
        'SELECT_MATCHING_RECORD',
        page.url(),
        `Selected unambiguous listing (${Math.round(best.confidenceScore * 100)}% confidence: ${best.matchSignals.join(', ')}).`
      );
      await selectCandidateOnPage(best);
      await waitForPageReady(page);
      if (await checkBlocker(200)) return;
      continue;
    }

    // 2. Map live form fields & action controls on the current step (with BrokerAdapter URL enrichment)
    const effectiveOverrides = activePlaybook
      ? await enrichFieldOverridesWithAdapter({
          page,
          playbook: activePlaybook,
          profile,
          brokerDomain: job.brokerDomain,
          extractedListingUrl: adapterListingUrl,
          existingOverrides: params.fieldOverrides,
        })
      : params.fieldOverrides;

    const mapped = await extractAndMapLiveDomFields({
      page,
      profile,
      senderEmail,
      disclosurePolicy: job.disclosurePolicy,
      fieldOverrides: effectiveOverrides,
    });

    job.mappedFields = mapped.mappedFields;
    job.safetyEvaluation = mapped.safetyEvaluation;

    // 2a. If this step is a Record Lookup / Search form (has Search button and no final Submit), run lookup!
    if (mapped.searchControl && !mapped.submitControl) {
      appendJobStep(
        job,
        'matching_record',
        'EXECUTE_RECORD_SEARCH',
        page.url(),
        `Populating lookup fields and clicking "${mapped.searchControl.label}".`
      );
      await populateMappedFieldsOnPage(page, mapped.mappedFields);
      await sweepDynamicConsentCheckboxesOnPage({
        page,
        profile,
        senderEmail,
        disclosurePolicy: job.disclosurePolicy,
      });
      await page.locator(mapped.searchControl.selector).first().click({ timeout: 4000 });
      await waitForPageReady(page);
      await dismissBlockingCookieBannersOnPage(page);
      if (await checkBlocker(200)) return;
      continue;
    }

    // 2b. If this step has a multi-step wizard "Next" / "Continue" button (and no final Submit yet)
    if (mapped.nextStepControl && !mapped.submitControl) {
      if (!mapped.safetyEvaluation.safeForAutoSubmit) {
        job.blocker = {
          kind: mapped.safetyEvaluation.sensitiveFieldsDetected.length > 0
            ? 'excessive_id_demand'
            : mapped.safetyEvaluation.missingRequiredProfileFields.length > 0
            ? 'missing_profile_fields'
            : 'ambiguous_required_fields',
          summary: mapped.safetyEvaluation.blockingReasons.join(' '),
          handoffUrl: page.url(),
          requiresHumanAction: true,
        };
        appendJobStep(
          job,
          'awaiting_user_input',
          'STEP_REQUIRES_USER_INPUT',
          page.url(),
          job.blocker.summary
        );
        return;
      }

      appendJobStep(
        job,
        'inspecting',
        'ADVANCE_MULTI_STEP_FORM',
        page.url(),
        `Completed step ${wizardStep + 1} fields and clicking "${mapped.nextStepControl.label}".`
      );
      await populateMappedFieldsOnPage(page, mapped.mappedFields);
      const stepDynamicSweep = await sweepDynamicConsentCheckboxesOnPage({
        page,
        profile,
        senderEmail,
        disclosurePolicy: job.disclosurePolicy,
      });
      if (stepDynamicSweep.newlyCheckedLabels.length > 0) {
        appendJobStep(
          job,
          'inspecting',
          'SWEEP_DYNAMIC_CHECKBOXES',
          page.url(),
          `Automatically checked ${stepDynamicSweep.newlyCheckedLabels.length} newly revealed consent checkbox(es): ${stepDynamicSweep.newlyCheckedLabels.join('; ')}`
        );
      }
      await page.locator(mapped.nextStepControl.selector).first().click({ timeout: 4000 });
      await waitForPageReady(page);
      await dismissBlockingCookieBannersOnPage(page);
      if (await checkBlocker(200)) return;
      continue;
    }

    // 3. Final opt-out form step reached
    if (mapped.mappedFields.filter((f) => !f.preserveOriginalHidden).length === 0) {
      job.errorMessage = 'No interactive opt-out form controls were found on the target page.';
      appendJobStep(
        job,
        'failed',
        'NO_FORM_CONTROLS_FOUND',
        page.url(),
        job.errorMessage
      );
      return;
    }

    if (!mapped.safetyEvaluation.safeForAutoSubmit) {
      job.blocker = {
        kind: mapped.safetyEvaluation.sensitiveFieldsDetected.length > 0
          ? 'excessive_id_demand'
          : mapped.safetyEvaluation.missingRequiredProfileFields.length > 0
          ? 'missing_profile_fields'
          : 'ambiguous_required_fields',
        summary: mapped.safetyEvaluation.blockingReasons.join(' '),
        handoffUrl: page.url(),
        requiresHumanAction: true,
      };
      appendJobStep(
        job,
        'awaiting_user_input',
        'SAFETY_POLICY_PAUSED',
        page.url(),
        job.blocker.summary
      );
      return;
    }

    job.blocker = null;

    // Preview mode stops cleanly at ready_to_submit so the user can review confidence scores & values
    if (!params.submitNow) {
      appendJobStep(
        job,
        'ready_to_submit',
        'INSPECTION_READY_FOR_REVIEW',
        page.url(),
        `Mapped ${mapped.mappedFields.filter((f) => !f.preserveOriginalHidden && f.disclosureAllowed).length} consumer fields cleanly. Ready for user approval or autonomous submission.`
      );
      return;
    }

    if (!mapped.submitControl) {
      job.errorMessage = 'Opt-out fields were mapped, but no submit button could be located.';
      appendJobStep(job, 'failed', 'MISSING_SUBMIT_CONTROL', page.url(), job.errorMessage);
      return;
    }

    // 4. Populate fields and execute real form submission
    const beforeSubmitUrl = page.url();
    appendJobStep(
      job,
      'submitting',
      'POPULATE_AND_SUBMIT_FORM',
      beforeSubmitUrl,
      `Populating approved consumer fields (preserving CSRF tokens) and clicking "${mapped.submitControl.label}".`
    );

    const fieldAudit = await populateMappedFieldsOnPage(page, mapped.mappedFields);

    // Sweep any conditional consent checkboxes that dynamically mounted after state/email/type input
    const preSubmitSweep = await sweepDynamicConsentCheckboxesOnPage({
      page,
      profile,
      senderEmail,
      disclosurePolicy: job.disclosurePolicy,
    });
    if (preSubmitSweep.newlyCheckedLabels.length > 0) {
      fieldAudit.push(...preSubmitSweep.auditEntries);
      job.mappedFields = preSubmitSweep.updatedMappedFields;
      appendJobStep(
        job,
        'submitting',
        'SWEEP_DYNAMIC_CHECKBOXES',
        page.url(),
        `Automatically checked ${preSubmitSweep.newlyCheckedLabels.length} dynamically revealed consent checkbox(es): ${preSubmitSweep.newlyCheckedLabels.join('; ')}`
      );
    }

    let lastDocResponseStatus = 200;
    const responseListener = (resp: { url: () => string; status: () => number; request: () => { resourceType: () => string } }) => {
      const rType = resp.request().resourceType();
      if (rType === 'document' || rType === 'fetch' || rType === 'xhr') {
        lastDocResponseStatus = resp.status();
      }
    };
    page.on('response', responseListener);

    try {
      await page.locator(mapped.submitControl.selector).first().click({ timeout: 5000 });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => null);
      await page.waitForTimeout(220);

      // Automatically handle up to 2 chained post-submit confirmation modals/popups & checkboxes
      for (let popupPass = 0; popupPass < 2; popupPass++) {
        const popupResult = await handlePostSubmitConfirmationPopupOnPage({
          page,
          profile,
          senderEmail,
          disclosurePolicy: job.disclosurePolicy,
        });
        if (!popupResult.handled) break;

        fieldAudit.push(...popupResult.auditEntries);
        appendJobStep(
          job,
          'submitting',
          'AUTO_CONFIRMED_POPUP_MODAL',
          page.url(),
          `Automatically handled confirmation popup${
            popupResult.checkedBoxLabels.length > 0
              ? ` (checked ${popupResult.checkedBoxLabels.length} box(es): ${popupResult.checkedBoxLabels.join('; ')})`
              : ''
          } and clicked "${popupResult.clickedButtonLabel || 'Confirm'}".`
        );
      }
    } finally {
      page.off('response', responseListener);
    }

    job.currentUrl = page.url();
    job.ssrfBlockedRequests = [...params.ssrfBlockedUrls];

    const postHtml = await page.content().catch(() => '');
    const postVisibleText = await page
      .evaluate(() => document.body?.innerText || '')
      .catch(() => '');
    const postTitle = await page.title().catch(() => '');
    const hasInvalidDom = await page
      .evaluate(() => {
        const invalidEl = document.querySelector(
          '[aria-invalid="true"], input:invalid, select:invalid, textarea:invalid, .field-error, .error-message, [role="alert"].error'
        );
        return Boolean(invalidEl && (invalidEl as HTMLElement).offsetParent !== null);
      })
      .catch(() => false);

    const outcome = classifyPostSubmitOutcome({
      beforeUrl: beforeSubmitUrl,
      afterUrl: job.currentUrl,
      httpStatus: lastDocResponseStatus,
      visibleText: postVisibleText,
      html: postHtml,
      hasValidationInvalidAttributes: hasInvalidDom,
    });

    const evidence = buildSubmissionEvidenceArtifact({
      internalSubmissionId: job.internalSubmissionId,
      brokerConfirmationCode: outcome.brokerConfirmationCode,
      initialUrl: job.targetUrl,
      finalUrl: job.currentUrl,
      httpStatus: lastDocResponseStatus,
      pageTitle: postTitle,
      outcomeClassification: outcome.outcome,
      outcomeSummary: outcome.summary,
      rawDomHtml: postHtml,
      visibleText: postVisibleText,
      fieldAudit,
    });

    job.evidence = evidence;
    job.brokerConfirmationCode = outcome.brokerConfirmationCode;

    if (outcome.outcome === 'blocked') {
      job.blocker = {
        kind: 'cloudflare_waf',
        summary: outcome.summary,
        handoffUrl: beforeSubmitUrl,
        requiresHumanAction: true,
      };
      appendJobStep(job, 'blocked', 'POST_SUBMIT_BLOCKED', job.currentUrl, outcome.summary, lastDocResponseStatus);
      return;
    }

    if (outcome.outcome === 'validation_error') {
      job.errorMessage = outcome.summary;
      appendJobStep(job, 'failed', 'FORM_VALIDATION_REJECTED', job.currentUrl, outcome.summary, lastDocResponseStatus);
      return;
    }

    if (outcome.outcome === 'rejected') {
      job.errorMessage = outcome.summary;
      appendJobStep(job, 'rejected', 'BROKER_REFUSED_REQUEST', job.currentUrl, outcome.summary, lastDocResponseStatus);
      return;
    }

    if (outcome.outcome === 'awaiting_email_verification') {
      appendJobStep(
        job,
        'awaiting_email_verification',
        'EMAIL_VERIFICATION_REQUIRED',
        job.currentUrl,
        outcome.summary,
        lastDocResponseStatus
      );
      return;
    }

    if (outcome.outcome === 'awaiting_broker_processing') {
      appendJobStep(
        job,
        'awaiting_broker_processing',
        'SUBMISSION_ACKNOWLEDGED_BY_BROKER',
        job.currentUrl,
        outcome.summary,
        lastDocResponseStatus
      );
      return;
    }

    appendJobStep(
      job,
      'submitted_unconfirmed',
      'SUBMISSION_POSTED_UNCONFIRMED',
      job.currentUrl,
      outcome.summary,
      lastDocResponseStatus
    );
    return;
  }

  job.errorMessage = 'Exceeded maximum multi-step wizard depth without reaching final opt-out submission.';
  appendJobStep(job, 'failed', 'MAX_STEPS_EXCEEDED', page.url(), job.errorMessage);
}

/**
 * Starts or deduplicates an autonomous opt-out web-form workflow job for the caller's isolated session.
 */
export async function startOptOutWorkflow(
  options: StartWorkflowOptions
): Promise<RemovalWorkflowJob> {
  const mode: WorkflowExecutionMode = options.mode || 'inspect_and_preview';
  const brokerId = options.broker?.id || options.brokerId || 'custom-broker';
  const brokerName = options.broker?.name || options.brokerName || 'Data Broker Portal';
  const brokerDomain = options.broker?.domain || options.brokerDomain || 'broker.invalid';
  const adapterId = options.broker?.adapterId || 'generic_dom_form';
  const initialTarget = (options.targetUrl || options.broker?.optOutUrl || '').trim();

  if (!initialTarget && !brokerDomain) {
    throw new Error('Either targetUrl or brokerDomain is required to start an opt-out workflow.');
  }

  const idemKey = buildCanonicalIdempotencyKey({
    sessionId: options.sessionId,
    brokerId,
    targetUrl: initialTarget || brokerDomain,
    mode,
    explicitKey: options.idempotencyKey,
  });

  // Deduplicate active or already-submitted identical jobs within the same session
  const existingJobId = idempotencyIndex.get(idemKey);
  if (existingJobId) {
    const existingJob = jobsById.get(existingJobId);
    if (
      existingJob &&
      existingJob.sessionId === options.sessionId &&
      existingJob.state !== 'failed' &&
      existingJob.state !== 'cancelled'
    ) {
      return existingJob;
    }
  }

  enforceSessionJobQuota(options.sessionId);

  const nowIso = new Date().toISOString();
  const shortRand = crypto.randomBytes(4).toString('hex').toUpperCase();
  const jobId = `wf_${crypto.randomBytes(12).toString('hex')}`;
  const internalSubmissionId = `JOB-SUB-${Date.now().toString(36).toUpperCase()}-${shortRand}`;

  const mergedPolicy: ConsumerDisclosurePolicy = {
    ...DEFAULT_DISCLOSURE_POLICY,
    ...(options.disclosurePolicy || {}),
  };

  const job: RemovalWorkflowJob = {
    jobId,
    idempotencyKey: idemKey,
    sessionId: options.sessionId,
    brokerId,
    brokerName,
    brokerDomain,
    adapterId,
    mode,
    state: 'queued',
    targetUrl: initialTarget || `https://${brokerDomain}`,
    currentUrl: initialTarget || `https://${brokerDomain}`,
    discoveredTitle: brokerName,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    attemptCount: 1,
    maxAttempts: 2,
    blocker: null,
    candidateRecords: [],
    selectedCandidateId: options.selectedCandidateId || null,
    mappedFields: [],
    safetyEvaluation: null,
    disclosurePolicy: mergedPolicy,
    internalSubmissionId,
    brokerConfirmationCode: null,
    evidence: null,
    ssrfBlockedRequests: [],
    emailVerification: null,
    recheckResult: null,
    steps: [],
  };

  jobsById.set(jobId, job);
  idempotencyIndex.set(idemKey, jobId);
  jobRuntimeOptions.set(jobId, {
    profile: options.profile,
    senderEmail: options.senderEmail,
    allowLoopbackForTests: options.allowLoopbackForTests,
    dnsLookupForTests: options.dnsLookupForTests,
  });

  appendJobStep(job, 'queued', 'WORKFLOW_QUEUED', job.targetUrl, `Queued ${mode} workflow for ${brokerName}.`);

  // Check worker capabilities cleanly
  const capabilities = getAutomationCapabilities({
    forceUnavailable: options.forceWorkerUnavailableForTests,
  });
  if (!capabilities.headlessBrowserAvailable) {
    job.blocker = {
      kind: 'worker_unavailable',
      summary:
        capabilities.reason ||
        'Headless browser worker is unavailable; use the Guided Auto-Fill Bookmarklet or Statutory Email.',
      handoffUrl: job.targetUrl,
      requiresHumanAction: true,
    };
    appendJobStep(job, 'blocked', 'BROWSER_WORKER_UNAVAILABLE', job.targetUrl, job.blocker.summary);
    return job;
  }

  try {
    // Optional discovery phase if no explicit opt-out path was supplied
    let resolvedTargetUrl = initialTarget;
    if (!resolvedTargetUrl || /^https?:\/\/[^/]+\/?$/i.test(resolvedTargetUrl)) {
      appendJobStep(
        job,
        'discovering',
        'DISCOVER_OPTOUT_PORTAL',
        job.targetUrl,
        `Crawling ${brokerDomain} to locate disguised opt-out or privacy-choices portal.`
      );
      const discovery = await crawlDomainForOptOutPages({
        domainOrUrl: resolvedTargetUrl || brokerDomain,
        knownOptOutUrl: options.broker?.optOutUrl,
        profile: options.profile,
        senderEmail: options.senderEmail,
        broker: options.broker,
        allowLoopbackForTests: options.allowLoopbackForTests,
        dnsLookupForTests: options.dnsLookupForTests,
      });
      if (discovery.bestCandidate?.url) {
        resolvedTargetUrl = discovery.bestCandidate.url;
        job.targetUrl = resolvedTargetUrl;
        job.currentUrl = resolvedTargetUrl;
        appendJobStep(
          job,
          'discovering',
          'OPTOUT_PORTAL_FOUND',
          resolvedTargetUrl,
          `Discovered candidate portal "${discovery.bestCandidate.anchorText}" (score ${discovery.bestCandidate.score}).`
        );
      }
    }

    await assertSafeOutboundUrl(job.targetUrl, {
      allowLoopbackForTests: options.allowLoopbackForTests,
      dnsLookup: options.dnsLookupForTests,
    });

    await withIsolatedPlaywrightPage(
      {
        allowLoopbackForTests: options.allowLoopbackForTests,
        dnsLookupForTests: options.dnsLookupForTests,
      },
      async ({ page, ssrfBlockedUrls }) => {
        await executePageWorkflowPass({
          job,
          page,
          ssrfBlockedUrls,
          profile: options.profile,
          senderEmail: options.senderEmail,
          fieldOverrides: options.fieldOverrides,
          selectedCandidateId: options.selectedCandidateId,
          submitNow: mode === 'autonomous_auto_submit',
          allowLoopbackForTests: options.allowLoopbackForTests,
          dnsLookupForTests: options.dnsLookupForTests,
        });
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected browser workflow failure.';
    const isSsrfBlock = /Blocked|SSRF|private|loopback|Port|Non-canonical|Alternate/i.test(msg);
    if (isSsrfBlock) {
      job.blocker = {
        kind: 'network_or_ssrf_blocked',
        summary: msg,
        requiresHumanAction: false,
      };
      job.errorMessage = msg;
      appendJobStep(job, 'blocked', 'SSRF_GUARD_BLOCKED', job.targetUrl, msg);
    } else {
      job.errorMessage = msg;
      appendJobStep(job, 'failed', 'WORKFLOW_EXECUTION_ERROR', job.currentUrl, msg);
    }
  }

  return job;
}

export function getSessionWorkflowJob(
  sessionId: string,
  jobId: string
): RemovalWorkflowJob | null {
  const job = jobsById.get(jobId);
  if (!job || job.sessionId !== sessionId) return null;
  return job;
}

export function listSessionWorkflowJobs(sessionId: string): RemovalWorkflowJob[] {
  return Array.from(jobsById.values())
    .filter((j) => j.sessionId === sessionId)
    .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
}

/**
 * Approves and submits a workflow job that was inspected in preview mode (`ready_to_submit`)
 * or paused awaiting user field overrides / candidate selection (`awaiting_user_input`).
 */
export async function approveAndSubmitWorkflow(params: {
  sessionId: string;
  jobId: string;
  fieldOverrides?: Record<string, string>;
  disclosurePolicy?: Partial<ConsumerDisclosurePolicy>;
  selectedCandidateId?: string;
}): Promise<RemovalWorkflowJob> {
  const job = getSessionWorkflowJob(params.sessionId, params.jobId);
  if (!job) {
    throw new Error('Workflow job not found in active session.');
  }

  if (
    job.state === 'awaiting_broker_processing' ||
    job.state === 'awaiting_email_verification' ||
    job.state === 'removal_verified'
  ) {
    return job;
  }

  const runtime = jobRuntimeOptions.get(job.jobId);
  if (!runtime) {
    throw new Error('Workflow runtime context expired; start a fresh inspection.');
  }

  if (params.disclosurePolicy) {
    job.disclosurePolicy = {
      ...job.disclosurePolicy,
      ...params.disclosurePolicy,
    };
  }

  job.attemptCount += 1;

  await withIsolatedPlaywrightPage(
    {
      allowLoopbackForTests: runtime.allowLoopbackForTests,
      dnsLookupForTests: runtime.dnsLookupForTests,
    },
    async ({ page, ssrfBlockedUrls }) => {
      await executePageWorkflowPass({
        job,
        page,
        ssrfBlockedUrls,
        profile: runtime.profile,
        senderEmail: runtime.senderEmail,
        fieldOverrides: params.fieldOverrides,
        selectedCandidateId: params.selectedCandidateId || job.selectedCandidateId || undefined,
        submitNow: true,
        allowLoopbackForTests: runtime.allowLoopbackForTests,
        dnsLookupForTests: runtime.dnsLookupForTests,
      });
    }
  );

  return job;
}

/**
 * Automatically checks required/confirmation/consent checkboxes on inbound email verification
 * landing pages (native <input type="checkbox">, CSS-styled opacity:0 checkboxes via <label>,
 * and custom [role="checkbox"][aria-checked="false"]), strictly skipping marketing opt-ins and honeypots.
 */
async function autoCheckVerificationLandingBoxes(page: Page): Promise<number> {
  return page
    .evaluate(() => {
      const MARKETING_RE =
        /\b(newsletter|promot|marketing|partner\s+offer|special\s+offer|sponsor|advertising|updates\s+and\s+offers)\b/i;
      const CONFIRM_CONSENT_RE =
        /\b(confirm|delete|remove|suppress|opt[\s-]?out|do\s+not\s+sell|privacy|authorize|attest|18\s+years|permanent|agree|consent|acknowledge|verify|request|listing|record)\b/i;

      let checkedCount = 0;

      // 1. Native <input type="checkbox"> (including CSS-styled opacity:0 checkboxes paired with <label>)
      const inputs = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      );
      for (const el of inputs) {
        if (el.disabled || el.checked) continue;

        const labelEls: HTMLElement[] = [];
        if (el.labels && el.labels.length > 0) {
          for (const lbl of Array.from(el.labels)) {
            labelEls.push(lbl);
          }
        }
        if (el.id) {
          const explicit = document.querySelector<HTMLElement>(
            `label[for="${CSS.escape(el.id)}"]`
          );
          if (explicit && !labelEls.includes(explicit)) labelEls.push(explicit);
        }
        const wrapping = el.closest('label');
        if (wrapping && !labelEls.includes(wrapping)) labelEls.push(wrapping);

        const labelText = [
          ...labelEls.map((l) => l.innerText || l.textContent || ''),
          el.getAttribute('aria-label') || '',
          el.name || '',
          el.id || '',
          el.parentElement?.innerText || '',
        ]
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        const style = window.getComputedStyle(el);
        const hasVisibleLabel = labelEls.some((l) => {
          const ls = window.getComputedStyle(l);
          return ls.display !== 'none' && ls.visibility !== 'hidden';
        });

        // Skip unlabelled invisible honeypot traps
        if (
          !hasVisibleLabel &&
          (style.display === 'none' || style.visibility === 'hidden' || el.tabIndex === -1)
        ) {
          continue;
        }

        // Never check promotional / marketing opt-ins
        if (MARKETING_RE.test(labelText)) continue;

        if (el.required || CONFIRM_CONSENT_RE.test(labelText)) {
          const visibleLabel = labelEls.find((l) => {
            const ls = window.getComputedStyle(l);
            return ls.display !== 'none' && ls.visibility !== 'hidden';
          });
          if (visibleLabel && (style.opacity === '0' || el.offsetWidth <= 2)) {
            visibleLabel.click();
          } else {
            el.click();
          }
          if (!el.checked) {
            el.checked = true;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if (el.checked) checkedCount++;
        }
      }

      // 2. Custom ARIA [role="checkbox"][aria-checked="false"] controls
      const ariaBoxes = Array.from(
        document.querySelectorAll<HTMLElement>('[role="checkbox"]')
      );
      for (const box of ariaBoxes) {
        if (box.tagName.toLowerCase() === 'input') continue;
        if (box.getAttribute('aria-disabled') === 'true') continue;
        if (box.getAttribute('aria-checked') === 'true') continue;

        const style = window.getComputedStyle(box);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        const text = [
          box.innerText || box.textContent || '',
          box.getAttribute('aria-label') || '',
          box.id || '',
        ]
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (MARKETING_RE.test(text)) continue;
        if (
          box.getAttribute('aria-required') === 'true' ||
          CONFIRM_CONSENT_RE.test(text)
        ) {
          box.click();
          checkedCount++;
        }
      }

      return checkedCount;
    })
    .catch(() => 0);
}

/**
 * Completes an inbound email verification link safely inside an isolated SSRF-guarded Playwright context,
 * checking any required confirmation checkboxes, clicking any secondary confirmation button,
 * and extracting any final broker ticket ID.
 */
export async function completeWorkflowEmailVerification(params: {
  sessionId: string;
  jobId: string;
  verificationUrl: string;
  rawEmailText?: string;
}): Promise<RemovalWorkflowJob> {
  const job = getSessionWorkflowJob(params.sessionId, params.jobId);
  if (!job) {
    throw new Error('Workflow job not found in active session.');
  }

  const runtime = jobRuntimeOptions.get(job.jobId);

  const validated = await validateInboundVerificationLink({
    verificationUrl: params.verificationUrl,
    expectedBrokerDomain: job.brokerDomain,
    rawEmailText: params.rawEmailText,
    allowLoopbackForTests: runtime?.allowLoopbackForTests,
    dnsLookupForTests: runtime?.dnsLookupForTests,
  });

  await withIsolatedPlaywrightPage(
    {
      allowLoopbackForTests: runtime?.allowLoopbackForTests,
      dnsLookupForTests: runtime?.dnsLookupForTests,
    },
    async ({ page }) => {
      const res = await page.goto(validated.sanitizedUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 12000,
      });
      await waitForPageReady(page);

      // Automatically check any confirmation/consent boxes on the verification landing page
      const checkedBoxesCount = await autoCheckVerificationLandingBoxes(page);

      // Some brokers render a secondary "Confirm Opt-Out" button or submit input on the verification landing page
      const confirmBtn = page
        .locator('button, a[role="button"]')
        .filter({ hasText: /confirm|complete|verify|remove|opt[\s-]?out|delete|finalize/i })
        .first();
      const submitInput = page
        .locator('input[type="submit"]')
        .first();
      if ((await confirmBtn.count()) > 0 && (await confirmBtn.isVisible().catch(() => false))) {
        await confirmBtn.click({ timeout: 3000 }).catch(() => null);
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => null);
      } else if ((await submitInput.count()) > 0 && (await submitInput.isVisible().catch(() => false))) {
        await submitInput.click({ timeout: 3000 }).catch(() => null);
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => null);
      }

      const finalStatus = res?.status() ?? 200;
      const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      const ticket = extractGenuineBrokerConfirmationCode(bodyText);

      if (finalStatus >= 400 || /\b(invalid\s+token|expired\s+link|verification\s+failed)\b/i.test(bodyText)) {
        job.errorMessage = 'Email verification link was rejected or expired on the broker portal.';
        appendJobStep(
          job,
          'failed',
          'EMAIL_VERIFICATION_FAILED',
          page.url(),
          job.errorMessage,
          finalStatus
        );
        return;
      }

      if (ticket) {
        job.brokerConfirmationCode = ticket;
      }

      const boxNote =
        checkedBoxesCount > 0
          ? ` (checked ${checkedBoxesCount} confirmation checkbox${checkedBoxesCount === 1 ? '' : 'es'})`
          : '';

      job.emailVerification = {
        verifiedAtIso: new Date().toISOString(),
        finalUrl: page.url(),
        httpStatus: finalStatus,
        brokerConfirmationCode: ticket,
        summary: ticket
          ? `Email confirmation link verified${boxNote}; broker issued confirmation code ${ticket}.`
          : `Email confirmation link visited and confirmed${boxNote} (no additional ticket code issued).`,
      };

      appendJobStep(
        job,
        'awaiting_broker_processing',
        'EMAIL_VERIFICATION_CONFIRMED',
        page.url(),
        job.emailVerification.summary,
        finalStatus
      );
    }
  );

  return job;
}

/**
 * Re-visits a broker's listing/search URL to verify whether the consumer's record has actually
 * disappeared from public results before allowing transition to `removal_verified`.
 */
export async function recheckWorkflowListingRemoval(params: {
  sessionId: string;
  jobId: string;
  checkUrl?: string;
}): Promise<RemovalWorkflowJob> {
  const job = getSessionWorkflowJob(params.sessionId, params.jobId);
  if (!job) {
    throw new Error('Workflow job not found in active session.');
  }

  const runtime = jobRuntimeOptions.get(job.jobId);
  if (!runtime) {
    throw new Error('Workflow profile context expired; run a fresh scan check.');
  }

  const urlToCheck = (params.checkUrl || job.targetUrl).trim();
  await assertSafeOutboundUrl(urlToCheck, {
    allowLoopbackForTests: runtime.allowLoopbackForTests,
    dnsLookup: runtime.dnsLookupForTests,
  });

  await withIsolatedPlaywrightPage(
    {
      allowLoopbackForTests: runtime.allowLoopbackForTests,
      dnsLookupForTests: runtime.dnsLookupForTests,
    },
    async ({ page }) => {
      const res = await page.goto(urlToCheck, {
        waitUntil: 'domcontentloaded',
        timeout: 12000,
      });
      await waitForPageReady(page);
      const status = res?.status() ?? 200;
      const html = await page.content().catch(() => '');
      const visibleText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');

      const blocker = detectLivePageBlocker({
        html,
        visibleText,
        url: page.url(),
        httpStatus: status,
      });

      if (blocker) {
        job.recheckResult = {
          checkedAtIso: new Date().toISOString(),
          listingStillPresent: false,
          verifiedRemoved: false,
          httpStatus: status,
          summary: `Could not verify removal automatically because portal presented an anti-bot gate (${blocker.kind}).`,
        };
        appendJobStep(
          job,
          job.state,
          'RECHECK_BLOCKED_BY_ANTIBOT',
          page.url(),
          job.recheckResult.summary,
          status
        );
        return;
      }

      if (status === 404 || status === 410) {
        job.recheckResult = {
          checkedAtIso: new Date().toISOString(),
          listingStillPresent: false,
          verifiedRemoved: true,
          httpStatus: status,
          summary: `Listing URL returned HTTP ${status} (Gone/Not Found); record removal verified.`,
        };
        appendJobStep(
          job,
          'removal_verified',
          'REMOVAL_VERIFIED_HTTP_404_410',
          page.url(),
          job.recheckResult.summary,
          status
        );
        return;
      }

      const candidates = await extractAndScoreCandidateRecords(page, runtime.profile);
      const activeMatches = candidates.filter((c) => !c.disqualifiedHomonym && c.confidenceScore >= 0.65);

      const fullNameLower = `${runtime.profile.firstName} ${runtime.profile.lastName}`
        .trim()
        .toLowerCase();
      const cityLower = (runtime.profile.currentCity || '').trim().toLowerCase();
      const explicitNoRecords =
        /\b(no\s+records?\s+found|0\s+results|profile\s+has\s+been\s+removed|record\s+not\s+found|listing\s+removed)\b/i.test(
          visibleText
        );

      const textStillShowsProfile =
        !explicitNoRecords &&
        fullNameLower.length > 3 &&
        visibleText.toLowerCase().includes(fullNameLower) &&
        (!cityLower || visibleText.toLowerCase().includes(cityLower));

      const listingStillPresent = activeMatches.length > 0 || textStillShowsProfile;

      if (listingStillPresent) {
        job.recheckResult = {
          checkedAtIso: new Date().toISOString(),
          listingStillPresent: true,
          verifiedRemoved: false,
          httpStatus: status,
          summary:
            'Listing still appears in live portal results; keeping request in awaiting_broker_processing until suppression propagates.',
        };
        appendJobStep(
          job,
          job.state === 'removal_verified' ? 'awaiting_broker_processing' : job.state,
          'RECHECK_LISTING_STILL_PRESENT',
          page.url(),
          job.recheckResult.summary,
          status
        );
      } else {
        job.recheckResult = {
          checkedAtIso: new Date().toISOString(),
          listingStillPresent: false,
          verifiedRemoved: true,
          httpStatus: status,
          summary: 'Live portal re-check confirmed zero matching consumer records remain.',
        };
        appendJobStep(
          job,
          'removal_verified',
          'REMOVAL_VERIFIED_CLEAN',
          page.url(),
          job.recheckResult.summary,
          status
        );
      }
    }
  );

  return job;
}

/**
 * Records a user-completed manual browser handoff (e.g., after solving a CAPTCHA with the Bookmarklet)
 * without fabricating any broker confirmation code unless the user explicitly pastes one.
 */
export function recordManualHandoffCompletion(params: {
  sessionId: string;
  jobId: string;
  userProvidedConfirmationCode?: string;
  requiresEmailVerification?: boolean;
}): RemovalWorkflowJob {
  const job = getSessionWorkflowJob(params.sessionId, params.jobId);
  if (!job) {
    throw new Error('Workflow job not found in active session.');
  }

  const cleanCode = (params.userProvidedConfirmationCode || '').trim() || null;
  job.brokerConfirmationCode = cleanCode;
  job.blocker = null;

  const nextState: RemovalWorkflowState = params.requiresEmailVerification
    ? 'awaiting_email_verification'
    : cleanCode
    ? 'awaiting_broker_processing'
    : 'submitted_unconfirmed';

  appendJobStep(
    job,
    nextState,
    'USER_COMPLETED_HUMAN_HANDOFF',
    job.currentUrl,
    cleanCode
      ? `User completed browser handoff and recorded broker confirmation code ${cleanCode}.`
      : 'User completed browser handoff (marked submitted_unconfirmed; no broker confirmation code entered).'
  );

  return job;
}

export function cancelSessionWorkflowJob(
  sessionId: string,
  jobId: string
): RemovalWorkflowJob {
  const job = getSessionWorkflowJob(sessionId, jobId);
  if (!job) {
    throw new Error('Workflow job not found in active session.');
  }
  appendJobStep(job, 'cancelled', 'WORKFLOW_CANCELLED', job.currentUrl, 'Workflow cancelled by user.');
  return job;
}

export function purgeSessionWorkflows(sessionId?: string): void {
  if (!sessionId) {
    jobsById.clear();
    idempotencyIndex.clear();
    jobRuntimeOptions.clear();
    return;
  }
  for (const [id, job] of jobsById.entries()) {
    if (job.sessionId === sessionId) {
      jobsById.delete(id);
      idempotencyIndex.delete(job.idempotencyKey);
      jobRuntimeOptions.delete(id);
    }
  }
}

export interface StandaloneVerificationResult {
  verified: boolean;
  finalUrl: string;
  pageTitle: string;
  httpStatus: number;
  brokerConfirmationCode: string | null;
  checkedBoxesCount: number;
  evidenceSha256: string;
  summary: string;
}

/**
 * Executes a harvested broker email verification link inside an isolated SSRF-guarded
 * headless Chromium context even when no prior RAM workflow job exists.
 */
export async function executeStandaloneVerificationLink(params: {
  verificationUrl: string;
  expectedBrokerDomain: string;
  rawEmailText?: string;
  allowLoopbackForTests?: boolean;
  dnsLookupForTests?: StartWorkflowOptions['dnsLookupForTests'];
}): Promise<StandaloneVerificationResult> {
  const validated = await validateInboundVerificationLink({
    verificationUrl: params.verificationUrl,
    expectedBrokerDomain: params.expectedBrokerDomain,
    rawEmailText: params.rawEmailText,
    allowLoopbackForTests: params.allowLoopbackForTests,
    dnsLookupForTests: params.dnsLookupForTests,
  });

  const capabilities = getAutomationCapabilities();
  if (!capabilities.headlessBrowserAvailable) {
    throw new Error('Local headless browser worker is unavailable; open the verified confirmation link in your browser.');
  }

  let outcome: StandaloneVerificationResult | null = null;

  await withIsolatedPlaywrightPage(
    {
      allowLoopbackForTests: params.allowLoopbackForTests,
      dnsLookupForTests: params.dnsLookupForTests,
    },
    async ({ page }) => {
      const res = await page.goto(validated.sanitizedUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 12000,
      });
      await waitForPageReady(page);

      const checkedBoxesCount = await autoCheckVerificationLandingBoxes(page);

      const confirmBtn = page
        .locator('button, a[role="button"]')
        .filter({ hasText: /confirm|complete|verify|remove|opt[\s-]?out|delete|finalize/i })
        .first();
      const submitInput = page
        .locator('input[type="submit"]')
        .first();
      if ((await confirmBtn.count()) > 0 && (await confirmBtn.isVisible().catch(() => false))) {
        await confirmBtn.click({ timeout: 3000 }).catch(() => null);
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => null);
      } else if ((await submitInput.count()) > 0 && (await submitInput.isVisible().catch(() => false))) {
        await submitInput.click({ timeout: 3000 }).catch(() => null);
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => null);
      }

      const finalStatus = res?.status() ?? 200;
      const pageTitle = (await page.title().catch(() => '')) || params.expectedBrokerDomain;
      const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      const ticket = extractGenuineBrokerConfirmationCode(bodyText);

      const rejected =
        finalStatus >= 400 ||
        /\b(invalid\s+token|expired\s+link|verification\s+failed|link\s+has\s+expired)\b/i.test(
          bodyText
        );

      const verifiedAtIso = new Date().toISOString();
      const evidenceSha256 = crypto
        .createHash('sha256')
        .update(`${verifiedAtIso}|${page.url()}|${finalStatus}|${ticket || 'NONE'}`)
        .digest('hex');

      const boxSuffix =
        checkedBoxesCount > 0
          ? ` Checked ${checkedBoxesCount} confirmation box${checkedBoxesCount === 1 ? '' : 'es'} for you.`
          : '';

      outcome = {
        verified: !rejected,
        finalUrl: page.url(),
        pageTitle,
        httpStatus: finalStatus,
        brokerConfirmationCode: ticket,
        checkedBoxesCount,
        evidenceSha256,
        summary: rejected
          ? `Verification link returned HTTP ${finalStatus} or expired notice on ${params.expectedBrokerDomain}.`
          : ticket
          ? `Completed verification link on ${params.expectedBrokerDomain} (Confirmation Code: ${ticket}).${boxSuffix}`
          : `Completed verification link on ${params.expectedBrokerDomain} (HTTP ${finalStatus}).${boxSuffix}`,
      };
    }
  );

  if (!outcome) {
    throw new Error('Verification browser execution did not produce a result.');
  }
  return outcome;
}

