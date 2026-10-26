# synOUT

**synOUT** is an autonomous personal data broker removal and deep/dark web exposure neutralization platform. Scan 700+ data brokers with jurisdiction-aware false-positive filtering, generate direct deep/dark web verification links with source-specific manual removal guides, and dispatch statutory deletion demands (CCPA, CPRA, GDPR, VCDPA, Delete Act) directly from your own connected email account.

<p align="center">
  <img src="https://raw.githubusercontent.com/LILSYNNOFFICIAL/synOUT/refs/heads/main/src/assets/images/synOUT_Logo_Sm.png" alt="synOUT logo" width="480" height="240">
</p>

## Core Capabilities

- **Jurisdiction-Aware Broker Audit Engine**: Cross-references residency history, phone numbers, and age anchors across 700+ public-record aggregators, people-search directories, skip-trace syndicates, and court registries while disqualifying homonym false positives.
- **User-Connected Email Dispatch & Multi-Select Batch Opt-Out (Zero Firebase Required)**: Connect your own Gmail, Outlook/Microsoft 365, Yahoo, Apple iCloud, Proton Mail, or custom SMTP account (or use 1-Click Webmail Compose / Google OAuth Popup) so **synOUT** sends statutory opt-out notices directly on your behalf without storing credentials on the server.
- **45-Day Statutory SLA Tracker, Cure Escalation & Regulatory Complaint Engine**: Tracks live 45-day CCPA/CPRA/TDPSA compliance deadlines from outbound Message-ID timestamps, dispatches second statutory cure notices via connected email, exports RFC 5545 `.ics` calendar reminders, and generates ready-to-file regulatory complaint dossiers (CA CPPA, Texas OAG, US FTC, Colorado AG, EU DPA).
- **Search Engine De-Indexing & Outdated Cache Removal Hub**: Generates targeted `site:` SERP dork queries across Google, Bing, DuckDuckGo, Yahoo, and Brave Search, guides official outdated-cache/PII submissions, and dispatches HTTP `410 Gone` / `X-Robots-Tag: noindex` cache-purge demands to broker webmasters.
- **12-Bureau FCRA, Payroll, Telco CNAM & Marketing Suppression Hub**: Dedicated statutory workflows and persistent freeze/PIN checklists for LexisNexis, CoreLogic, The Work Number (Equifax Workforce), NCTUE, SageStream, MIB, ChexSystems, Innovis, OptOutPrescreen, DMAchoice, National Do Not Call / Wireless CPNI, and State Data Broker Registries (CA Delete Act SB 362).
- **Inbound Broker Reply Triage, Link Scrubber & 11 CCR § 7060 Verification Shield**: Parses broker replies to extract confirmation tickets, strips ad-tech/click-ID tracking parameters from one-time verification URLs, flags domain-mismatch phishing links, and generates statutory counter-notices against unlawful unredacted government-ID demands or false public-record exemption claims.
- **Upstream Public Records & Canary Identity Firewall**: Generates state-aware redaction petitions for County Assessor/Recorder deeds, State Voter Rolls (Safe at Home / ACP), State DMV DPPA resale blocks, ICANN WHOIS/RDAP, and Secretary of State UCC filings; mints single-vendor Canary Aliases with forensic spam/leak source attribution and CCPA § 1798.115 third-party buyer audit notices.
- **Zero-Upload ID Redactor, Forensic Watermarker & Binary EXIF/GPS Stripper**: Client-side HTML5 Canvas blackout redaction, diagonal single-recipient watermarking, and lossless binary JPEG/PNG EXIF/GPS/XMP metadata removal for regulated FCRA freeze verifications.
- **Cryptographic SHA-256 Chain-of-Custody & Statutory Civil Penalty Calculator**: Computes per-record and master manifest SHA-256 digests over sent Message-IDs and broker tickets alongside itemized CCPA/CPRA/SB 362/TDPSA/CPA statutory penalty exposure.
- **Zero-Cloud AES-256-GCM Encrypted Workspace Vault & Regression Diffing**: Exports and restores passphrase-encrypted (`.enc.json` via PBKDF2-SHA256 + AES-256-GCM) or portable JSON workspace backups, records historical scan snapshots, detects re-listed broker regressions, and diagnoses live browser Global Privacy Control (`Sec-GPC: 1`) signals.
- **Deep & Dark Web Neutralization Center**: Generates direct Tor v3 `.onion` queries, clearnet relay links, darknet archive lookups, and step-by-step source-specific manual removal workflows.
- **Multi-Format Audit Dossiers**: Export exposure and statutory compliance records in PDF, CSV, Markdown (`.md`), Plain Text (`.txt`), AsciiDoc (`.adoc`), UNIX Troff (`.me`), Signed Chain-of-Custody JSON, and Encrypted JSON Vault.

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
