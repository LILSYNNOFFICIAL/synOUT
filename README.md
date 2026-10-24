# synOUT

**synOUT** is an autonomous personal data broker removal and deep/dark web exposure neutralization platform. Scan 700+ data brokers with jurisdiction-aware false-positive filtering, generate direct deep/dark web verification links with source-specific manual removal guides, and dispatch statutory deletion demands (CCPA, CPRA, GDPR, VCDPA, Delete Act) directly from your own connected email account.

## Core Capabilities

- **Jurisdiction-Aware Broker Audit Engine**: Cross-references residency history, phone numbers, and age anchors across 700+ public-record aggregators, people-search directories, skip-trace syndicates, and court registries while disqualifying homonym false positives.
- **User-Connected Email Dispatch (Zero Firebase Required)**: Connect your own Gmail, Outlook/Microsoft 365, Yahoo, Apple iCloud, Proton Mail, or custom SMTP account in-session (or use 1-Click Webmail Compose / Google OAuth Popup) so **synOUT** sends statutory opt-out notices directly on your behalf without storing credentials on the server.
- **Deep & Dark Web Neutralization Center**: Generates direct Tor v3 `.onion` queries, clearnet relay links, darknet archive lookups, and step-by-step source-specific manual removal workflows.
- **Multi-Format Audit Dossiers**: Export exposure and statutory compliance records in CSV, Markdown (`.md`), Plain Text (`.txt`), AsciiDoc (`.adoc`), and Troff (`.me`).

## Development & Verification

```bash
npm install
npm run dev     # Starts synOUT full-stack server on http://localhost:3000
npm run lint    # Runs TypeScript verification
npm test        # Runs automated audit, security, and brand consistency test suite
npm run build   # Builds production bundle
```

## Environment & Secret Hygiene

Never commit plaintext API keys or credentials to version control. Configure optional runtime variables via `.env` locally (see `.env.example`) or in **GitHub Environments** (`Settings → Environments → production`).
