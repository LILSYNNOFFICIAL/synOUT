# synOUT

<p align="center">
  <a href="https://lilsynnofficial.github.io/synOUT/public/">
    <img src="https://raw.githubusercontent.com/LILSYNNOFFICIAL/synOUT/refs/heads/main/src/assets/images/synOUT_Logo_Sm.png" alt="synOUT logo" width="320">
  </a>
</p>

<p align="center">
  <strong>Find your exposed personal information. Organize opt-out requests. Track removal work.</strong>
</p>

<p align="center">
  <a href="https://lilsynnofficial.github.io/synOUT/public/">Open synOUT Website</a> ·
  <a href="https://github.com/LILSYNNOFFICIAL/synOUT">Source Code</a>
</p>

**synOUT is currently a website, not a native Android, iOS, or desktop application.** Open it in a modern browser to use the interface. It is an in-development privacy workspace intended to help people identify possible exposure in data-broker listings, organize opt-out requests, prepare deletion notices, and track follow-up work.

> **Important:** A scan result is not proof that a live broker currently holds your data. Some exposure results are generated from the app's local broker registry and heuristic matching rather than a direct query to the broker. A request being drafted, queued, or recorded by synOUT does not by itself mean it was delivered, accepted, or that your information was deleted. Confirm important actions directly with the broker and retain its actual confirmation.

## Open the website

**Website:** https://lilsynnofficial.github.io/synOUT/public/

1. Open the website in a current version of Chrome, Firefox, Edge, or Safari.
2. Start from **Overview** and open the identity scan form.
3. Enter only the identity details needed for the task you want to perform. Review the information before submitting it.
4. Run an exposure audit, then review the results and the confidence or evidence shown for each listing.
5. Open a listing's broker or portal link to verify the record at the source. Use the site's opt-out process, email tools, and tracking workspace to organize next steps.
6. Revisit the tracker and saved workspace to manage follow-ups. Broker removal and search-engine de-indexing are separate processes and may require separate requests.

The site is browser-based and responsive. No app-store installation is required. Browser storage may be used to keep profile information, scan results, queues, and preferences on the device. Avoid using a shared or public computer, and clear the workspace when you finish if you do not want the next person using that browser profile to see its saved data.

## Main areas and how to use them

The top navigation groups tools by task. Labels may evolve while the project is in development.

### Discovery

- **Overview:** Start here for the workspace summary and scan launcher.
- **Audit Scan:** Enter identity details and run the available identity/exposure assessment. The code includes standard identity, cross-state, reverse-phone, email, vehicle, court, property, family-linkage, corporate-record, and leak-related search vectors. Availability of a vector does not mean every underlying source is queried live.
- **Exposure Report:** Review possible broker matches, open the source portal, and prepare a removal action. Check that a listing is actually yours before sending identifying details. Similar names and outdated records can produce false matches.
- **Saved Searches:** Store and revisit search profiles and results. The current interface supports up to 10 saved searches in browser storage.
- **Dark Web & Leaks:** Review the workspace's leak/takedown workflow and organize reporting steps. This is not a guarantee of access to, or comprehensive scanning of, dark-web sources.

### Suppression and requests

- **Web-Form Runner:** Inspect or work through broker opt-out forms. When the deployed website cannot run its server-side browser worker, use the guided/manual or bookmarklet handoff when offered. CAPTCHA, login, identity-verification, and ambiguous-match steps may require you to take over.
- **Email Dispatch:** Configure an available user-owned email workflow, review the recipient and message, and initiate an opt-out request. The website's static deployment may offer webmail composition or OAuth-based options, while direct SMTP delivery requires the full-stack server. Never enter your normal email password. Use provider-supported OAuth or app-password credentials only where supported, and disconnect the account when finished.
- **Search De-Indexing:** Organize requests to search engines to refresh or remove indexed results. Removing a search result does not delete the source page or the broker's underlying record.
- **Removal Tracker / Queue:** Follow the state of requests and record genuine broker responses. An internal synOUT job or event ID is not the same as a broker-issued confirmation number.
- **Inbox Verification / Reply Triage:** Where the relevant integration is available, find and review broker replies or email verification links. Verify the sender and destination domain before opening a link. Do not treat an unverified email or generated status as proof of removal.
- **NUKE ALL / batch workflows:** Use these only after reviewing the target list, destination addresses, and message content. Batch actions can contact many external organizations. Start with a small number of verified targets and confirm each result.

### Monitoring, records, and workspace tools

Depending on the current deployment and available backend features, navigation may also include continuous monitoring, a broker directory, manual opt-out guides, public-record/bureau checklists, jurisdiction registries, an upstream public-records firewall, audit logs, an encrypted workspace vault, and power-of-attorney or legal-notice helpers. These tools help organize follow-up work; they cannot independently compel a broker, government office, or search engine to remove information.

## What works on the published website?

The public URL is hosted on GitHub Pages, which serves static website files. It does **not** run the repository's Express server. Therefore, features that call server endpoints may be unavailable or may fall back to a guided workflow on this deployment.

| Capability | Published static website | Full-stack local/server deployment |
| --- | --- | --- |
| Open and use the web interface | Yes | Yes |
| Local broker registry and heuristic exposure assessment | Yes | Yes |
| Browser-side saved searches and workspace tools | Yes, subject to browser storage | Yes |
| Guided opt-out steps and bookmarklet handoff | Available where shown by the interface | Yes |
| Live server-side portal crawling and probing | Not provided by GitHub Pages | Supported by configured server endpoints |
| Isolated Playwright/Chromium form automation | Not run by GitHub Pages | Requires a supported Chromium/browser-worker setup |
| Direct SMTP dispatch from the synOUT server | Not provided by GitHub Pages | Requires server configuration |
| AI-assisted statutory notice refinement | Not provided by GitHub Pages without its backend | Optional; requires GEMINI_API_KEY |
| External broker deletion or guaranteed search-index removal | Never guaranteed by synOUT | Never guaranteed by synOUT |

A button or screen being visible does not mean its server-side integration is enabled on the static site. If a feature reports that a backend is unavailable, use the manual option if provided or wait for a correctly configured full-stack deployment.

## Privacy and safe-use guidance

- **Minimize data.** Provide only what a specific search or opt-out form needs. Do not enter Social Security numbers, full identity-document numbers, payment-card details, or other highly sensitive information unless you have independently verified that a legitimate recipient legally requires it and you have decided it is necessary.
- **Verify the broker and listing.** Open the broker's official website yourself, check that the record belongs to you, and confirm the privacy/opt-out destination before submitting a request.
- **Review before sending.** Check recipient addresses, requested data fields, jurisdiction, legal wording, and any batch recipients. Automated discovery can identify the wrong page or an outdated contact.
- **Understand browser storage.** Some information is kept in browser storage for convenience. A browser session is not the same as a secure, remotely backed-up account. Anyone with access to the same browser profile may be able to see locally stored data.
- **Treat statuses carefully.** “Found,” “submitted,” “sent,” “awaiting verification,” and “removed” are different states. A completed local action does not prove an external organization complied. Keep the broker's actual receipt or confirmation.
- **Use legal tools as drafting aids.** Generated notices and jurisdiction guidance are informational, not legal advice. Review the applicable law and deadlines or consult a qualified professional for consequential matters.
- **Clear sensitive workspace data when finished.** Use the in-app purge/clear controls where available, and review the browser's site data if you need to remove information saved by the site. Disconnect email integrations when done.

## Run the project locally (developers)

The repository contains a React + TypeScript frontend built with Vite and an optional Express backend. The hosted website does not require cloning the repository.

### Requirements

- A current Node.js release compatible with the dependencies.
- npm (or Bun if you prefer working with the included bun.lock).
- For live browser automation, a compatible Chromium installation or configured remote browser worker.

### Install and start

```bash
git clone https://github.com/LILSYNNOFFICIAL/synOUT.git
cd synOUT
npm install
npm run dev
```

The development server starts the Express + Vite application at **http://localhost:3000**.

Useful commands:

```bash
npm run dev     # Start the full-stack development server
npm run lint    # TypeScript type-check (tsc --noEmit)
npm test        # Run the Node test suites
npm run build   # Build the frontend into dist/
npm start       # Start the server entry point in a configured runtime
npm run preview # Preview a Vite production build
```

A successful build or test run validates code behavior, not the real-world compliance of a broker or the delivery of a deletion request.

## Optional environment configuration

Copy .env.example to .env for local development and set only the values needed for your setup. Never commit .env, provider credentials, OAuth secrets, or API keys.

| Variable | Purpose |
| --- | --- |
| GEMINI_API_KEY | Optional server-side key for AI-assisted statutory notice refinement. A fallback notice is available when AI is not configured. |
| APP_URL | Optional public application URL used by the runtime configuration. |
| VITE_GOOGLE_OAUTH_CLIENT_ID | Optional public Google OAuth client ID for the supported OAuth flow. Configure the matching OAuth consent screen and allowed origins in Google Cloud. |
| PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH | Optional path to a compatible Chromium executable for server-side automation. |
| BROWSER_WORKER_URL | Optional URL for a configured remote browser worker. |
| SYNOUT_DISABLE_BROWSER_WORKER | Set to 1 to disable the browser worker and use guided/manual workflows. |

SMTP credentials and OAuth access tokens should be handled only through the supported connection flow and runtime configuration. Do not put a user's email password into source code, frontend environment variables, or this README.

## Deployment notes

GitHub Pages is a static host. The repository's deployment workflow builds and publishes the website under the /synOUT/public/ project path. Server-only functions in server.ts require a separate Node-compatible hosting environment and must not be assumed to run on GitHub Pages. To offer the complete server-backed feature set publicly, deploy the frontend and Express API to an appropriate host, configure the environment secrets there, and verify every API integration before advertising it as available.

## Project status

synOUT is actively under development. Features, navigation, broker coverage, and integration availability can change. Please report reproducible bugs or documentation gaps through the repository's GitHub Issues.

---

**Project:** https://github.com/LILSYNNOFFICIAL/synOUT  
**Website:** https://lilsynnofficial.github.io/synOUT/public/
