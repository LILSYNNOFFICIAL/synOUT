import type { Page } from 'playwright-core';
import type { UserProfile } from '../../types/index.ts';
import {
  type BrokerPlaybookDescriptor,
  listAllBrokerPlaybooks,
  resolveBrokerPlaybook,
  synthesizeBrokerCandidateProfileUrl,
} from '../../utils/brokerAdapterCatalog.ts';

export {
  type BrokerPlaybookDescriptor,
  listAllBrokerPlaybooks,
  resolveBrokerPlaybook,
  synthesizeBrokerCandidateProfileUrl,
};

export interface AdapterStepHookResult {
  applied: boolean;
  actionsTaken: string[];
  extractedListingUrl: string | null;
}

/**
 * Executes deterministic pre-step hooks on multi-step portals (e.g. accepting mandatory
 * "I agree to terms" opt-out gate checkboxes without touching marketing opt-ins,
 * or extracting a rendered person-card URL for URL-based suppression forms).
 */
export async function runAdapterPreStepHooks(params: {
  page: Page;
  playbook: BrokerPlaybookDescriptor;
  profile: UserProfile;
}): Promise<AdapterStepHookResult> {
  const { page, playbook } = params;
  const actionsTaken: string[] = [];
  let extractedListingUrl: string | null = null;

  // 1. Scan visible anchors for a matching profile/listing URL matching this broker's pattern
  if (playbook.listingLinkRegexSource) {
    try {
      const hrefs = await page
        .evaluate(() =>
          Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
            .map((a) => a.href)
            .filter(Boolean)
            .slice(0, 120)
        )
        .catch(() => [] as string[]);

      const rx = new RegExp(playbook.listingLinkRegexSource, 'i');
      const matched = hrefs.find((h) => rx.test(h));
      if (matched) {
        extractedListingUrl = matched;
        actionsTaken.push(`Extracted live listing URL matching ${playbook.brokerName} pattern`);
      }
    } catch {
      // Ignore regex or DOM evaluation error
    }
  }

  // 2. Check mandatory portal terms gate checkboxes (never marketing/newsletter boxes)
  for (const selector of playbook.termsGateSelectors) {
    try {
      if (selector.startsWith('input[type="checkbox"]')) {
        const checkboxes = page.locator(selector);
        const count = await checkboxes.count();
        for (let i = 0; i < Math.min(count, 3); i++) {
          const box = checkboxes.nth(i);
          if (!(await box.isVisible().catch(() => false))) continue;
          const labelText = await box
            .evaluate((el) => {
              const id = el.getAttribute('id');
              const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
              const parentLabel = el.closest('label');
              return (
                (explicit?.textContent || parentLabel?.textContent || el.parentElement?.textContent || '')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .toLowerCase()
              );
            })
            .catch(() => '');

          const isMarketing = /\b(newsletter|promot|marketing|special\s+offer|subscribe)\b/i.test(
            labelText
          );
          const isTermsGate =
            /\b(agree|terms|certify|confirm|authorized|human|opt-out|removal|understand)\b/i.test(
              labelText
            ) || count === 1;

          if (!isMarketing && isTermsGate) {
            const checked = await box.isChecked().catch(() => false);
            if (!checked) {
              await box.check({ timeout: 2000 }).catch(() => null);
              actionsTaken.push(`Checked mandatory portal terms gate on ${playbook.brokerName}`);
            }
          }
        }
      }
    } catch {
      // Non-fatal
    }
  }

  return {
    applied: actionsTaken.length > 0 || Boolean(extractedListingUrl),
    actionsTaken,
    extractedListingUrl,
  };
}

/**
 * Enriches form field overrides when a broker's suppression form requires a profile/listing URL
 * or specific statutory reason dropdown selection.
 */
export async function enrichFieldOverridesWithAdapter(params: {
  page: Page;
  playbook: BrokerPlaybookDescriptor;
  profile: UserProfile;
  brokerDomain: string;
  extractedListingUrl?: string | null;
  existingOverrides?: Record<string, string>;
}): Promise<Record<string, string>> {
  const merged: Record<string, string> = { ...(params.existingOverrides || {}) };
  const candidateUrl =
    params.extractedListingUrl ||
    synthesizeBrokerCandidateProfileUrl(params.brokerDomain, params.profile);

  try {
    const urlInputKeys = await params.page
      .evaluate(() => {
        const keys: string[] = [];
        const inputs = Array.from(
          document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
            'input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea'
          )
        );
        for (const el of inputs) {
          const descriptor = [
            el.name,
            el.id,
            el.placeholder,
            el.getAttribute('aria-label') || '',
          ]
            .join(' ')
            .toLowerCase();
          if (/\b(url|link|profile|listing)\b/i.test(descriptor) && !/\bemail\b/i.test(descriptor)) {
            const key = el.name || el.id;
            if (key) keys.push(key);
          }
        }
        return keys;
      })
      .catch(() => [] as string[]);

    for (const key of urlInputKeys) {
      if (!merged[key]) {
        merged[key] = candidateUrl;
      }
    }
  } catch {
    // Ignore evaluation errors
  }

  return merged;
}
