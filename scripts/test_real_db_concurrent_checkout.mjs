import { execSync, spawn } from 'child_process';

function runPsql(sql) {
  return execSync('docker exec -i supabase_db_Vango psql -U postgres -d postgres -t -A', {
    input: sql,
    encoding: 'utf-8',
  }).trim();
}

async function runAsyncPsql(sql) {
  return new Promise((resolve) => {
    const proc = spawn('docker', ['exec', '-i', 'supabase_db_Vango', 'psql', '-U', 'postgres', '-d', 'postgres'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.stdin.write(sql);
    proc.stdin.end();
  });
}

async function runConcurrencyTest() {
  console.log('=== REAL DATABASE CONCURRENT CHECKOUT PROTECTION TEST ===');

  // 1. Get test shop and customer
  const shopId = runPsql("SELECT id FROM public.shops WHERE status = 'active' AND is_live LIMIT 1;");
  const customerA = runPsql("SELECT id FROM auth.users LIMIT 1;");
  const customerB = runPsql(`SELECT id FROM auth.users WHERE id <> '${customerA}' LIMIT 1;`);

  console.log(`Using Shop: ${shopId}, Customer A: ${customerA}, Customer B: ${customerB}`);

  // 2. Create test product with stock = 1 for variant 'var_race'
  const rawProductOutput = runPsql(`
    INSERT INTO public.shop_products (
      shop_id, name, description, price, unit, has_variants, variants, track_inventory, is_available
    ) VALUES (
      '${shopId}',
      'Concurrent Race Test Item',
      'Stock race test item',
      150.00,
      'piece',
      TRUE,
      jsonb_build_array(
        jsonb_build_object('id', 'var_race', 'label', 'Last Item', 'price', 150, 'stock_quantity', 1, 'in_stock', true, 'is_available', true),
        jsonb_build_object('id', 'var_other', 'label', 'Other Item', 'price', 200, 'stock_quantity', 10, 'in_stock', true, 'is_available', true)
      ),
      TRUE,
      TRUE
    ) RETURNING id;
  `);
  const productId = rawProductOutput.split('\n')[0].trim();

  console.log(`Created test product with variant stock = 1: ${productId}`);

  try {
    // 3. Fire two simultaneous checkout transactions for customer A and customer B
    const orderSqlA = `
      SET request.jwt.claim.sub = '${customerA}';
      INSERT INTO public.requests (
        shop_id, customer_id, workflow_group_code, request_kind, fulfillment_type, current_state, reference_code, notes
      ) VALUES (
        '${shopId}',
        '${customerA}',
        'ORDER',
        'ORDER',
        'TAKEAWAY',
        'REQUESTED',
        'REQ-RACE-A-${Date.now()}',
        jsonb_build_object(
          'items', jsonb_build_array(
            jsonb_build_object('product_id', '${productId}', 'variant_id', 'var_race', 'quantity', 1)
          )
        )::text
      );
    `;

    const orderSqlB = `
      SET request.jwt.claim.sub = '${customerB}';
      INSERT INTO public.requests (
        shop_id, customer_id, workflow_group_code, request_kind, fulfillment_type, current_state, reference_code, notes
      ) VALUES (
        '${shopId}',
        '${customerB}',
        'ORDER',
        'ORDER',
        'TAKEAWAY',
        'REQUESTED',
        'REQ-RACE-B-${Date.now()}',
        jsonb_build_object(
          'items', jsonb_build_array(
            jsonb_build_object('product_id', '${productId}', 'variant_id', 'var_race', 'quantity', 1)
          )
        )::text
      );
    `;

    console.log('Dispatching 2 simultaneous checkout requests against the real database...');
    const [resultA, resultB] = await Promise.all([
      runAsyncPsql(orderSqlA),
      runAsyncPsql(orderSqlB),
    ]);

    const aSuccess = resultA.code === 0 && !resultA.stderr.includes('ERROR');
    const bSuccess = resultB.code === 0 && !resultB.stderr.includes('ERROR');

    console.log(`Result A: code=${resultA.code}, success=${aSuccess}`);
    if (!aSuccess) console.log(`Result A stderr snippet: ${resultA.stderr.trim()}`);
    console.log(`Result B: code=${resultB.code}, success=${bSuccess}`);
    if (!bSuccess) console.log(`Result B stderr snippet: ${resultB.stderr.trim()}`);

    // Verify exactly one succeeded and one failed
    if (aSuccess === bSuccess) {
      throw new Error(`Race condition failed! Both had same outcome: aSuccess=${aSuccess}, bSuccess=${bSuccess}`);
    }

    const failedResult = aSuccess ? resultB : resultA;
    if (!failedResult.stderr.includes('Selected variant is out of stock or unavailable')) {
      throw new Error(`Failed request had unexpected error: ${failedResult.stderr}`);
    }

    // 4. Verify stock in database is now exactly 0 and variant is unavailable
    const finalVariantJson = runPsql(`
      SELECT variants FROM public.shop_products WHERE id = '${productId}';
    `);
    const variants = JSON.parse(finalVariantJson);
    const raceVar = variants.find(v => v.id === 'var_race');

    console.log(`Final variant state in PostgreSQL: stock_quantity=${raceVar.stock_quantity}, in_stock=${raceVar.in_stock}, is_available=${raceVar.is_available}`);

    if (raceVar.stock_quantity !== 0 || raceVar.in_stock !== false || raceVar.is_available !== false) {
      throw new Error(`Variant should be stock=0, in_stock=false, is_available=false, got: ${JSON.stringify(raceVar)}`);
    }

    console.log('✓ CONCURRENT ROW-LOCKING TEST PASSED: Exactly 1 checkout succeeded, 1 checkout failed safely with out-of-stock, stock decremented to 0 without overselling or deadlocks!');
  } finally {
    // 5. Cleanup test records
    runPsql(`DELETE FROM public.requests WHERE reference_code LIKE 'REQ-RACE-%';`);
    runPsql(`DELETE FROM public.shop_products WHERE id = '${productId}';`);
    console.log('Cleanup completed.');
  }
}

runConcurrencyTest().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
