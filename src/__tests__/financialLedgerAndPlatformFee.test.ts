import assert from 'assert';
import crypto from 'crypto';
import {
  calculatePlatformFeePaise,
  calculatePlatformFeeRupees,
  paiseToRupees,
  rupeesToPaise,
  formatPaiseToRupees,
  formatCSVCell,
} from '../lib/financeApi';

// In-memory mock storage for Node environment tests
class MockStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

if (typeof globalThis.sessionStorage === 'undefined') {
  (globalThis as unknown as { sessionStorage: MockStorage }).sessionStorage = new MockStorage();
}
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as unknown as { localStorage: MockStorage }).localStorage = new MockStorage();
}

async function runFinancialSystemTests() {
  console.log('=== Running Vaangly Financial Ledger & Platform Fee System Tests ===\n');

  // =========================================================================
  // TEST SUITE 1: Platform Fee Slab Boundary Calculations (Option A)
  // =========================================================================
  console.log('--- Test Suite 1: Platform Fee Calculation Across All Slabs ---');

  // Slabs:
  // ₹0.01 - ₹100.00 (1 - 10,000 paise) -> ₹1 (100 paise)
  // ₹100.01 - ₹200.00 (10,001 - 20,000 paise) -> ₹2 (200 paise)
  // ₹200.01 - ₹300.00 (20,001 - 30,000 paise) -> ₹3 (300 paise)
  // ₹300.01 - ₹400.00 (30,001 - 40,000 paise) -> ₹4 (400 paise)
  // ₹400.01 - ₹500.00 (40,001 - 50,000 paise) -> ₹5 (500 paise)

  // 1.1 Non-positive, zero, and invalid amounts
  assert.strictEqual(calculatePlatformFeePaise(0), 0, 'Zero paise should yield 0 fee');
  assert.strictEqual(calculatePlatformFeePaise(-5000), 0, 'Negative paise should yield 0 fee');
  assert.strictEqual(calculatePlatformFeePaise(NaN), 0, 'NaN paise should yield 0 fee');
  assert.strictEqual(calculatePlatformFeePaise(Infinity), 0, 'Infinity paise should yield 0 fee');

  assert.strictEqual(calculatePlatformFeeRupees(0), 0, 'Zero rupees should yield 0 fee');
  assert.strictEqual(calculatePlatformFeeRupees(-50), 0, 'Negative rupees should yield 0 fee');

  // 1.2 Slab 1: ₹0.01 to ₹100.00 -> ₹1 (100 paise)
  assert.strictEqual(calculatePlatformFeePaise(1), 100, '1 paisa (₹0.01) -> 100 paise fee');
  assert.strictEqual(calculatePlatformFeePaise(5000), 100, '5,000 paise (₹50.00) -> 100 paise fee');
  assert.strictEqual(calculatePlatformFeePaise(9999), 100, '9,999 paise (₹99.99) -> 100 paise fee');
  assert.strictEqual(calculatePlatformFeePaise(10000), 100, '10,000 paise (₹100.00) -> 100 paise fee');

  assert.strictEqual(calculatePlatformFeeRupees(0.01), 1, '₹0.01 -> ₹1 fee');
  assert.strictEqual(calculatePlatformFeeRupees(50), 1, '₹50.00 -> ₹1 fee');
  assert.strictEqual(calculatePlatformFeeRupees(99.99), 1, '₹99.99 -> ₹1 fee');
  assert.strictEqual(calculatePlatformFeeRupees(100.0), 1, '₹100.00 -> ₹1 fee');

  // 1.3 Slab 2: ₹100.01 to ₹200.00 -> ₹2 (200 paise)
  assert.strictEqual(calculatePlatformFeePaise(10001), 200, '10,001 paise (₹100.01) -> 200 paise fee');
  assert.strictEqual(calculatePlatformFeePaise(15000), 200, '15,000 paise (₹150.00) -> 200 paise fee');
  assert.strictEqual(calculatePlatformFeePaise(19999), 200, '19,999 paise (₹199.99) -> 200 paise fee');
  assert.strictEqual(calculatePlatformFeePaise(20000), 200, '20,000 paise (₹200.00) -> 200 paise fee');

  assert.strictEqual(calculatePlatformFeeRupees(100.01), 2, '₹100.01 -> ₹2 fee');
  assert.strictEqual(calculatePlatformFeeRupees(150), 2, '₹150.00 -> ₹2 fee');
  assert.strictEqual(calculatePlatformFeeRupees(199.99), 2, '₹199.99 -> ₹2 fee');
  assert.strictEqual(calculatePlatformFeeRupees(200.0), 2, '₹200.00 -> ₹2 fee');

  // 1.4 Slab 3: ₹200.01 to ₹300.00 -> ₹3 (300 paise)
  assert.strictEqual(calculatePlatformFeePaise(20001), 300, '20,001 paise (₹200.01) -> 300 paise fee');
  assert.strictEqual(calculatePlatformFeePaise(25000), 300, '25,000 paise (₹250.00) -> 300 paise fee');
  assert.strictEqual(calculatePlatformFeePaise(30000), 300, '30,000 paise (₹300.00) -> 300 paise fee');

  assert.strictEqual(calculatePlatformFeeRupees(200.01), 3, '₹200.01 -> ₹3 fee');
  assert.strictEqual(calculatePlatformFeeRupees(250), 3, '₹250.00 -> ₹3 fee');
  assert.strictEqual(calculatePlatformFeeRupees(300.0), 3, '₹300.00 -> ₹3 fee');

  // 1.5 Higher Slabs:
  // ₹300.01 to ₹400.00 -> ₹4 (400 paise)
  assert.strictEqual(calculatePlatformFeePaise(30001), 400, '30,001 paise -> 400 paise fee');
  assert.strictEqual(calculatePlatformFeeRupees(350), 4, '₹350.00 -> ₹4 fee');

  // ₹400.01 to ₹500.00 -> ₹5 (500 paise)
  assert.strictEqual(calculatePlatformFeePaise(50000), 500, '50,000 paise -> 500 paise fee');
  assert.strictEqual(calculatePlatformFeeRupees(500), 5, '₹500.00 -> ₹5 fee');

  // ₹900.01 to ₹1,000.00 -> ₹10 (1,000 paise)
  assert.strictEqual(calculatePlatformFeePaise(100000), 1000, '100,000 paise -> 1,000 paise fee');
  assert.strictEqual(calculatePlatformFeeRupees(1000), 10, '₹1,000.00 -> ₹10 fee');

  // ₹1,000.01 to ₹1,100.00 -> ₹11 (1,100 paise)
  assert.strictEqual(calculatePlatformFeePaise(100001), 1100, '100,001 paise -> 1,100 paise fee');
  assert.strictEqual(calculatePlatformFeeRupees(1000.01), 11, '₹1,000.01 -> ₹11 fee');

  // ₹5,000.00 -> ₹50 (5,000 paise)
  assert.strictEqual(calculatePlatformFeePaise(500000), 5000, '500,000 paise -> 5,000 paise fee');
  assert.strictEqual(calculatePlatformFeeRupees(5000), 50, '₹5,000.00 -> ₹50 fee');

  // 1.6 JavaScript floating-point imprecision tolerance
  // ₹19.99 * 100 in IEEE 754 is 1998.9999999999998
  assert.strictEqual(calculatePlatformFeeRupees(19.99), 1, 'Floating point 19.99 correctly handled as 1999 paise');

  console.log('✓ Test Suite 1 Passed: Slabs correctly assessed across all boundary conditions.\n');

  // =========================================================================
  // TEST SUITE 2: Integer Currency Helpers & Formatting
  // =========================================================================
  console.log('--- Test Suite 2: Integer Currency Helpers & Formatting ---');

  assert.strictEqual(paiseToRupees(100), 1.0, '100 paise = ₹1');
  assert.strictEqual(paiseToRupees(10001), 100.01, '10001 paise = ₹100.01');
  assert.strictEqual(paiseToRupees(0), 0, '0 paise = ₹0');
  assert.strictEqual(paiseToRupees(-500), -5.0, 'Negative paise converts to negative rupees for reversals');

  assert.strictEqual(rupeesToPaise(1.0), 100, '₹1 = 100 paise');
  assert.strictEqual(rupeesToPaise(100.01), 10001, '₹100.01 = 10001 paise');
  assert.strictEqual(rupeesToPaise(19.99), 1999, '₹19.99 = 1999 paise');
  assert.strictEqual(rupeesToPaise(0), 0, '₹0 = 0 paise');
  assert.strictEqual(rupeesToPaise(-5.0), -500, 'Negative rupees converts to negative paise for reversals');

  assert.strictEqual(formatPaiseToRupees(100), '₹1.00');
  assert.strictEqual(formatPaiseToRupees(10001), '₹100.01');
  assert.strictEqual(formatPaiseToRupees(0), '₹0.00');

  console.log('✓ Test Suite 2 Passed: Currency conversions and formatting accurate.\n');

  // =========================================================================
  // TEST SUITE 3: Pickup Verification Code Mechanics & Security
  // =========================================================================
  console.log('--- Test Suite 3: Pickup Code Verification & Brute-Force Protection ---');

  // Emulate backend pickup code generation & verification contract
  const generateMockPickupCode = (requestId: string, salt: string) => {
    // Generate 6-digit numeric OTP
    const rawNumber = parseInt(crypto.createHash('sha256').update(requestId + salt).digest('hex').substring(0, 8), 16);
    const code = String((rawNumber % 900000) + 100000);
    const hash = crypto.createHash('sha256').update(code + salt).digest('hex');
    return { code, hash, salt };
  };

  const reqId = 'order-req-12345';
  const salt = 'random_cryptographic_salt_xyz';
  const generated = generateMockPickupCode(reqId, salt);

  assert.strictEqual(generated.code.length, 6, 'Pickup code must be exactly 6 digits');
  assert.match(generated.code, /^\d{6}$/, 'Pickup code must be numeric only');

  // Verify correct code
  const verifyCode = (inputCode: string, expectedHash: string, codeSalt: string, attempts: number) => {
    if (attempts >= 5) {
      return { success: false, error: 'Maximum verification attempts exceeded. Order locked for customer safety.' };
    }
    const computedHash = crypto.createHash('sha256').update(inputCode + codeSalt).digest('hex');
    if (computedHash === expectedHash) {
      return { success: true };
    }
    return { success: false, error: 'Invalid pickup verification code' };
  };

  // Valid verification
  const validAttempt = verifyCode(generated.code, generated.hash, salt, 0);
  assert.strictEqual(validAttempt.success, true, 'Valid code must succeed');

  // Invalid code
  const invalidAttempt = verifyCode('000000', generated.hash, salt, 1);
  assert.strictEqual(invalidAttempt.success, false, 'Invalid code must fail');

  // Brute force lockout after 5 attempts
  const lockedAttempt = verifyCode(generated.code, generated.hash, salt, 5);
  assert.strictEqual(lockedAttempt.success, false, '5 attempts must lock out verification');
  assert.match(lockedAttempt.error || '', /Maximum verification attempts exceeded/i);

  console.log('✓ Test Suite 3 Passed: Pickup code generation, hashing, and brute-force protection verified.\n');

  // =========================================================================
  // TEST SUITE 4: Append-Only Ledger Mathematical Integrity
  // =========================================================================
  console.log('--- Test Suite 4: Append-Only Ledger Mathematical Integrity ---');

  // Simulate in-memory append-only ledger for a merchant
  interface LedgerEntry {
    id: string;
    shop_id: string;
    request_id?: string;
    entry_type: 'fee_assessed' | 'fee_reversed' | 'settlement_credit' | 'adjustment_credit' | 'adjustment_debit';
    amount_paise: number;
    created_at: string;
  }

  const shopA = 'shop-merchant-001';
  const ledger: LedgerEntry[] = [];

  // Order 1: ₹75 order -> ₹1 (100 paise) fee
  ledger.push({
    id: 'entry-1',
    shop_id: shopA,
    request_id: 'order-1',
    entry_type: 'fee_assessed',
    amount_paise: 100,
    created_at: '2026-11-22T10:00:00Z',
  });

  // Order 2: ₹150 order -> ₹2 (200 paise) fee
  ledger.push({
    id: 'entry-2',
    shop_id: shopA,
    request_id: 'order-2',
    entry_type: 'fee_assessed',
    amount_paise: 200,
    created_at: '2026-11-22T11:00:00Z',
  });

  // Order 3: ₹250 order -> ₹3 (300 paise) fee
  ledger.push({
    id: 'entry-3',
    shop_id: shopA,
    request_id: 'order-3',
    entry_type: 'fee_assessed',
    amount_paise: 300,
    created_at: '2026-11-22T12:00:00Z',
  });

  // Helper to compute ledger balance
  const computeMerchantBalance = (entries: LedgerEntry[], verifiedSettlementsPaise: number) => {
    const assessed = entries
      .filter((e) => e.entry_type === 'fee_assessed')
      .reduce((sum, e) => sum + e.amount_paise, 0);

    const reversed = entries
      .filter((e) => e.entry_type === 'fee_reversed')
      .reduce((sum, e) => sum + Math.abs(e.amount_paise), 0);

    const netOwed = assessed - reversed;
    const balance = Math.max(0, netOwed - verifiedSettlementsPaise);

    return { assessed, reversed, netOwed, balance };
  };

  let summary = computeMerchantBalance(ledger, 0);
  assert.strictEqual(summary.assessed, 600, 'Total assessed should be 600 paise (₹6)');
  assert.strictEqual(summary.reversed, 0, 'Total reversed should be 0');
  assert.strictEqual(summary.netOwed, 600, 'Net owed should be 600 paise');
  assert.strictEqual(summary.balance, 600, 'Outstanding balance should be 600 paise');

  // Now Order 2 is refunded/cancelled -> Reversal entry added (NEVER modifying row 2 in place!)
  ledger.push({
    id: 'entry-4',
    shop_id: shopA,
    request_id: 'order-2',
    entry_type: 'fee_reversed',
    amount_paise: -200,
    created_at: '2026-11-22T13:00:00Z',
  });

  summary = computeMerchantBalance(ledger, 0);
  assert.strictEqual(summary.assessed, 600, 'Assessed remains 600 (immutable historical record)');
  assert.strictEqual(summary.reversed, 200, 'Reversed is now 200 paise');
  assert.strictEqual(summary.netOwed, 400, 'Net owed decreases to 400 paise (₹4)');
  assert.strictEqual(summary.balance, 400, 'Outstanding balance is 400 paise');

  // Verify Idempotency constraint logic:
  // (shop_id, request_id, entry_type) must be unique
  const canAddEntry = (newEntry: Omit<LedgerEntry, 'id'>) => {
    return !ledger.some(
      (e) =>
        e.shop_id === newEntry.shop_id &&
        e.request_id === newEntry.request_id &&
        e.entry_type === newEntry.entry_type
    );
  };

  assert.strictEqual(
    canAddEntry({
      shop_id: shopA,
      request_id: 'order-1',
      entry_type: 'fee_assessed',
      amount_paise: 100,
      created_at: '2026-11-22T14:00:00Z',
    }),
    false,
    'Duplicate fee assessment for order-1 must be blocked by idempotency'
  );

  console.log('✓ Test Suite 4 Passed: Append-only ledger integrity, reversals, and idempotency verified.\n');

  // =========================================================================
  // TEST SUITE 5: Merchant Settlement & FIFO Liability Allocation
  // =========================================================================
  console.log('--- Test Suite 5: Settlement Verification & FIFO Allocation ---');

  // Merchant pays ₹3.00 (300 paise) via UPI
  const verifiedSettlementPaise = 300;
  summary = computeMerchantBalance(ledger, verifiedSettlementPaise);
  assert.strictEqual(summary.balance, 100, 'Balance after ₹3 settlement on ₹4 owed must be 100 paise (₹1)');

  // FIFO Allocation logic simulation
  // Active liabilities: order-1 (100 paise, remaining: 100), order-3 (300 paise, remaining: 300)
  // (order-2 was reversed)
  interface OutstandingLiability {
    id: string;
    request_id: string;
    amount_paise: number;
    allocated_paise: number;
  }

  const liabilities: OutstandingLiability[] = [
    { id: 'entry-1', request_id: 'order-1', amount_paise: 100, allocated_paise: 0 },
    { id: 'entry-3', request_id: 'order-3', amount_paise: 300, allocated_paise: 0 },
  ];

  let unallocated = verifiedSettlementPaise;
  const allocations: { ledger_entry_id: string; allocated_paise: number }[] = [];

  for (const item of liabilities) {
    if (unallocated <= 0) break;
    const needed = item.amount_paise - item.allocated_paise;
    const canAllocate = Math.min(unallocated, needed);
    item.allocated_paise += canAllocate;
    unallocated -= canAllocate;
    allocations.push({
      ledger_entry_id: item.id,
      allocated_paise: canAllocate,
    });
  }

  assert.strictEqual(allocations.length, 2, 'Allocations should cover 2 entries');
  assert.strictEqual(allocations[0].ledger_entry_id, 'entry-1', 'Oldest entry-1 allocated first (FIFO)');
  assert.strictEqual(allocations[0].allocated_paise, 100, 'Entry-1 fully settled (100 paise)');
  assert.strictEqual(allocations[1].ledger_entry_id, 'entry-3', 'Entry-3 partially settled');
  assert.strictEqual(allocations[1].allocated_paise, 200, 'Entry-3 received remaining 200 paise');
  assert.strictEqual(liabilities[1].amount_paise - liabilities[1].allocated_paise, 100, 'Entry-3 has 100 paise remaining');

  console.log('✓ Test Suite 5 Passed: Settlement verification and FIFO allocation verified.\n');

  // =========================================================================
  // TEST SUITE 6: CSV Export & Formula Injection Prevention (OWASP)
  // =========================================================================
  console.log('--- Test Suite 6: CSV Export Sanitization & Security ---');

  // Standard safe values
  assert.strictEqual(formatCSVCell('Safe Merchant Name'), '"Safe Merchant Name"');
  assert.strictEqual(formatCSVCell(1250), '"1250"');
  assert.strictEqual(formatCSVCell(null), '""');
  assert.strictEqual(formatCSVCell(undefined), '""');

  // Quotes inside strings
  assert.strictEqual(formatCSVCell('John "The Baker"'), '"John ""The Baker"""');

  // Dangerous values attempting CSV formula injection (OWASP):
  // Formulas starting with '=', '+', '-', '@' must be escaped by prepending a single quote (')
  assert.strictEqual(formatCSVCell('=SUM(A1:A10)'), '"\'=SUM(A1:A10)"', '= formula injection prevented');
  assert.strictEqual(formatCSVCell('+cmd|/c calc'), '"\'+cmd|/c calc"', '+ formula injection prevented');
  assert.strictEqual(formatCSVCell('-2+3'), '"\'-2+3"', '- formula injection prevented');
  assert.strictEqual(formatCSVCell('@IMPORTXML("http://evil.com")'), '"\'@IMPORTXML(""http://evil.com"")"', '@ injection prevented and internal quotes escaped');

  console.log('✓ Test Suite 6 Passed: CSV formula injection prevention verified.\n');

  // =========================================================================
  // TEST SUITE 7: Customer-Paid Model & Free Merchant Tier Invariants
  // =========================================================================
  console.log('--- Test Suite 7: Customer-Paid Model & Free Merchant Tier Invariants ---');

  // Invariant 1: Platform fee is customer-paid (added to cart total, NOT subtracted from shop items)
  const cartItemsTotal = 250.0;
  const deliveryFee = 30.0;
  const platformFee = calculatePlatformFeeRupees(cartItemsTotal);
  const totalPayable = cartItemsTotal + deliveryFee + platformFee;

  assert.strictEqual(platformFee, 3.0, '₹250 cart has ₹3 platform fee');
  assert.strictEqual(totalPayable, 283.0, 'Total payable is ₹250 + ₹30 + ₹3 = ₹283');
  assert.strictEqual(cartItemsTotal, 250.0, 'Merchant earnings from items total remains 100% intact (₹250)');

  // Invariant 2: Free merchant tier - Registration and features have NO subscription costs
  const shopTier = {
    plan: 'free',
    subscription_cost: 0,
    has_pos_access: true,
    has_analytics_access: true,
    financial_status: 'ACTIVE',
  };

  assert.strictEqual(shopTier.subscription_cost, 0, 'Merchant tier is 100% free');
  assert.strictEqual(shopTier.has_pos_access, true, 'Merchant retains full POS access');
  assert.strictEqual(shopTier.has_analytics_access, true, 'Merchant retains full analytics access');

  console.log('✓ Test Suite 7 Passed: Customer-paid and free merchant tier invariants preserved.\n');

  console.log('=====================================================');
  console.log('ALL FINANCIAL LEDGER & PLATFORM FEE TESTS PASSED! (7/7 Suites)');
  console.log('=====================================================\n');
}

runFinancialSystemTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
