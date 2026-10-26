# synOUT

**synOUT** is an evidence-driven, autonomous personal data broker removal and privacy neutralization platform. Discover disguised opt-out portals, complete multi-step web forms via an isolated Playwright Chromium engine with data-minimization guardrails, verify listing suppression, and dispatch statutory deletion demands (CCPA, CPRA, GDPR, VCDPA, Delete Act) directly from your own connected email account.

<p align="center">
  <img src="https://raw.githubusercontent.com/LILSYNNOFFICIAL/synOUT/refs/heads/main/src/assets/images/synOUT_Logo_Sm.png" alt="synOUT logo" width="480" height="240">
</p>

## Core Capabilities

- **Autonomous Headless Browser Opt-Out Engine (`playwright-core`)**: Renders static HTML and client-side React/Vue/Angular SPAs inside isolated, zero-cookie Chromium contexts (`Sec-GPC: 1`), crawls disguised footer links (`Your Privacy Choices`, `Do Not Sell or Share`, `Suppress My Record`), navigates multi-step lookup wizards, scores candidate listings with strict homonym disqualification, maps fields with explicit confidence (`0.0–1.0`) and disclosure-policy enforcement, preserves hidden CSRF tokens, skips honeypots and SSN/ID traps, and captures SHA-256 signed submission evidence.
- **Honest Verification & Human-in-the-Loop Blocker Handoff**: Strictly separates internal audit IDs (`JOB-SUB-*`) from genuine broker confirmation tickets (`null` when none issued). Never fabricates tickets or auto-marks records removed; pauses cleanly on reCAPTCHA, hCaptcha, Cloudflare Turnstile/WAF, login walls, or ambiguous homonyms with 1-Click Auto-Fill Bookmarklet handoff, inbound email verification link completion, and live portal re-verification.
- **Jurisdiction-Aware Broker Audit & Live Portal Probe**: Evaluates verified data brokers across people-search directories, skip-trace syndicates, property records, and specialty bureaus, explicitly distinguishing deterministic **Heuristic Risk Assessments** from opt-in **Live Portal Probes**.
- **Session-Isolated Credential Vault & SSRF Hardening**: Encrypts verified SMTP credentials strictly in server RAM (`AES-256-GCM` bound to `HttpOnly; SameSite=Strict` session tokens — zero browser `appPassword` storage), keeps Google OAuth tokens strictly in volatile memory, defaults workspace PII to `sessionStorage`, and blocks SSRF across decimal/hex/octal/shorthand IPv4, private/mapped/NAT64 IPv6, DNS rebinding, redirects, and Playwright subresource requests.
- **User-Connected Email Dispatch & Red `NUKE ALL` Batch Engine**: Connect Gmail, Outlook/Microsoft 365, Yahoo, Apple iCloud, Proton Mail, or custom SMTP (or use Webmail Compose / Google OAuth Popup) to send statutory deletion demands and mass BCC webmail batches.
- **45-Day Statutory SLA Tracker, Reply Triage & Upstream Public Records Firewall**: Tracks 45-day statutory compliance clocks, parses inbound broker replies (stripping ad trackers and flagging domain-mismatch phishing links), generates 11 CCR § 7060 ID-minimization counter-notices, builds County Assessor / Voter Roll / DMV DPPA redaction petitions, mints Canary Aliases, strips JPEG/PNG EXIF/GPS metadata, and exports PBKDF2 + AES-256-GCM encrypted workspace vaults.

## Runtime Modes: Full-Stack Server vs. Static Hosting

| Capability | Full-Stack (`npm run dev` / `npm start`) | Static Hosting (e.g., GitHub Pages) |
| --- | --- | --- |
| Playwright Headless Web-Form Inspection & Auto-Submit | Supported (`playwright-core` + Chromium) | Degrades cleanly to Guided Bookmarklet |
| Live Portal Discovery Crawl & Live Exposure Probe | Supported (`/api/optout/*`, `/api/scan/live-probe`) | Offline registry + Heuristic Risk Assessment |
| Direct SMTP Dispatch & DNS MX Pre-Flight Failover | Supported (`/api/smtp/*` with RAM AES-256-GCM vault) | Webmail Compose (`mailto:` / Gmail / Outlook) & OAuth |
| 1-Click Auto-Fill Bookmarklet, SLA Tracker, Triage & Encrypted Vault | Supported | Supported |

## Development & Verification

```bash
npm install
npm run dev     # Starts synOUT Express + Vite full-stack server on http://localhost:3000
npm run lint    # Runs TypeScript type-checking (tsc --noEmit)
npm test        # Runs audit, Playwright browser automation, SSRF, and session security test suites
npm run build   # Builds production frontend bundle into dist/
```

## Environment & Secret Hygiene

Never commit plaintext API keys or credentials to version control. Configure optional runtime variables via `.env` locally (see `.env.example`) or in **GitHub Environments** (`Settings → Environments → production`).
