# synOUT Firestore Zero-Trust Security Specification (`security_spec.md`)

## 1. Data Invariants & Master Source of Truth

1. **Default-Deny Catch-All**: Every path outside `/users/{userId}`, `/users/{userId}/private/{contactId}`, and `/users/{userId}/vaults/{vaultId}` is unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity Gate**: Every write (`create`, `update`, `delete`) across every collection requires a non-null Firebase Auth session (`request.auth != null`) AND a verified email claim (`request.auth.token.email_verified == true`).
3. **Master Gate Relational Sync (Pillar 1)**: `/users/{userId}` is the Master Source of Truth. Neither `/users/{userId}/private/{contactId}` nor `/users/{userId}/vaults/{vaultId}` can be read, created, updated, or deleted unless `/users/{userId}` exists (or `existsAfter` during atomic initial registration batch) and its `uid` equals `request.auth.uid`. Deleting `/users/{userId}` immediately revokes access to all subcollections.
4. **PII Split-Collection Isolation (Pillar 6)**: Email addresses (`email`, `alertRecipientEmail`) are isolated inside `/users/{userId}/private/contact` (`contactId == 'contact'`), never stored in `/users/{userId}`. All workspace scan data, phone numbers, addresses, receipts, and POA signatures are encrypted client-side with `AES-256-GCM` (`PBKDF2-SHA256`) before reaching `/users/{userId}/vaults/{vaultId}`.
5. **Zero Unbounded Lists & Zero Collection Scraping (Pillars 5 & 8)**: The client accesses single deterministic document paths (`doc(db, 'users', uid)`, `doc(db, 'users', uid, 'private', 'contact')`, `doc(db, 'users', uid, 'vaults', 'primary')`). Collection-wide `list` operations are explicitly denied (`allow list: if false;`) on all paths.
6. **Temporal & Immutable Integrity**: `createdAt`, `uid`, `ownerId`, and `vaultId` are immutable after creation. `createdAt` (on create) and `updatedAt` (on create and update) must strictly equal `request.time`.

---

## 2. Example Payloads for the Eight Pillars of Hardened Rules

- **Pillar 1 (Master Gate)**: Creating `/users/u_123/vaults/primary` when `/users/u_123` does not exist -> `PERMISSION_DENIED`.
- **Pillar 2 (Anti-Update-Gap Blueprint)**: Updating `/users/u_123` with `{ displayName: "" }` (violates `minLength: 1` in `isValidUserAccount`) -> `PERMISSION_DENIED`.
- **Pillar 3 (Path Variable Hardening)**: Creating `/users/bad$id!/vaults/primary` or a 200-char `vaultId` -> `PERMISSION_DENIED`.
- **Pillar 4 (Action-Based Tiered Updates)**: Updating `/users/u_123/vaults/primary` only via `isVaultRefreshAction` (`ciphertextBase64`, `ivBase64`, `saltBase64`, `kdfIterations`, `payloadSha256`, `exposedCount`, `removedCount`, `trackedCount`, `profilesCount`, `deviceLabel`, `updatedAt`).
- **Pillar 5 (Total Array Guarding)**: Zero arbitrary client arrays are permitted in any document schema; `keys().hasOnly(...)` strictly locks allowed map keys.
- **Pillar 6 (PII Isolation)**: User `u_attacker` attempting `get` on `/users/u_victim/private/contact` -> `PERMISSION_DENIED`.
- **Pillar 7 (Atomicity Guarantee)**: Initial sign-in batch creating `/users/u_123` and `/users/u_123/private/contact` atomically succeeds via `existsAfter`, while standalone orphaned subcollection writes fail.
- **Pillar 8 (Query Enforcer)**: Any `list` query against `/users` or `/users/{userId}/vaults` -> `PERMISSION_DENIED`.

---

## 3. The "Dirty Dozen" Adversarial Payloads

All 12 payloads below are verified in `tests/firestore.rules.test.ts` to return `PERMISSION_DENIED`:

1. **DD-01 (Unverified Email Write Spoof)**: Authenticated user with `email_verified: false` attempts `create` on `/users/uid_alice`.
2. **DD-02 (Cross-Tenant Identity Spoof)**: User `uid_mallory` attempts `create` on `/users/uid_alice` or sets `uid: "uid_alice"` under `/users/uid_mallory`.
3. **DD-03 (Shadow / Ghost Field Injection)**: Owner `uid_alice` sends valid `UserAccount` plus `{ isAdmin: true }` on `create` or `update`.
4. **DD-04 (Orphaned Subcollection Write — Master Gate Bypass)**: Owner `uid_alice` attempts `create` on `/users/uid_alice/vaults/primary` without `/users/uid_alice` existing in DB or batch.
5. **DD-05 (ID Poisoning / Oversized Path Segment)**: Owner attempts write to `/users/uid_alice/vaults/vault$poisoned!id` or 150-char ID.
6. **DD-06 (PII Cross-User Read)**: Authenticated verified user `uid_bob` attempts `get` on `/users/uid_alice/private/contact`.
7. **DD-07 (Collection List Scraping)**: Authenticated verified user `uid_alice` attempts `list` on `/users` or `/users/uid_alice/vaults`.
8. **DD-08 (Immortal Field Mutation)**: Owner `uid_alice` attempts `update` on `/users/uid_alice/vaults/primary` mutating `createdAt` or `ownerId`.
9. **DD-09 (Client Timestamp Forgery)**: Owner `uid_alice` attempts `update` with `updatedAt` != `request.time` (backdated or future timestamp).
10. **DD-10 (Value Poisoning on Whitelisted Update Key)**: Owner `uid_alice` updates whitelisted `ciphertextBase64` with non-base64 script payload `"<script>alert(1)</script>"` or >800,000 byte string.
11. **DD-11 (Weak Crypto Downgrade)**: Owner `uid_alice` attempts `create` on `/users/uid_alice/vaults/primary` with `cipherAlgorithm: "AES-128-ECB"` or `kdfIterations: 10`.
12. **DD-12 (Arbitrary Private Contact Doc ID)**: Owner `uid_alice` attempts `create` on `/users/uid_alice/private/extra_doc` instead of canonical `contact`.

---

## 4. Test Runner

Executed via `tests/firestore.rules.test.ts` inside `npm test` (`tsx --test tests/*.test.ts`).
