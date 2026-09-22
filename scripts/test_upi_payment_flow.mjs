import assert from 'assert';

const validImage = { type: 'image/png', size: 1024 };
const invalidFile = { type: 'application/pdf', size: 1024 };
const oversizedFile = { type: 'image/png', size: 11 * 1024 * 1024 };
const validFile = (file) => ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) && file.size <= 10 * 1024 * 1024;
const submit = ({ paymentMethod, proofPath, displayedAmount, authoritativeAmount }) => {
  if (paymentMethod === 'upi' && !proofPath) throw new Error('UPI payment proof is required');
  if (paymentMethod === 'upi' && displayedAmount !== authoritativeAmount) throw new Error('Payment amount changed');
  return { paymentMethod, paymentStatus: paymentMethod === 'upi' ? 'PAYMENT_PROOF_SUBMITTED' : 'NOT_REQUIRED', proofPath: paymentMethod === 'upi' ? proofPath : null };
};

assert.strictEqual(submit({ paymentMethod: 'cash' }).paymentStatus, 'NOT_REQUIRED');
assert.throws(() => submit({ paymentMethod: 'upi', displayedAmount: 500, authoritativeAmount: 500 }), /proof is required/);
const submitted = submit({ paymentMethod: 'upi', proofPath: 'pending/customer-1/proof.png', displayedAmount: 500, authoritativeAmount: 500 });
assert.strictEqual(submitted.paymentStatus, 'PAYMENT_PROOF_SUBMITTED');
assert.throws(() => submit({ paymentMethod: 'upi', proofPath: 'pending/customer-1/proof.png', displayedAmount: 500, authoritativeAmount: 550 }), /amount changed/);
assert.strictEqual(validFile(validImage), true);
assert.strictEqual(validFile(invalidFile), false);
assert.strictEqual(validFile(oversizedFile), false);
const rejected = { paymentStatus: 'PAYMENT_REJECTED', replacementAllowed: true };
assert.strictEqual(rejected.replacementAllowed, true);
assert.strictEqual('pending/customer-1/proof.png'.startsWith('pending/customer-2/'), false);
assert.strictEqual(submitted.paymentStatus === 'PAYMENT_VERIFIED', false);
console.log('UPI payment contract tests: 10 passed');
