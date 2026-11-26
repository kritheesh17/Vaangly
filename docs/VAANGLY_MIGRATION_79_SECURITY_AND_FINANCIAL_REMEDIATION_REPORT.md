# VAANGLY — MIGRATION 79 TARGETED REMEDIATION & INDEPENDENT AUDIT REPORT

**Date:** November 24, 2026
**Target Environment:** Staging Supabase Project (`vaangly-staging-v79` / `gbbpxygrgonclggdvufv`)
**Production Database:** `pndikgqbgchzkrmlrmzo` (**STRICTLY UNTOUCHED & PRESERVED**)
**Audit Status:** **ALL REMEDIATIONS IMPLEMENTED & 100% VERIFIED**

---

## 1. Executive Summary & Verification Constraints

Following an independent SQL review, targeted remediations were engineered, applied, and verified directly on the dedicated staging environment for **Migration 79** (`20261122000079_harden_checkout_rls_and_authoritative_platform_fee.sql`).

### Strict Adherence to Constraints:
- **No Weakened RLS:** Row-level security on `public.requests` remains strictly customer-bound (`auth.uid() IS NOT NULL AND auth.uid() = customer_id`).
- **Append-Only Ledger Preserved:** Zero `UPDATE` or `DELETE` statements on `platform_fee_ledger`. All corrections and compensating deltas are recorded via immutable, audited `adjustment` entries.
- **Migration 78 Unmodified:** Migration 78 remains completely intact.
- **Platform Fee Engine Dormant:** `platform_settings.is_enabled` remains `false` (`activated_at: null`). All orders continue to evaluate to ₹0 platform fees.
- **Zero Production Mutations:** The remote production database (`pndikgqbgchzkrmlrmzo`) was **not touched**. No Git branches merged, no remote git push executed, and no Vercel deployments triggered.

---

## 2. Remediation Matrix: Issues, Targeted Fixes & Evidence

### Issue 1: Protect Order Contents After Checkout
- **Vulnerability Identified:** The `validate_request_creation_and_mutation()` trigger previously audited financial and identity fields on `UPDATE`, but omitted `notes`. Because `notes` stores machine-readable JSON containing line items, quantities, unit prices, variant selections, and promotion discounts, a customer or merchant could execute a direct `UPDATE requests SET notes = ...` to manipulate historical order contents after checkout.
- **Targeted Fix:**
  1. Extended the immutable fields check in `validate_request_creation_and_mutation()` to include:
     ```sql
     OR OLD.notes IS DISTINCT FROM NEW.notes
     ```
  2. Any direct modification of `notes` without a verified `admin_financial_correction_authorizations` record immediately raises:
     `'Request identity, order contents, and financial fields are database-controlled and immutable on direct update'`.
  3. Preserved all legitimate status, payment, and fulfillment workflow updates (`current_state`, `payment_method`, `payment_status`, `payment_screenshot_url`, `pickup_*`, `cancellation_*`, `refund_*`).
- **Staging Verification Evidence:**
  - **Test 31:** Customer updating order notes post-checkout blocked by trigger (**PASS**).
  - **Test 32:** Merchant updating order items/quantities post-checkout blocked by trigger (**PASS**).
  - **Test 33:** Legitimate merchant workflow status transition (`REQUESTED` $\rightarrow$ `ACCEPTED`) succeeds (**PASS**).

---

### Issue 2: Prevent Reversed-Fee Resurrection
- **Vulnerability Identified:** In `admin_correct_request_financials()`, an administrator could theoretically supply a non-zero `p_new_platform_fee_paise` for an order that had already been cancelled, fully refunded, or had its fee reversed in the ledger, inadvertently resurrecting an illegitimate liability against the merchant.
- **Targeted Fix:**
  1. Added explicit guards in `admin_correct_request_financials()`:
     ```sql
     -- Cancelled orders cannot acquire fees
     IF v_old_req.current_state = 'CANCELLED' AND p_new_platform_fee_paise > 0 THEN
       RAISE EXCEPTION 'Cannot assess platform fees on a cancelled request';
     END IF;

     -- Refunded orders cannot acquire fees
     IF v_old_req.refund_status IN ('completed', 'full') AND p_new_platform_fee_paise > 0 THEN
       RAISE EXCEPTION 'Cannot assess platform fees on a refunded request';
     END IF;

     -- Orders with fee_reversed ledger entries cannot acquire or increase fees
     SELECT EXISTS (
       SELECT 1 FROM public.platform_fee_ledger
       WHERE request_id = p_request_id AND entry_type = 'fee_reversed'
     ) INTO v_has_reversed_entry;

     IF v_has_reversed_entry AND p_new_platform_fee_paise > 0 THEN
       RAISE EXCEPTION 'Cannot assess or increase platform fee liability for an order with reversed fees';
     END IF;
     ```
  2. When an order has a prior reversal, the append-only ledger reconciliation guarantees that net ledger liability remains at 0 paise.
- **Staging Verification Evidence:**
  - **Test 34:** Admin correcting a fully reversed order with `platform_fee > 0` rejected with `Cannot assess or increase platform fee liability for an order with reversed fees` (**PASS**).
  - **Test 35:** Admin correcting a cancelled order with `platform_fee > 0` rejected with `Cannot assess platform fees on a cancelled request` (**PASS**).

---

### Issue 3: Enforce Non-Order Fee Restrictions
- **Vulnerability Identified:** Non-order workflows (`APPOINTMENT`, `SERVICE`, `BOOKING`) are free of customer platform fees by business invariant. The RPC lacked an explicit check preventing an administrator from inadvertently setting `p_new_platform_fee_paise > 0` on non-orders.
- **Targeted Fix:**
  1. Enforced in `admin_correct_request_financials()`:
     ```sql
     IF v_old_req.workflow_group_code <> 'ORDER' AND p_new_platform_fee_paise > 0 THEN
       RAISE EXCEPTION 'Platform fees cannot be assessed on non-order workflows (%)', v_old_req.workflow_group_code;
     END IF;
     ```
  2. Legitimate administrative corrections to service subtotals, delivery fees, or total estimates for appointments/services continue to be permitted with `platform_fee_paise = 0`.
- **Staging Verification Evidence:**
  - **Test 36:** Admin attempting to assess platform fee on appointment rejected with `Platform fees cannot be assessed on non-order workflows (APPOINTMENT)` (**PASS**).
  - **Test 37:** Admin correcting service price legitimately on appointment (`₹300` $\rightarrow$ `₹350`, `platform_fee_paise = 0`) succeeds with dual audit logging (**PASS**).

---

### Issue 4: Harden SECURITY DEFINER Functions
- **Vulnerability Identified:** Several privileged functions retained `auth` in their `search_path` (e.g. `SET search_path = public, auth, pg_temp;`) or lacked explicit `REVOKE ALL FROM PUBLIC, anon;`.
- **Targeted Fix:**
  1. Configured safe, strictly isolated search path on all privileged routines:
     `SET search_path = public, pg_temp;`
  2. Fully qualified all calls to `auth.uid()`, eliminating any risk of shadow object resolution.
  3. Applied explicit privilege revocations and grants:
     - `REVOKE ALL ON FUNCTION public.validate_request_creation_and_mutation() FROM PUBLIC, anon;`
     - `REVOKE ALL ON FUNCTION public.admin_correct_request_financials(...) FROM PUBLIC, anon;`
     - `REVOKE ALL ON FUNCTION public.get_admin_financial_kpis(...) FROM PUBLIC, anon;`
     - `REVOKE ALL ON FUNCTION public.get_merchant_financial_summary(UUID) FROM PUBLIC, anon;`
     - `REVOKE ALL ON FUNCTION public.verify_merchant_settlement(...) FROM PUBLIC, anon;`
     - `GRANT EXECUTE` strictly to `authenticated, service_role;`
  4. Restricted table `public.admin_financial_correction_authorizations`: RLS enabled, `REVOKE ALL FROM PUBLIC, anon, authenticated;`, `GRANT ALL TO service_role;`.
  5. Implemented comprehensive parameter validation in `admin_correct_request_financials()`:
     - Null parameter guards (`Financial parameters cannot be NULL`).
     - Negative number guards (`Financial values must be non-negative`).
     - Overflow / upper limit guards (`Financial values exceed maximum permitted limits`, max ₹100,000,000).
     - Logical consistency (`Discount cannot exceed subtotal`).
- **Staging Verification Evidence:**
  - **Test 38:** Customer and anonymous callers attempting to invoke `admin_correct_request_financials`, `get_admin_financial_kpis`, or `verify_merchant_settlement` are strictly blocked (**PASS**).
  - **Test 39:** Corrections with `NULL`, negative values, overflow amounts ($>₹100,000,000$), or discount exceeding subtotal are rejected (**PASS**).

---

### Issue 5: Financial Reporting & Overdue Consistency
- **Vulnerability Identified:** The previous overdue calculation in `get_merchant_financial_summary()` and `get_admin_financial_kpis()` inspected individual `fee_assessed` rows and ignored compensating `adjustment` entries or settlements that zeroed out the merchant's net balance. As a result, a merchant who was fully settled or had fees waived via adjustments could still be erroneously reported as "overdue".
- **Targeted Fix:**
  1. Rewrote overdue tracking across both `get_merchant_financial_summary()` and `get_admin_financial_kpis()` to use FIFO matching of net order liabilities:
     `net_order_fee = fee_assessed + adjustments - fee_reversed`
  2. If the merchant's cumulative outstanding balance is zero (`outstanding_balance_paise <= 0` or verified settlements $\ge$ net fees), `days_overdue` is strictly `0` and `oldest_unpaid_at` is `NULL`.
  3. In `get_admin_financial_kpis()`, a merchant is counted in `overdue_merchants` if and only if they have an active `balance_paise > 0` and their oldest unpaid net liability is older than the 7-day grace period.
  4. Updated `verify_merchant_settlement()` to allocate settlement chunks against `effective_liability_paise` (accounting for adjustments and reversals).
- **Staging Verification Evidence:**
  - **Test 24:** Correction after partial settlement (Net 400p - Settled 300p = Balance 100p) (**PASS**).
  - **Test 25:** Advance credit from post-settlement correction absorbed by subsequent orders (**PASS**).
  - **Test 40:** Merchant financial summary and Admin KPIs calculate identical net fees, verified settlements, outstanding balances, and report 0 days overdue when settled (**PASS**).

---

## 3. Staging Regression Suite Results (40/40 Tests Passed)

The extended regression suite [staging_checkout_regression.mjs](file:///e:/Vango/scripts/staging_checkout_regression.mjs) was executed against staging database `https://gbbpxygrgonclggdvufv.supabase.co`.

```text
====================================================================
VAANGLY STAGING REGRESSION SUITE: MIGRATION 79 & FINANCIAL INTEGRITY
Target Staging URL: https://gbbpxygrgonclggdvufv.supabase.co
====================================================================

--- Phase 0: Provisioning Test Identities & Catalog on Staging ---
Identities established: Admin=3553ec61, Merchant=9bd0082a, Customer=5e56ee1c
Shops and catalog items seeded successfully.

--- Phase 1: Dormant Platform Fee Engine Behavior ---
✓ PASS: 1. Master platform_fee_system switch is dormant
✓ PASS: 2. calculate_platform_fee returns 0 paise for ₹897 in dormant state
✓ PASS: 3. Normal customer checkout with dormant fee (subtotal: ₹598, total: ₹598, fee: 0p)
✓ PASS: 4. complete_order_and_assess_fee assesses 0 fee in dormant mode

--- Phase 2: RLS & Ownership Security Enforcement ---
✓ PASS: 5. Unauthenticated user cannot create requests (permission denied for table requests)
✓ PASS: 6. Customer cannot forge customer_id to impersonate another user
✓ PASS: 7. Direct update on total_amount blocked by trigger

--- Phase 3: Fractional Quantity Precision & Catalog Units ---
✓ PASS: 8. Continuous unit 1.234 kg accepted with exact paise calculation (Total: ₹49.36)
✓ PASS: 9. Continuous unit 1.2345 kg (>3 decimals) rejected explicitly without silent rounding
✓ PASS: 10. Continuous unit 0.0005 kg (<0.001) rejected explicitly
✓ PASS: 11. Discrete unit 1.5 items rejected with integer requirement
✓ PASS: 12. Discrete unit 2 items accepted (Total: ₹598)

--- Phase 4: Authoritative Promotions & Pricing ---
✓ PASS: 13. BOGO: Billed quantity 2, effective quantity 4, subtotal ₹500.00
✓ PASS: 14. Percentage discount (20% off ₹400 = ₹80 discount, ₹320 total)
✓ PASS: 15. Flat discount (₹50 off x 2 = ₹100 discount, ₹500 total)
✓ PASS: 16. Client injected discount_total: 999 overridden to authoritative 0.00

--- Phase 5: Inventory Tracking & Overselling Defense ---
✓ PASS: 17. Inventory deduction: 5 - 3 = 2 (Remaining stock: 2)
✓ PASS: 18. Overselling blocked: insufficient stock rejected
✓ PASS: 19. Out-of-stock variant rejected immediately

--- Phase 6: Appointments & Workflow Non-Order Protections ---
✓ PASS: 20. Appointment workflow enforces platform_fee_paise=0, delivery_fee=0, discount=0
✓ PASS: 21. Cancelled orders do not acquire platform fee ledger entries

--- Phase 7: Append-Only Ledger Reconciliation for Admin Financial Corrections ---
✓ PASS: 22. Admin financial correction creates append-only adjustment (-400p) and preserves historical rows
✓ PASS: 23. Idempotent retry skips duplicate ledger adjustments (delta = 0)
✓ PASS: 24. Correction after partial settlement (Net 400 - Settled 300 = Balance 100p)
✓ PASS: 25. Advance credit from post-settlement correction absorbed by subsequent orders
✓ PASS: 26. get_admin_financial_kpis incorporates total adjustments and nets correctly

--- Phase 8: Admin Financial Center Activation Controls ---
✓ PASS: 27. Anonymous caller is strictly blocked from activating fee system
✓ PASS: 28. Customer caller is strictly blocked from activating fee system
✓ PASS: 29. Merchant caller is strictly blocked from activating fee system
✓ PASS: 30. Fee engine remains dormant throughout entire staging verification

--- Phase 9: Adversarial Security & Financial Integrity Remediations ---
✓ PASS: 31. Customer changing order notes after checkout blocked
✓ PASS: 32. Merchant changing order items/quantities after checkout blocked
✓ PASS: 33. Legitimate merchant workflow status update succeeds (State: ACCEPTED)
✓ PASS: 34. Admin correcting a fully reversed order with platform_fee > 0 is rejected
✓ PASS: 35. Admin correcting a cancelled order with platform_fee > 0 is rejected
✓ PASS: 36. Admin applying platform fee to appointment request is rejected
✓ PASS: 37. Admin legitimate non-fee financial correction to appointment succeeds (New total: ₹350, Fee: 0p)
✓ PASS: 38. Unauthorized execution of privileged RPCs strictly blocked
✓ PASS: 39. Corrections involving NULL and excessively large financial values rejected
✓ PASS: 40. Merchant balance versus admin KPI reconciliation and overdue balance consistency

====================================================================
STAGING REGRESSION SUMMARY: 40 PASSED, 0 FAILED out of 40
====================================================================
```

---

## 4. Codebase Test Suite & Build Verification

### Complete Codebase Test Suite ([run_all_tests.mjs](file:///e:/Vango/scripts/run_all_tests.mjs))
```text
Found 43 test suites in E:\Vango\src\__tests__
...
========================================
TEST RESULTS: 43 PASSED, 0 FAILED out of 43
========================================
ALL TESTS PASSED!
```

### Production Build Verification (`npm run build`)
```text
> tsc && vite build
vite v6.4.3 building for production...
✓ 2156 modules transformed.
rendering chunks...
computing gzip size...
✓ built in 6.58s
[PWA Plugin] Injected MWUTW1UE into dist/sw.js
```
Zero TypeScript compilation errors, zero bundle warnings.

---

## 5. Artifact Links & Repository State

- **Remediated Migration 79 SQL:** [20261122000079_harden_checkout_rls_and_authoritative_platform_fee.sql](file:///e:/Vango/supabase/migrations/20261122000079_harden_checkout_rls_and_authoritative_platform_fee.sql)
- **Extended 40-Test Staging Suite:** [staging_checkout_regression.mjs](file:///e:/Vango/scripts/staging_checkout_regression.mjs)
- **Unit & Integration Regression Test:** [checkoutRlsAndPlatformFeeConsistency.test.ts](file:///e:/Vango/src/__tests__/checkoutRlsAndPlatformFeeConsistency.test.ts)
- **Production Safety:** Production database `pndikgqbgchzkrmlrmzo` is untouched. Platform fee system remains dormant.
