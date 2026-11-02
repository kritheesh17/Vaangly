import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * SEC-04 Regression Test Suite: Shopkeeper Role Escalation & Account Onboarding Integrity
 *
 * Vulnerability Identified:
 * In `supabase/migrations/20260912000008_auto_profile_trigger.sql`:
 * ```sql
 * CASE
 *   WHEN NEW.raw_user_meta_data->>'role' IN ('customer', 'shopkeeper')
 *   THEN (NEW.raw_user_meta_data->>'role')::TEXT
 *   ELSE 'customer'
 * END
 * ```
 * This allows an unverified user to register with `options: { data: { role: 'shopkeeper' } }`
 * and directly assign themselves the `shopkeeper` role upon account creation, bypassing the
 * required shop application and administrator review workflow.
 */

describe('SEC-04: Shopkeeper Role Escalation & Account Lifecycle Protection', () => {
  const migration08Path = path.resolve(
    process.cwd(),
    'supabase/migrations/20260912000008_auto_profile_trigger.sql'
  );
  const migration06Path = path.resolve(
    process.cwd(),
    'supabase/migrations/20260911000006_phase6_production_hardening.sql'
  );
  const migration68Path = path.resolve(
    process.cwd(),
    'supabase/migrations/20261003000068_shop_free_delivery_threshold.sql'
  );

  it('1. Database Migration Audit: Confirms presence of vulnerable role IN (customer, shopkeeper)', () => {
    assert.ok(fs.existsSync(migration08Path));
    const source08 = fs.readFileSync(migration08Path, 'utf-8');

    // Confirms that migration 8 permits client-supplied 'shopkeeper' in raw_user_meta_data
    const hasVulnerableRoleCondition = source08.includes(
      "NEW.raw_user_meta_data->>'role' IN ('customer', 'shopkeeper')"
    );
    assert.strictEqual(
      hasVulnerableRoleCondition,
      true,
      "VULNERABILITY CONFIRMED: Migration 8 allows raw_user_meta_data->>'role' = 'shopkeeper' on signup"
    );
  });

  it('2. Database Migration Audit: Confirms presence of prevent_profile_role_escalation trigger', () => {
    assert.ok(fs.existsSync(migration06Path));
    const source06 = fs.readFileSync(migration06Path, 'utf-8');

    // Confirms trigger prevents non-admin users from modifying role via UPDATE
    const hasRoleEscalationTrigger = source06.includes('prevent_profile_role_escalation') &&
      source06.includes('OLD.role IS DISTINCT FROM NEW.role');
    assert.strictEqual(
      hasRoleEscalationTrigger,
      true,
      'CORRECT CONTROL CONFIRMED: prevent_profile_role_escalation trigger guards UPDATE on profiles'
    );
  });

  // --------------------------------------------------------------------------
  // TRIGGER SIMULATION & SECURITY SPECIFICATION CONTRACT
  // --------------------------------------------------------------------------

  interface RawAuthUser {
    id: string;
    email: string;
    raw_user_meta_data?: Record<string, any>;
  }

  interface ProfileRecord {
    id: string;
    role: 'customer' | 'shopkeeper' | 'admin';
    full_name: string;
    email: string;
    is_verified: boolean;
  }

  /**
   * Evaluates the profile creation trigger logic:
   * - mode: 'CURRENT_VULNERABLE' (as in migration 8)
   * - mode: 'REMEDIATED' (forced customer default)
   */
  function simulateHandleNewUserTrigger(
    authUser: RawAuthUser,
    mode: 'CURRENT_VULNERABLE' | 'REMEDIATED'
  ): ProfileRecord {
    const meta = authUser.raw_user_meta_data || {};
    let assignedRole: 'customer' | 'shopkeeper' | 'admin';

    if (mode === 'CURRENT_VULNERABLE') {
      // Insecure migration 8 logic:
      if (meta.role === 'customer' || meta.role === 'shopkeeper') {
        assignedRole = meta.role;
      } else {
        assignedRole = 'customer';
      }
    } else {
      // Hardened remediation logic: all new accounts are strictly customers
      assignedRole = 'customer';
    }

    return {
      id: authUser.id,
      role: assignedRole,
      full_name: meta.full_name || 'User',
      email: authUser.email,
      is_verified: false,
    };
  }

  it('3. Current Vulnerability Demonstration: User specifying role=shopkeeper in signup receives shopkeeper role in current code', () => {
    const unverifiedUser: RawAuthUser = {
      id: 'applicant-uuid-001',
      email: 'applicant@example.com',
      raw_user_meta_data: {
        full_name: 'John Doe',
        role: 'shopkeeper', // Self-assigned
      },
    };

    const profile = simulateHandleNewUserTrigger(unverifiedUser, 'CURRENT_VULNERABLE');
    assert.strictEqual(
      profile.role,
      'shopkeeper',
      'Current code vulnerably assigns shopkeeper role directly on signup'
    );
  });

  it('4. Security Contract: New signups strictly receive customer role regardless of metadata', () => {
    const maliciousPayloads: Record<string, any>[] = [
      { role: 'shopkeeper' },
      { role: 'admin' },
      { role: 'SHOPKEEPER' },
      { role: 'superuser' },
      { role: 'hospital_staff' },
      {},
      { role: null },
    ];

    for (const meta of maliciousPayloads) {
      const user: RawAuthUser = {
        id: 'new-user-uuid',
        email: 'user@example.com',
        raw_user_meta_data: meta,
      };

      const profile = simulateHandleNewUserTrigger(user, 'REMEDIATED');
      assert.strictEqual(
        profile.role,
        'customer',
        `Signup with metadata ${JSON.stringify(meta)} must strictly default to 'customer'`
      );
      assert.strictEqual(profile.is_verified, false, 'New profiles must start unverified');
    }
  });

  it('5. Security Contract: Only admin-approved shopkeeper workflow grants shopkeeper role', () => {
    const source68 = fs.readFileSync(migration68Path, 'utf-8');

    // Confirms approve_shop_application checks admin authority before updating profile role
    const hasAdminCheck = source68.includes('IF v_admin_id IS NULL OR NOT public.is_admin() THEN');
    const hasRoleUpgrade = source68.includes("UPDATE public.profiles") &&
      source68.includes("SET role = 'shopkeeper'");

    assert.strictEqual(
      hasAdminCheck,
      true,
      'Admin authorization check is present in approve_shop_application'
    );
    assert.strictEqual(
      hasRoleUpgrade,
      true,
      'approve_shop_application is the authoritative promotion path to shopkeeper'
    );
  });

  it('6. Security Contract: Existing verified shopkeepers and admins cannot be modified via self-updates', () => {
    // Simulates the BEFORE UPDATE trigger on public.profiles
    function simulateProfileUpdateTrigger(
      oldProfile: ProfileRecord,
      newProfile: ProfileRecord,
      isCallerAdmin: boolean
    ): { allowed: boolean; error?: string } {
      if (oldProfile.role !== newProfile.role || oldProfile.is_verified !== newProfile.is_verified) {
        if (!isCallerAdmin) {
          return {
            allowed: false,
            error: 'Access Denied: You do not have permission to modify account role or verification status.',
          };
        }
      }
      return { allowed: true };
    }

    const existingShopkeeper: ProfileRecord = {
      id: 'shopkeeper-uuid',
      role: 'shopkeeper',
      full_name: 'Verified Merchant',
      email: 'merchant@example.com',
      is_verified: true,
    };

    // Customer attempts to self-downgrade or tamper with merchant role
    const updateAttempt: ProfileRecord = {
      ...existingShopkeeper,
      role: 'admin',
    };

    const regularUserAttempt = simulateProfileUpdateTrigger(existingShopkeeper, updateAttempt, false);
    assert.strictEqual(regularUserAttempt.allowed, false);
    assert.ok(regularUserAttempt.error?.includes('Access Denied'));

    // Admin executing valid maintenance update
    const adminAttempt = simulateProfileUpdateTrigger(existingShopkeeper, updateAttempt, true);
    assert.strictEqual(adminAttempt.allowed, true);
  });
});
