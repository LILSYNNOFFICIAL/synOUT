import fs from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { assertSafeOutboundUrl, type CustomDnsLookupFn } from '../urlSafety.ts';
import type { AutomationCapabilities } from './types.ts';

const KNOWN_CHROMIUM_PATHS = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '',
  '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
  '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
].filter(Boolean);

const MAX_CONCURRENT_CONTEXTS = 3;
const DEFAULT_CONTEXT_TIMEOUT_MS = 22000;

let sharedBrowserPromise: Promise<Browser> | null = null;
let activeContextsCount = 0;
const waitQueue: Array<() => void> = [];

export function resolveChromiumExecutablePath(): string | null {
  for (const candidate of KNOWN_CHROMIUM_PATHS) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Continue checking candidates
    }
  }
  try {
    const defaultPath = chromium.executablePath();
    if (defaultPath && fs.existsSync(defaultPath)) {
      return defaultPath;
    }
  } catch {
    // Playwright browser binary not installed locally
  }
  return null;
}

export function getAutomationCapabilities(options?: {
  forceUnavailable?: boolean;
}): AutomationCapabilities {
  if (options?.forceUnavailable || process.env.SYNOUT_DISABLE_BROWSER_WORKER === '1') {
    return {
      headlessBrowserAvailable: false,
      workerMode: 'unavailable',
      browserEngine: 'none',
      maxConcurrency: MAX_CONCURRENT_CONTEXTS,
      activeContexts: activeContextsCount,
      reason:
        'Headless browser worker is not provisioned in this environment. Guided Auto-Fill Bookmarklet & Statutory Email channels remain available.',
    };
  }

  const remoteWorkerUrl = (process.env.BROWSER_WORKER_URL || '').trim();
  if (remoteWorkerUrl) {
    return {
      headlessBrowserAvailable: true,
      workerMode: 'remote_worker',
      browserEngine: 'Remote Playwright Worker',
      maxConcurrency: MAX_CONCURRENT_CONTEXTS,
      activeContexts: activeContextsCount,
    };
  }

  const executablePath = resolveChromiumExecutablePath();
  if (executablePath) {
    return {
      headlessBrowserAvailable: true,
      workerMode: 'local_playwright',
      browserEngine: 'Chromium Headless (Playwright)',
      maxConcurrency: MAX_CONCURRENT_CONTEXTS,
      activeContexts: activeContextsCount,
    };
  }

  return {
    headlessBrowserAvailable: false,
    workerMode: 'unavailable',
    browserEngine: 'none',
    maxConcurrency: MAX_CONCURRENT_CONTEXTS,
    activeContexts: activeContextsCount,
    reason:
      'Chromium headless binary is not installed on this host. Configure BROWSER_WORKER_URL or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, or use the 1-Click Auto-Fill Bookmarklet.',
  };
}

async function getSharedBrowser(): Promise<Browser> {
  if (sharedBrowserPromise) {
    try {
      const existing = await sharedBrowserPromise;
      if (existing.isConnected()) return existing;
    } catch {
      sharedBrowserPromise = null;
    }
  }

  const executablePath = resolveChromiumExecutablePath();
  if (!executablePath) {
    throw new Error('Headless Chromium executable is not available in this environment.');
  }

  sharedBrowserPromise = chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-extensions',
      '--mute-audio',
      '--no-first-run',
    ],
  });

  return sharedBrowserPromise;
}

async function acquireConcurrencySlot(): Promise<void> {
  if (activeContextsCount < MAX_CONCURRENT_CONTEXTS) {
    activeContextsCount++;
    return;
  }
  await new Promise<void>((resolve) => {
    waitQueue.push(resolve);
  });
  activeContextsCount++;
}

function releaseConcurrencySlot(): void {
  activeContextsCount = Math.max(0, activeContextsCount - 1);
  const next = waitQueue.shift();
  if (next) next();
}

export interface IsolatedPageSessionOptions {
  allowLoopbackForTests?: boolean;
  dnsLookupForTests?: CustomDnsLookupFn;
  timeoutMs?: number;
}

/**
 * Executes an automation callback inside a fresh, ephemeral, zero-cookie Playwright BrowserContext
 * with mandatory SSRF route interception across all main-frame, iframe, XHR, fetch, and redirect requests.
 */
export async function withIsolatedPlaywrightPage<T>(
  options: IsolatedPageSessionOptions,
  fn: (ctx: {
    context: BrowserContext;
    page: Page;
    ssrfBlockedUrls: string[];
  }) => Promise<T>
): Promise<T> {
  await acquireConcurrencySlot();
  let context: BrowserContext | null = null;
  const ssrfBlockedUrls: string[] = [];

  try {
    const browser = await getSharedBrowser();
    context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Sec-GPC': '1',
        DNT: '1',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      acceptDownloads: false,
      bypassCSP: false,
      javaScriptEnabled: true,
      serviceWorkers: 'block',
    });

    context.setDefaultTimeout(options.timeoutMs ?? DEFAULT_CONTEXT_TIMEOUT_MS);
    context.setDefaultNavigationTimeout(options.timeoutMs ?? DEFAULT_CONTEXT_TIMEOUT_MS);

    // Ensure tsx/esbuild keepNames helper (__name) is defined inside evaluated browser functions
    await context.addInitScript('window.__name = window.__name || ((fn) => fn);');

    // Intercept EVERY outbound network request (main document, iframes, scripts, XHR/fetch, images, redirects)
    await context.route('**/*', async (route) => {
      const reqUrl = route.request().url();
      const resourceType = route.request().resourceType();

      // Block heavy media/fonts to keep headless execution fast and deterministic
      if (resourceType === 'media' || resourceType === 'font' || resourceType === 'websocket') {
        await route.abort('blockedbyclient').catch(() => null);
        return;
      }

      // Allow harmless inline about:blank initial frame
      if (reqUrl === 'about:blank') {
        await route.continue().catch(() => null);
        return;
      }

      try {
        await assertSafeOutboundUrl(reqUrl, {
          allowLoopbackForTests: options.allowLoopbackForTests,
          dnsLookup: options.dnsLookupForTests,
        });
        await route.continue();
      } catch {
        ssrfBlockedUrls.push(reqUrl.slice(0, 240));
        await route.abort('accessdenied').catch(() => null);
      }
    });

    const page = await context.newPage();

    // Automatically close unexpected popup windows opened by broker pages
    context.on('page', (popup) => {
      if (popup !== page) {
        void popup.close().catch(() => null);
      }
    });

    // Dismiss any blocking JS alert/confirm/prompt dialogs automatically
    page.on('dialog', (dialog) => {
      void dialog.dismiss().catch(() => null);
    });

    return await fn({ context, page, ssrfBlockedUrls });
  } finally {
    if (context) {
      await context.close().catch(() => null);
    }
    releaseConcurrencySlot();
  }
}

export async function shutdownBrowserAutomation(): Promise<void> {
  if (sharedBrowserPromise) {
    const p = sharedBrowserPromise;
    sharedBrowserPromise = null;
    try {
      const browser = await p;
      await browser.close();
    } catch {
      // Ignore shutdown errors
    }
  }
}
