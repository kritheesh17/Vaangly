# Vaangly Supabase Region Migration Feasibility Report (Tokyo $\to$ Mumbai)

**Document:** Supabase Region Migration Feasibility Study  
**Source Region:** AWS Tokyo (`ap-northeast-1`) — Project ID: `pndikgqbgchzkrmlrmzo`  
**Target Region:** AWS Mumbai (`ap-south-1`)  
**Status:** **EVALUATION ONLY — NOT AUTHORIZED FOR EXECUTION**  
**Author:** Senior Release & Database Infrastructure Engineer  

---

## 1. Executive Summary & Latency Justification

Vaangly's production Supabase cluster currently resides in `ap-northeast-1` (Tokyo, Japan). Because Vaangly's customer and shopkeeper base is localized in India, every HTTP/REST, Auth, and Edge Function invocation incurs a cross-continent network round-trip penalty:

- **Current Indian Latency to Tokyo (`ap-northeast-1`):**
  - TCP + TLS 1.3 handshake: **~107 ms**
  - Warm HTTP Keep-Alive RTT: **~208 ms**
  - Cold request with TLS negotiation: **~320 ms to 1,550 ms**
- **Expected Indian Latency to Mumbai (`ap-south-1`):**
  - TCP + TLS 1.3 handshake: **~10–15 ms**
  - Warm HTTP Keep-Alive RTT: **~20–30 ms**
  - **Latency Improvement:** **85% to 90% reduction in raw network latency** for every database query, real-time subscription, and Edge Function invocation.

Supabase does not offer a native automated 1-click in-place region relocation. A migration requires provisioning a new Supabase project in `ap-south-1` and executing a controlled data and service cutover.

---

## 2. Backup and Restore Strategy

### A. Pre-Migration Baseline Backup
1. **Full Schema & Data Dump:**
   Execute a consistent logical backup from the source database using `pg_dump`:
   ```bash
   # Export schema
   pg_dump -h db.pndikgqbgchzkrmlrmzo.supabase.co -U postgres -d postgres \
     --clean --if-exists --schema-only -F p -f vaangly_prod_schema.sql

   # Export data with data-only flag, preserving referential integrity
   pg_dump -h db.pndikgqbgchzkrmlrmzo.supabase.co -U postgres -d postgres \
     --data-only --exclude-schema='auth' --exclude-schema='storage' -F c -f vaangly_prod_public_data.dump
   ```
2. **Migration Files Parity Check:**
   Verify that all 73 existing repository migrations in `supabase/migrations/` apply cleanly to a blank Postgres 15+ database to confirm reproducible schema parity.

### B. Target Database Provisioning & Restoration
1. Provision a new project in the Supabase Dashboard selecting Region: **`ap-south-1` (Mumbai)**.
2. Apply repository migrations `20260918000001_initial_schema.sql` through `20261106000073_checkout_payment_redesign.sql`.
3. Restore public table data using `pg_restore`:
   ```bash
   pg_restore -h db.[NEW_PROJECT_REF].supabase.co -U postgres -d postgres \
     --data-only --disable-triggers vaangly_prod_public_data.dump
   ```
4. Re-enable triggers and verify sequence numbers (`pg_sequences`) to ensure automatic increment IDs (e.g. references, audit rows) continue without collision.

---

## 3. Auth Migration

Supabase Auth uses the `auth` PostgreSQL schema containing `auth.users`, `auth.identities`, and `auth.sessions`.

1. **Password Hash & Identity Migration:**
   - Supabase encrypts passwords with bcrypt. These hashes can be migrated directly into the target project without requiring users to reset passwords.
   - Use the Supabase CLI / Auth export command:
     ```bash
     pg_dump -h db.pndikgqbgchzkrmlrmzo.supabase.co -U postgres -d postgres \
       --data-only --schema=auth -F c -f vaangly_prod_auth.dump
     ```
   - Restore into the target project using the `supabase_admin` role.
2. **Active JWT Sessions:**
   - Existing active JWTs issued by the Tokyo project ref will not match the new project ref's JWT secret.
   - **User Impact:** Existing logged-in users on web/PWA will have their refresh tokens invalidated and will be prompted to log in again upon first visit post-cutover.
3. **OAuth Providers:**
   - Update Google and Apple OAuth redirect URLs in the developer consoles to include `https://[NEW_PROJECT_REF].supabase.co/auth/v1/callback`.

---

## 4. Storage Migration

Vaangly currently utilizes 3 production storage buckets:
- `payment-proofs` (private, encrypted RLS)
- `shop-photos` (public)
- `id-proofs` (private admin RLS)

### Storage Migration Steps:
1. **Bucket Creation:** Recreate the 3 storage buckets in the Mumbai project with matching public/private permissions and size limits.
2. **Object Sync:**
   - Use an automated S3 synchronization script via AWS CLI or Supabase Storage Migration utility:
     ```bash
     # Sync objects directly between S3-compatible endpoints
     aws s3 sync s3://pndikgqbgchzkrmlrmzo/payment-proofs s3://[NEW_PROJECT_REF]/payment-proofs \
       --endpoint-url https://pndikgqbgchzkrmlrmzo.supabase.co/storage/v1/s3
     ```
3. **Database Records Parity:**
   - Dump and restore `storage.objects` table metadata to preserve object paths, upload timestamps, and owner IDs.

---

## 5. Edge Function Migration

1. **Function Code:**
   - The hardened push notification function (`supabase/functions/send-push-notification/index.ts`) is fully portable.
2. **Deployment to Mumbai:**
   - Link to the new project and deploy:
     ```bash
     npx supabase link --project-ref [NEW_PROJECT_REF]
     npx supabase functions deploy send-push-notification
     ```
3. **Secrets Configuration:**
   - Re-set required secrets on the new Mumbai project:
     ```bash
     npx supabase secrets set \
       VAPID_PUBLIC_KEY="..." \
       VAPID_PRIVATE_KEY="..." \
       VAPID_EMAIL="mailto:support@vaangly.com"
     ```

---

## 6. DNS and Environment Changes

1. **Vercel Production Environment Variables:**
   Update the following in the Vercel project settings:
   - `VITE_SUPABASE_URL`: `https://[NEW_PROJECT_REF].supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `[NEW_ANON_KEY]`
2. **Android Native App (`capacitor.config.ts` / `.env`):**
   - Update the production API endpoint build config for the next Android APK/AAB release.

---

## 7. Data Consistency & Freeze Strategy

To prevent split-brain data corruption during the migration:
1. **Source Project Read-Only Freeze:**
   - Immediately prior to final dump, toggle the source database into read-only mode or pause active incoming traffic by revoking `anon` and `authenticated` role permissions:
     ```sql
     ALTER ROLE anon NOLOGIN;
     ALTER ROLE authenticated NOLOGIN;
     ```
2. **Verification Checksum:**
   - Count rows across `profiles`, `shops`, `shop_products`, `requests`, `request_events`, and `appointments` to verify 100% data parity between source and destination before cutting over traffic.

---

## 8. Downtime Window & Maintenance Plan

- **Maintenance Type:** Planned Scheduled Maintenance
- **Estimated Window:** **15 to 30 minutes**
- **Maintenance Steps:**
  - `T-00`: Display maintenance banner on Vercel frontend.
  - `T-03`: Revoke login on Tokyo database (freeze mutations).
  - `T-05`: Run final delta `pg_dump` of source database and storage.
  - `T-10`: Restore data into Mumbai Supabase cluster.
  - `T-18`: Verify row counts, foreign keys, and run regression tests against Mumbai.
  - `T-22`: Update Vercel environment variables and trigger deployment.
  - `T-25`: Verify live smoke tests on Mumbai.
  - `T-30`: Remove maintenance banner; open platform to users.

---

## 9. Rollback Plan

If unexpected failures occur during data restoration or verification:
1. **Immediate Abort Condition:** Any failure in restoring `requests`, `shops`, or `auth.users`, or database integrity check failure.
2. **Rollback Actions:**
   - Re-enable login on Tokyo database:
     ```sql
     ALTER ROLE anon LOGIN;
     ALTER ROLE authenticated LOGIN;
     ```
   - Revert Vercel environment variables back to `pndikgqbgchzkrmlrmzo`.
   - Remove maintenance banner.
   - **Rollback Time:** < 3 minutes. Zero data loss since the source database remained unmodified in read-only state.

---

## 10. Cost Implications

- **Supabase Pricing:**
  - Supabase Pro plan ($25/month) covers one project. During the migration window, two Pro projects will run concurrently for 24–48 hours until the Tokyo project is retired, incurring an estimated pro-rated cost of **~$1.00 to $2.00**.
  - No ongoing cost increase: the monthly subscription for `ap-south-1` is identical to `ap-northeast-1`.

---

## 11. Conclusion & Recommendation

| Criteria | Assessment |
| :--- | :--- |
| **Technical Feasibility** | **High** (Standard PostgreSQL dump/restore + Supabase CLI). |
| **Latency Benefit** | **Extreme** (Network RTT drops from ~208 ms to ~25 ms, an 88% speedup). |
| **Operational Risk** | **Low-Medium** (Mitigated by read-only freeze and 3-minute instant rollback). |
| **Current Action** | **ON HOLD — Awaiting explicit future authorization.** |
