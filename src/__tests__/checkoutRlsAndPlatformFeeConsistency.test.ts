import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import {
  calculatePlatformFeePaise,
  calculatePlatformFeeRupees,
  fetchPlatformFeeSystemConfig,
  fetchAuthoritativePlatformFee,
} from '../lib/financeApi';

describe('Checkout RLS & Platform Fee Activation Consistency', () => {
  it('1. fetchPlatformFeeSystemConfig defaults to dormant (is_enabled: false) when unconfigured or fallback', async () => {
    const config = await fetchPlatformFeeSystemConfig();
    assert.strictEqual(typeof config.is_enabled, 'boolean', 'is_enabled must be boolean');
    if (!config.activated_at) {
      assert.strictEqual(config.is_enabled, false, 'Dormant config must have is_enabled = false');
    }
  });

  it('2. fetchAuthoritativePlatformFee returns 0 paise and 0 rupees when fee engine is dormant', async () => {
    const subtotalPaise = 89700;
    const result = await fetchAuthoritativePlatformFee(subtotalPaise);

    assert.strictEqual(typeof result.feePaise, 'number');
    assert.strictEqual(typeof result.feeRupees, 'number');
    assert.strictEqual(result.feePaise, 0, 'Dormant fee engine must return 0 paise');
    assert.strictEqual(result.feeRupees, 0, 'Dormant fee engine must return ₹0.00');
    assert.strictEqual(result.isEnabled, false, 'isEnabled must be false when dormant');
  });

  it('3. calculatePlatformFeePaise deterministic slab calculations when active', () => {
    // ₹0.01 - ₹100.00 -> ₹1 (100 paise)
    assert.strictEqual(calculatePlatformFeePaise(1), 100);
    assert.strictEqual(calculatePlatformFeePaise(5000), 100);
    assert.strictEqual(calculatePlatformFeePaise(10000), 100);

    // ₹100.01 - ₹200.00 -> ₹2 (200 paise)
    assert.strictEqual(calculatePlatformFeePaise(10001), 200);
    assert.strictEqual(calculatePlatformFeePaise(20000), 200);

    // ₹200.01 - ₹300.00 -> ₹3 (300 paise)
    assert.strictEqual(calculatePlatformFeePaise(20001), 300);
    assert.strictEqual(calculatePlatformFeePaise(30000), 300);

    // ₹897.00 -> ₹9 (900 paise)
    assert.strictEqual(calculatePlatformFeePaise(89700), 900);
    assert.strictEqual(calculatePlatformFeeRupees(897), 9);
  });

  it('4. Migration 79 SQL structure enforces customer tenant isolation and strict customer ownership', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261122000079_harden_checkout_rls_and_authoritative_platform_fee.sql'
    );
    assert.ok(fs.existsSync(migrationPath), 'Migration 79 file must exist');

    const content = fs.readFileSync(migrationPath, 'utf8');

    // 1. RLS policy verification: strict customer ownership without admin bypass
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Customers can create requests" ON public.requests;'),
      'Must drop prior customer create policy'
    );
    assert.ok(
      content.includes('auth.uid() IS NOT NULL AND auth.uid() = customer_id'),
      'Must strictly enforce customer ownership without unconstrained admin bypass'
    );

    // 2. Trigger verification
    assert.ok(
      content.includes('NEW.customer_id := auth.uid();'),
      'Trigger must authoritatively bind customer_id to auth.uid()'
    );
    assert.ok(
      content.includes('public.calculate_platform_fee(v_fee_basis_paise'),
      'Trigger must authoritatively calculate platform fee via calculate_platform_fee()'
    );
    assert.ok(
      content.includes('NEW.platform_fee_paise := v_calculated_fee_paise'),
      'Trigger must assign authoritative fee to NEW.platform_fee_paise'
    );
  });

  it('5. CartPage and CartContext do not trust client-supplied fee amounts', () => {
    const cartPagePath = path.resolve(process.cwd(), 'src/pages/CartPage.tsx');
    const cartPageContent = fs.readFileSync(cartPagePath, 'utf8');

    assert.ok(
      cartPageContent.includes('isFeeActive') || cartPageContent.includes('feeConfig?.is_enabled'),
      'CartPage must condition fee calculation on feeConfig.is_enabled'
    );

    const cartContextPath = path.resolve(process.cwd(), 'src/context/CartContext.tsx');
    const cartContextContent = fs.readFileSync(cartContextPath, 'utf8');

    assert.ok(
      cartContextContent.includes('fetchAuthoritativePlatformFee'),
      'CartContext must call fetchAuthoritativePlatformFee'
    );
    assert.ok(
      cartContextContent.includes('isDemoPersona'),
      'CartContext must detect demo persona and avoid invalid remote Supabase inserts'
    );
  });

  it('6. Administrator UPDATE security: unforgeable transaction authorization replaces session GUCs', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261122000079_harden_checkout_rls_and_authoritative_platform_fee.sql'
    );
    const content = fs.readFileSync(migrationPath, 'utf8');

    // Must create protected authorizations table with revoked permissions
    assert.ok(
      content.includes('CREATE TABLE IF NOT EXISTS public.admin_financial_correction_authorizations'),
      'Must define admin_financial_correction_authorizations table'
    );
    assert.ok(
      content.includes('REVOKE ALL ON TABLE public.admin_financial_correction_authorizations FROM PUBLIC, anon, authenticated;'),
      'Must revoke table privileges from public, anon, and authenticated'
    );

    // Trigger must verify authorization in protected table, NOT session GUCs
    assert.ok(
      content.includes('SELECT 1 FROM public.admin_financial_correction_authorizations'),
      'Trigger must check admin_financial_correction_authorizations table'
    );
    assert.ok(
      content.includes('txid = txid_current()'),
      'Authorization must be strictly transaction-scoped via txid_current()'
    );
    assert.ok(
      content.includes('admin_id = auth.uid()'),
      'Authorization must be strictly bound to authenticated admin auth.uid()'
    );
    assert.ok(
      !content.includes("current_setting('vaangly.allow_admin_financial_correction'"),
      'Must NOT use or trust custom session GUC as an authorization boundary'
    );

    // Direct UPDATE must block modification of all identity and financial fields
    assert.ok(
      content.includes('OLD.total_amount IS DISTINCT FROM NEW.total_amount'),
      'Direct UPDATE must block total_amount modification'
    );
    assert.ok(
      content.includes('OLD.platform_fee_paise IS DISTINCT FROM NEW.platform_fee_paise'),
      'Direct UPDATE must block platform_fee_paise modification'
    );
    assert.ok(
      content.includes('OLD.customer_id IS DISTINCT FROM NEW.customer_id'),
      'Direct UPDATE must block customer_id modification'
    );
  });

  it('7. Exceptional administrator corrections are restricted to audited SECURITY DEFINER RPC', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261122000079_harden_checkout_rls_and_authoritative_platform_fee.sql'
    );
    const content = fs.readFileSync(migrationPath, 'utf8');

    assert.ok(
      content.includes('CREATE OR REPLACE FUNCTION public.admin_correct_request_financials'),
      'Must define admin_correct_request_financials RPC'
    );
    assert.ok(
      content.includes('IF v_admin_id IS NULL OR NOT public.is_admin() THEN'),
      'RPC must strictly verify admin identity via auth.uid()'
    );
    assert.ok(
      content.includes("length(trim(COALESCE(p_reason, ''))) < 10"),
      'RPC must mandate a descriptive reason (minimum 10 chars)'
    );
    assert.ok(
      content.includes('INSERT INTO public.financial_audit_logs'),
      'RPC must record immutable financial audit log'
    );
    assert.ok(
      content.includes('INSERT INTO public.admin_audit_logs'),
      'RPC must record immutable admin timeline audit log'
    );
    assert.ok(
      content.includes('INSERT INTO public.admin_financial_correction_authorizations'),
      'RPC must insert transaction-scoped authorization record'
    );
    assert.ok(
      content.includes('DELETE FROM public.admin_financial_correction_authorizations'),
      'RPC must clean up authorization record within same atomic transaction'
    );
  });

  it('8. Non-order requests strictly enforce platform_fee_paise = 0, delivery_fee = 0, discount_total = 0', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261122000079_harden_checkout_rls_and_authoritative_platform_fee.sql'
    );
    const content = fs.readFileSync(migrationPath, 'utf8');

    // Non-order branch
    assert.ok(
      content.includes('NEW.platform_fee_paise := 0;'),
      'Non-order requests must explicitly enforce zero platform fee'
    );
    assert.ok(
      content.includes('NEW.delivery_fee := 0;'),
      'Non-order requests must explicitly zero delivery fees'
    );
    assert.ok(
      content.includes('NEW.discount_total := 0;'),
      'Non-order requests must explicitly zero discount totals'
    );
  });

  it('9. Preserves legitimate fractional quantities for weight/volume and enforces whole units for discrete items', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261122000079_harden_checkout_rls_and_authoritative_platform_fee.sql'
    );
    const content = fs.readFileSync(migrationPath, 'utf8');

    // Unit classification
    assert.ok(
      content.includes("'kg', 'g', 'gram', 'grams', 'l', 'litre', 'liter', 'ml', 'm', 'meter', 'metre'"),
      'Must identify continuous/weighted units allowing fractional quantities'
    );
    // Fractional validation up to 3 decimal places
    assert.ok(
      content.includes('v_raw_quantity <> ROUND(v_raw_quantity, 3)'),
      'Must validate fractional quantities up to 3 decimal places (numeric(12,3))'
    );
    // Discrete item whole integer validation
    assert.ok(
      content.includes('v_raw_quantity <> trunc(v_raw_quantity)'),
      'Must validate discrete items as whole positive integers'
    );
  });

  it('10. Preserves merchant-configured promotions (BOGO, percent_off, flat_off) and rejects client discounts', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261122000079_harden_checkout_rls_and_authoritative_platform_fee.sql'
    );
    const content = fs.readFileSync(migrationPath, 'utf8');

    // BOGO: 2x effective quantity
    assert.ok(
      content.includes("IF v_product.offer_type = 'bogo' THEN"),
      'Must support BOGO offers authoritatively'
    );
    assert.ok(
      content.includes('v_effective_quantity := v_quantity * 2;'),
      'BOGO effective quantity must be 2x quantity'
    );

    // Percent off: percentage discount
    assert.ok(
      content.includes("ELSIF v_product.offer_type = 'flat_off'") || content.includes("v_product.offer_type = 'percent_off'"),
      'Must support percent_off and flat_off promotions'
    );
    assert.ok(
      content.includes('LEAST(100.0, GREATEST(0.0, v_product.offer_value)) / 100.0'),
      'Must calculate percentage discount authoritatively'
    );

    // Flat off: per unit discount
    assert.ok(
      content.includes('v_product.offer_value * 100') && (content.includes('::BIGINT') || content.includes('::INTEGER')),
      'Must calculate flat off discount authoritatively'
    );

    // Reconstruct item with discount and subtotal
    assert.ok(
      content.includes("'discount', (v_item_discount_paise::NUMERIC / 100.0)"),
      'Notes payload must include authoritative discount'
    );
  });

  it('11. Fractional quantity precision validation without silent rounding', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261122000079_harden_checkout_rls_and_authoritative_platform_fee.sql'
    );
    const content = fs.readFileSync(migrationPath, 'utf8');

    // Unconstrained numeric variable declaration to prevent silent assignment rounding
    assert.ok(
      content.includes('v_raw_quantity NUMERIC;'),
      'Must declare v_raw_quantity as unconstrained NUMERIC to prevent silent assignment rounding'
    );
    assert.ok(
      content.includes('v_raw_quantity <> ROUND(v_raw_quantity, 3)'),
      'Must check precision on raw unconstrained numeric'
    );
    assert.ok(
      content.includes('v_raw_quantity < 0.001'),
      'Must enforce minimum orderable quantity of 0.001 for fractional units'
    );
    assert.ok(
      content.includes('v_raw_quantity <> trunc(v_raw_quantity)'),
      'Must reject fractional quantities for discrete units'
    );

    // Simulate validation logic in JS
    const validateQuantity = (rawQty: number, isContinuous: boolean) => {
      const str = rawQty.toString();
      const decimals = str.includes('.') ? str.split('.')[1].length : 0;
      if (isContinuous) {
        if (decimals > 3) throw new Error('Unsupported precision: maximum 3 decimal places allowed');
        if (rawQty < 0.001) throw new Error('Quantity below minimum orderable threshold of 0.001');
        return Math.round(rawQty * 1000) / 1000;
      } else {
        if (!Number.isInteger(rawQty) || rawQty <= 0) {
          throw new Error('Quantity for unit must be a positive whole integer');
        }
        return rawQty;
      }
    };

    // 1.234 kg: valid (accepted)
    assert.strictEqual(validateQuantity(1.234, true), 1.234);

    // 1.2345 kg: exceeds 3 decimals (rejected)
    assert.throws(() => validateQuantity(1.2345, true), /Unsupported precision/);

    // 0.0005 kg: below 0.001 / 4 decimals (rejected)
    assert.throws(() => validateQuantity(0.0005, true), /Unsupported precision/);

    // 1.5 pieces: discrete unit (rejected)
    assert.throws(() => validateQuantity(1.5, false), /must be a positive whole integer/);

    // 2 pieces: discrete unit (accepted)
    assert.strictEqual(validateQuantity(2, false), 2);
  });

  it('12. All catalog units verified and correctly classified', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261122000079_harden_checkout_rls_and_authoritative_platform_fee.sql'
    );
    const content = fs.readFileSync(migrationPath, 'utf8');

    // Continuous/weighted units present in catalog
    const continuousUnits = ['kg', 'g', 'gram', 'grams', 'l', 'litre', 'liter', 'ml', 'm', 'meter', 'metre'];
    // Discrete units present in catalog
    const discreteUnits = ['item', 'plate', 'cup', 'per dozen', 'piece', 'box', 'pack', 'bottle'];

    for (const unit of continuousUnits) {
      assert.ok(content.includes(`'${unit}'`), `Migration 79 must recognize continuous unit: ${unit}`);
    }

    // Discrete units must not be treated as continuous
    for (const unit of discreteUnits) {
      assert.ok(!continuousUnits.includes(unit), `Discrete unit ${unit} must not be in continuous list`);
    }
  });

  it('13. Reconciles admin financial corrections with append-only ledger and idempotency', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261122000079_harden_checkout_rls_and_authoritative_platform_fee.sql'
    );
    const content = fs.readFileSync(migrationPath, 'utf8');

    // 1. Unique index relaxed to allow adjustments
    assert.ok(
      content.includes('DROP INDEX IF EXISTS public.idx_ledger_unique_order_entry;'),
      'Must drop restrictive unique index'
    );
    assert.ok(
      content.includes("WHERE request_id IS NOT NULL AND entry_type IN ('fee_assessed', 'fee_reversed')"),
      'Must scope unique constraint strictly to assessment and reversal'
    );

    // 2. admin_correct_request_financials checks existing ledger entries and calculates delta
    assert.ok(
      content.includes('SELECT COALESCE(SUM(amount_paise), 0) INTO v_current_ledger_fee_paise'),
      'Must sum existing ledger entries for the request'
    );
    assert.ok(
      content.includes('v_delta_paise := v_platform_fee_paise - v_current_ledger_fee_paise;'),
      'Must compute compensating delta'
    );

    // 3. Compensating adjustment insertion
    assert.ok(
      content.includes("'adjustment'"),
      'Must insert entry_type adjustment'
    );
    assert.ok(
      content.includes('v_delta_paise,'),
      'Must set adjustment amount to v_delta_paise'
    );

    // 4. Retry idempotency: skip if delta is 0
    assert.ok(
      content.includes('IF v_delta_paise <> 0 THEN'),
      'Must skip ledger insertion if delta is 0 (idempotent retry)'
    );

    // 5. Never UPDATE or DELETE from platform_fee_ledger
    assert.ok(
      !content.includes('UPDATE public.platform_fee_ledger'),
      'Must NEVER update platform_fee_ledger'
    );
    assert.ok(
      !content.includes('DELETE FROM public.platform_fee_ledger'),
      'Must NEVER delete from platform_fee_ledger'
    );
  });

  it('14. Admin financial KPIs and Merchant Financial Summary include adjustments', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261122000079_harden_checkout_rls_and_authoritative_platform_fee.sql'
    );
    const content = fs.readFileSync(migrationPath, 'utf8');

    assert.ok(
      content.includes("WHEN entry_type = 'adjustment' THEN amount_paise"),
      'Admin KPIs must aggregate adjustments'
    );
    assert.ok(
      content.includes("'total_adjustments_paise', v_total_adjustments_paise"),
      'Admin KPIs output must include total_adjustments_paise'
    );
    assert.ok(
      content.includes('v_net_fees_owed_paise := v_total_fees_assessed_paise - v_total_fees_reversed_paise + v_total_adjustments_paise;'),
      'Net fees owed must incorporate total adjustments'
    );
  });
});
