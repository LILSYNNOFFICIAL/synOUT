import type { Page } from 'playwright-core';
import type { DataBroker, UserProfile } from '../../types/index.ts';
import {
  type ConsumerDisclosurePolicy,
  DEFAULT_DISCLOSURE_POLICY,
  type FormSafetyEvaluation,
  type ParsedOptOutFormField,
  evaluateFormSubmissionSafety,
  isRolePermittedByDisclosurePolicy,
  resolveProfileValueForField,
  scoreSemanticFieldMapping,
} from '../../utils/optOutFormEngine.ts';
import { maskFieldValuePreview } from '../urlSafety.ts';
import type { LiveDomFieldMapping } from './types.ts';

interface ExtractedRawDomControl {
  index: number;
  selector: string;
  labelSelector?: string;
  tag: 'input' | 'select' | 'textarea' | 'custom_combobox' | 'custom_checkbox';
  inputType: string;
  name: string;
  id: string;
  label: string;
  ariaLabel: string;
  placeholder: string;
  autocomplete: string;
  required: boolean;
  defaultValue: string;
  isHiddenOrOffscreen: boolean;
  tabIndex: number;
  options: Array<{ value: string; label: string }>;
}

/**
 * Extracts interactive form controls directly from a rendered Playwright DOM (supporting
 * React/Vue/Angular SPAs, ARIA labels, custom comboboxes, and hidden CSRF tokens).
 */
export async function extractAndMapLiveDomFields(params: {
  page: Page;
  profile: UserProfile;
  senderEmail?: string;
  broker?: DataBroker;
  disclosurePolicy?: ConsumerDisclosurePolicy;
  fieldOverrides?: Record<string, string>;
}): Promise<{
  mappedFields: LiveDomFieldMapping[];
  safetyEvaluation: FormSafetyEvaluation;
  submitControl: { selector: string; label: string } | null;
  nextStepControl: { selector: string; label: string } | null;
  searchControl: { selector: string; label: string } | null;
}> {
  const policy = params.disclosurePolicy || DEFAULT_DISCLOSURE_POLICY;

  const domPayload = await params.page.evaluate(() => {
    const cssEscape = (val: string) =>
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(val)
        : val.replace(/([^a-zA-Z0-9_-])/g, '\\$1');

    const buildUniqueSelector = (el: Element, fallbackIdx: number): string => {
      if (el.id) {
        return `#${cssEscape(el.id)}`;
      }
      const nameAttr = el.getAttribute('name');
      const tag = el.tagName.toLowerCase();
      if (nameAttr) {
        const byName = `${tag}[name="${nameAttr.replace(/"/g, '\\"')}"]`;
        if (document.querySelectorAll(byName).length === 1) {
          return byName;
        }
      }
      el.setAttribute('data-synout-idx', String(fallbackIdx));
      return `[data-synout-idx="${fallbackIdx}"]`;
    };

    const isElementHiddenOrOffscreen = (el: HTMLElement): boolean => {
      if (el.hidden || el.getAttribute('aria-hidden') === 'true') return true;
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity || '1') === 0
      ) {
        return true;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) return true;
      if (rect.right < 0 || rect.bottom < 0 || rect.left < -1000 || rect.top < -1000) return true;
      return false;
    };

    const getControlLabel = (el: HTMLElement): string => {
      const parts: string[] = [];
      if (el.id) {
        const explicitLabel = document.querySelector(`label[for="${cssEscape(el.id)}"]`);
        if (explicitLabel) parts.push((explicitLabel as HTMLElement).innerText || explicitLabel.textContent || '');
      }
      const ariaLabelledBy = el.getAttribute('aria-labelledby');
      if (ariaLabelledBy) {
        ariaLabelledBy.split(/\s+/).forEach((refId) => {
          const refEl = document.getElementById(refId);
          if (refEl) parts.push(refEl.innerText || refEl.textContent || '');
        });
      }
      const wrappingLabel = el.closest('label');
      if (wrappingLabel) {
        parts.push(wrappingLabel.innerText || wrappingLabel.textContent || '');
      }
      if (parts.length === 0) {
        const prev = el.previousElementSibling as HTMLElement | null;
        if (prev && /^(LABEL|SPAN|DIV|P)$/.test(prev.tagName)) {
          const prevText = (prev.innerText || prev.textContent || '').trim();
          if (prevText.length > 0 && prevText.length <= 90) {
            parts.push(prevText);
          }
        }
      }
      return parts
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
    };

    const findVisibleAssociatedLabel = (el: HTMLElement): HTMLElement | null => {
      if (el.id) {
        const explicitLabel = document.querySelector(
          `label[for="${cssEscape(el.id)}"]`
        ) as HTMLElement | null;
        if (explicitLabel && !isElementHiddenOrOffscreen(explicitLabel)) {
          return explicitLabel;
        }
      }
      const wrappingLabel = el.closest('label') as HTMLElement | null;
      if (wrappingLabel && !isElementHiddenOrOffscreen(wrappingLabel)) {
        return wrappingLabel;
      }
      return null;
    };

    const controls: ExtractedRawDomControl[] = [];
    const rawNodes = Array.from(
      document.querySelectorAll(
        'input, select, textarea, [role="combobox"], [role="checkbox"], [role="switch"]'
      )
    ) as HTMLElement[];

    let idx = 0;
    for (const el of rawNodes) {
      if (
        (el as HTMLInputElement).disabled ||
        (el as HTMLInputElement).readOnly ||
        el.getAttribute('aria-disabled') === 'true'
      ) {
        continue;
      }

      const tagLower = el.tagName.toLowerCase();
      const roleLower = (el.getAttribute('role') || '').toLowerCase();
      const isNativeControl =
        tagLower === 'input' || tagLower === 'select' || tagLower === 'textarea';
      const isAriaCheck =
        !isNativeControl && (roleLower === 'checkbox' || roleLower === 'switch');

      const tag: ExtractedRawDomControl['tag'] = isAriaCheck
        ? 'custom_checkbox'
        : !isNativeControl
        ? 'custom_combobox'
        : (tagLower as 'input' | 'select' | 'textarea');

      const inputType =
        tag === 'custom_checkbox'
          ? 'checkbox'
          : tag === 'input'
          ? ((el as HTMLInputElement).getAttribute('type') || 'text').toLowerCase()
          : tag;

      if (['submit', 'button', 'reset', 'image'].includes(inputType)) continue;

      const name = el.getAttribute('name') || el.getAttribute('data-name') || '';
      const id = el.id || '';
      if (inputType === 'hidden' && !name && !id) continue;

      // Skip sitewide header search boxes unrelated to record/opt-out lookup
      if (
        inputType === 'search' &&
        /^(q|s)$/i.test(name) &&
        !el.closest('form[action*="opt"], form[action*="remov"], [data-optout], main')
      ) {
        continue;
      }

      let hiddenOffscreen =
        inputType === 'hidden' ? false : isElementHiddenOrOffscreen(el);
      let labelSelector: string | undefined;

      // Many privacy portals (OneTrust, TrustArc, Tailwind/Bootstrap custom checkboxes)
      // visually hide the raw <input type="checkbox"> with opacity:0 or 1x1px while rendering a visible <label>.
      if (
        hiddenOffscreen &&
        (inputType === 'checkbox' || inputType === 'radio') &&
        !el.hidden &&
        el.getAttribute('aria-hidden') !== 'true'
      ) {
        const visibleLabelEl = findVisibleAssociatedLabel(el);
        if (visibleLabelEl) {
          hiddenOffscreen = false;
          labelSelector = buildUniqueSelector(visibleLabelEl, 5000 + idx);
        }
      }

      const label =
        getControlLabel(el) ||
        (isAriaCheck ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : '');
      const ariaLabel = el.getAttribute('aria-label') || '';
      const placeholder = el.getAttribute('placeholder') || '';
      const autocomplete = el.getAttribute('autocomplete') || '';
      const required =
        el.hasAttribute('required') ||
        el.getAttribute('aria-required') === 'true' ||
        /\*\s*$/.test(label);

      const options: Array<{ value: string; label: string }> = [];
      if (tag === 'select') {
        const selectEl = el as HTMLSelectElement;
        for (const opt of Array.from(selectEl.options)) {
          const val = opt.value ?? '';
          const txt = (opt.textContent || '').trim();
          if (val || txt) {
            options.push({ value: val.slice(0, 120), label: (txt || val).slice(0, 120) });
          }
        }
      }

      const defaultValue =
        tag === 'custom_checkbox'
          ? el.getAttribute('aria-checked') === 'true'
            ? 'true'
            : ''
          : tag === 'textarea'
          ? (el as HTMLTextAreaElement).value || ''
          : tag === 'input'
          ? (el as HTMLInputElement).value || ''
          : tag === 'select'
          ? (el as HTMLSelectElement).value || ''
          : el.textContent?.trim() || '';

      const selector = buildUniqueSelector(el, idx);
      controls.push({
        index: idx,
        selector,
        labelSelector,
        tag,
        inputType,
        name,
        id,
        label: label || ariaLabel || placeholder || name || id || `Field ${idx + 1}`,
        ariaLabel,
        placeholder,
        autocomplete,
        required,
        defaultValue,
        isHiddenOrOffscreen: hiddenOffscreen,
        tabIndex: el.tabIndex,
        options,
      });
      idx++;
    }

    // Identify visible action buttons (Search vs Next/Continue vs Final Submit)
    const buttonNodes = Array.from(
      document.querySelectorAll(
        'button, input[type="submit"], input[type="button"], a[role="button"]'
      )
    ) as HTMLElement[];

    let submitControl: { selector: string; label: string } | null = null;
    let nextStepControl: { selector: string; label: string } | null = null;
    let searchControl: { selector: string; label: string } | null = null;

    buttonNodes.forEach((btn, bIdx) => {
      if ((btn as HTMLButtonElement).disabled || isElementHiddenOrOffscreen(btn)) return;
      const rawLabel =
        btn.tagName === 'INPUT'
          ? (btn as HTMLInputElement).value || ''
          : btn.innerText || btn.textContent || btn.getAttribute('aria-label') || '';
      const label = rawLabel.replace(/\s+/g, ' ').trim();
      if (!label || label.length > 80) return;

      // Ignore cookie banner / login / header navigation buttons
      if (/^(accept cookies|reject all|sign in|log in|create account|cancel|close)$/i.test(label)) {
        return;
      }

      const sel = buildUniqueSelector(btn, 1000 + bIdx);
      const isSubmitAttr =
        btn.tagName === 'INPUT'
          ? (btn as HTMLInputElement).type.toLowerCase() === 'submit'
          : ((btn as HTMLButtonElement).getAttribute('type') || 'submit').toLowerCase() === 'submit';

      if (
        !searchControl &&
        /\b(search|find\s+my\s+record|find\s+my\s+listing|find\s+records|lookup|locate\s+profile)\b/i.test(
          label
        ) &&
        !/submit\s+opt|delete|remove\s+my/i.test(label)
      ) {
        searchControl = { selector: sel, label };
        return;
      }

      if (
        !nextStepControl &&
        /^(next|continue|next\s+step|proceed|step\s+2|verify\s+identity)$/i.test(label)
      ) {
        nextStepControl = { selector: sel, label };
        return;
      }

      if (
        !submitControl &&
        (/\b(submit|opt[\s-]?out|remove|delete|suppress|send\s+request|confirm\s+removal|do\s+not\s+sell|erase)\b/i.test(
          label
        ) ||
          isSubmitAttr)
      ) {
        submitControl = { selector: sel, label };
      }
    });

    return {
      controls,
      submitControl,
      nextStepControl,
      searchControl,
    };
  });

  const mappedFields: LiveDomFieldMapping[] = [];
  const safetyInputFields: ParsedOptOutFormField[] = [];

  for (const ctrl of domPayload.controls) {
    const normalizedTag: 'input' | 'select' | 'textarea' =
      ctrl.tag === 'custom_combobox'
        ? 'select'
        : ctrl.tag === 'custom_checkbox'
        ? 'input'
        : ctrl.tag;

    const scored = scoreSemanticFieldMapping({
      name: ctrl.name,
      id: ctrl.id,
      inputType: ctrl.inputType,
      label: ctrl.label,
      placeholder: ctrl.placeholder,
      autocomplete: ctrl.autocomplete,
      ariaLabel: ctrl.ariaLabel,
      tag: normalizedTag,
      isHiddenOrOffscreen: ctrl.isHiddenOrOffscreen,
      tabIndex: ctrl.tabIndex,
      required: ctrl.required,
    });

    const fieldKey = ctrl.name || ctrl.id || `field_${ctrl.index}`;
    const hasExplicitOverride =
      params.fieldOverrides !== undefined &&
      Object.prototype.hasOwnProperty.call(params.fieldOverrides, fieldKey);

    const disclosureCheck = isRolePermittedByDisclosurePolicy(scored.role, policy);
    const preserveOriginalHidden = scored.role === 'csrf_or_hidden';

    let plannedValue = '';
    if (preserveOriginalHidden) {
      plannedValue = ctrl.defaultValue;
    } else if (hasExplicitOverride) {
      plannedValue = String(params.fieldOverrides?.[fieldKey] ?? '');
    } else if (disclosureCheck.allowed && scored.role !== 'unknown') {
      plannedValue = resolveProfileValueForField(
        scored.role,
        ctrl.options,
        ctrl.defaultValue,
        params.profile,
        params.senderEmail,
        params.broker
      );
    }

    const effectiveConfidence = hasExplicitOverride ? 1.0 : scored.confidence;
    const effectiveDisclosureAllowed = hasExplicitOverride ? true : disclosureCheck.allowed;

    mappedFields.push({
      fieldKey,
      selector: ctrl.selector,
      labelSelector: ctrl.labelSelector,
      tag: ctrl.tag,
      inputType: ctrl.inputType,
      name: ctrl.name,
      id: ctrl.id,
      label: ctrl.label,
      placeholder: ctrl.placeholder,
      required: ctrl.required,
      options: ctrl.options,
      semanticRole: scored.role,
      confidence: effectiveConfidence,
      confidenceSignals: hasExplicitOverride
        ? [...scored.signals, 'User-verified override']
        : scored.signals,
      disclosureAllowed: effectiveDisclosureAllowed,
      skipReason: effectiveDisclosureAllowed ? undefined : disclosureCheck.reason,
      plannedValue,
      maskedPreview: maskFieldValuePreview(scored.role, plannedValue),
      preserveOriginalHidden,
    });

    safetyInputFields.push({
      key: fieldKey,
      name: ctrl.name || fieldKey,
      id: ctrl.id,
      tag: normalizedTag,
      inputType: ctrl.inputType,
      label: ctrl.label,
      placeholder: ctrl.placeholder,
      required: ctrl.required,
      options: ctrl.options,
      semanticRole: scored.role,
      confidence: effectiveConfidence,
      confidenceSignals: scored.signals,
      disclosureAllowed: effectiveDisclosureAllowed,
      skipReason: disclosureCheck.reason,
      suggestedValue: plannedValue,
      defaultRawValue: ctrl.defaultValue,
    });
  }

  const safetyEvaluation = evaluateFormSubmissionSafety(safetyInputFields, policy);

  return {
    mappedFields,
    safetyEvaluation,
    submitControl: domPayload.submitControl,
    nextStepControl: domPayload.nextStepControl,
    searchControl: domPayload.searchControl,
  };
}

/**
 * Populates allowed, high-confidence mapped fields inside the live Playwright page while
 * leaving hidden CSRF tokens, honeypots, sensitive ID inputs, and marketing checkboxes untouched.
 */
export async function populateMappedFieldsOnPage(
  page: Page,
  mappedFields: LiveDomFieldMapping[]
): Promise<Array<{
  fieldKey: string;
  label: string;
  semanticRole: string;
  confidence: number;
  maskedValue: string;
  populated: boolean;
}>> {
  const audit: Array<{
    fieldKey: string;
    label: string;
    semanticRole: string;
    confidence: number;
    maskedValue: string;
    populated: boolean;
  }> = [];

  for (const field of mappedFields) {
    if (field.preserveOriginalHidden) {
      audit.push({
        fieldKey: field.fieldKey,
        label: field.label,
        semanticRole: field.semanticRole,
        confidence: field.confidence,
        maskedValue: field.maskedPreview,
        populated: true,
      });
      continue;
    }

    if (
      !field.disclosureAllowed ||
      field.semanticRole === 'honeypot_trap' ||
      field.semanticRole === 'sensitive_id_field' ||
      field.semanticRole === 'marketing_opt_in' ||
      field.semanticRole === 'unknown'
    ) {
      audit.push({
        fieldKey: field.fieldKey,
        label: field.label,
        semanticRole: field.semanticRole,
        confidence: field.confidence,
        maskedValue: '(skipped)',
        populated: false,
      });
      continue;
    }

    const val = field.plannedValue;
    if (!val && field.inputType !== 'checkbox') {
      audit.push({
        fieldKey: field.fieldKey,
        label: field.label,
        semanticRole: field.semanticRole,
        confidence: field.confidence,
        maskedValue: '(empty)',
        populated: false,
      });
      continue;
    }

    try {
      const locator = page.locator(field.selector).first();
      if (field.tag === 'select') {
        await locator.selectOption({ value: val }).catch(async () => {
          await locator.selectOption({ label: val });
        });
      } else if (field.tag === 'custom_combobox') {
        await locator.click({ timeout: 2000 });
        const optLocator = page
          .locator(`[role="option"]`)
          .filter({ hasText: new RegExp(val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
          .first();
        if ((await optLocator.count()) > 0) {
          await optLocator.click({ timeout: 2000 });
        }
      } else if (field.tag === 'custom_checkbox') {
        const shouldCheck = Boolean(val) && !/^(false|0|no|off|__unchecked__)$/i.test(val);
        const ariaChecked = await locator.getAttribute('aria-checked');
        if (shouldCheck && ariaChecked !== 'true') {
          await locator.click({ timeout: 2000 });
        } else if (
          !shouldCheck &&
          (val === 'false' || val === '__unchecked__') &&
          ariaChecked === 'true'
        ) {
          await locator.click({ timeout: 2000 });
        }
      } else if (field.inputType === 'checkbox') {
        const shouldCheck = Boolean(val) && !/^(false|0|no|off|__unchecked__)$/i.test(val);
        const currentlyChecked = await locator.isChecked().catch(() => false);
        if (shouldCheck && !currentlyChecked) {
          await locator.check({ timeout: 1800 }).catch(async () => {
            if (field.labelSelector) {
              await page
                .locator(field.labelSelector)
                .first()
                .click({ timeout: 1800 })
                .catch(() => undefined);
            }
            const checkedAfterLabel = await locator.isChecked().catch(() => false);
            if (!checkedAfterLabel) {
              await locator.check({ force: true, timeout: 1500 }).catch(async () => {
                await locator.evaluate((el: HTMLInputElement) => {
                  el.checked = true;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                });
              });
            }
          });
        } else if (
          !shouldCheck &&
          (val === 'false' || val === '__unchecked__') &&
          currentlyChecked
        ) {
          await locator.uncheck({ timeout: 1800 }).catch(async () => {
            if (field.labelSelector) {
              await page
                .locator(field.labelSelector)
                .first()
                .click({ timeout: 1800 })
                .catch(() => undefined);
            }
            const stillChecked = await locator.isChecked().catch(() => false);
            if (stillChecked) {
              await locator.uncheck({ force: true, timeout: 1500 }).catch(() => undefined);
            }
          });
        }
      } else if (field.inputType === 'radio') {
        if (val === 'true' || val === field.plannedValue) {
          await locator.check({ timeout: 1800 }).catch(async () => {
            if (field.labelSelector) {
              await page
                .locator(field.labelSelector)
                .first()
                .click({ timeout: 1800 })
                .catch(() => undefined);
            } else {
              await locator.check({ force: true, timeout: 1800 }).catch(async () => {
                await locator.click({ force: true, timeout: 1800 });
              });
            }
          });
        }
      } else {
        await locator.fill(val, { timeout: 2500 });
      }

      audit.push({
        fieldKey: field.fieldKey,
        label: field.label,
        semanticRole: field.semanticRole,
        confidence: field.confidence,
        maskedValue: maskFieldValuePreview(field.semanticRole, val),
        populated: true,
      });
    } catch {
      audit.push({
        fieldKey: field.fieldKey,
        label: field.label,
        semanticRole: field.semanticRole,
        confidence: field.confidence,
        maskedValue: '(fill_failed)',
        populated: false,
      });
    }
  }

  return audit;
}
