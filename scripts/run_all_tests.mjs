import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const testDir = path.resolve('src/__tests__');
const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.ts'));

console.log(`Found ${files.length} test suites in ${testDir}\n`);

let passedCount = 0;
let failedCount = 0;
const failures = [];

for (const file of files) {
  const filePath = path.join(testDir, file);
  process.stdout.write(`Testing ${file}... `);
  const result = spawnSync(`npx tsx "${filePath}"`, {
    shell: true,
    encoding: 'utf8',
    env: { ...process.env }
  });

  if (result.status === 0) {
    console.log('✓ PASS');
    passedCount++;
  } else {
    console.log('✗ FAIL');
    failedCount++;
    failures.push({
      file,
      output: result.stdout + '\n' + result.stderr
    });
  }
}

console.log(`\n========================================`);
console.log(`TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED out of ${files.length}`);
console.log(`========================================\n`);

if (failures.length > 0) {
  console.log(`FAILURES DETAILS:`);
  for (const f of failures) {
    console.log(`\n--- [FAIL] ${f.file} ---`);
    console.log(f.output.trim());
  }
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED!');
}
