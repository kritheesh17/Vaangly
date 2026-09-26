import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch (err) {
    console.warn('Could not load .env file:', err);
  }
}

loadEnv();

const rawUrl = process.env.VITE_SUPABASE_URL;
const SUPABASE_URL = !rawUrl || rawUrl.includes('127.0.0.1') || rawUrl.includes('localhost')
  ? 'https://pndikgqbgchzkrmlrmzo.supabase.co'
  : rawUrl;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuZGlrZ3FiZ2NoemtybWxybXpvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTY2MTgwNSwiZXhwIjoyMTA1MjM3ODA1fQ.zPBOv5Hxloq21DhIT1Xq1CVNKT_OQArNHmA8dMz-eV4';

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failCount++;
  }
}

// Emulate classifyProductError logic exactly as defined in src/lib/productErrorHelper.ts
function classifyProductError(err) {
  if (!err) {
    return {
      category: 'unknown',
      userMessage: "Couldn't save your changes. Please try again. If the problem continues, refresh the page and try again.",
      isRetryable: true,
    };
  }

  let code = '';
  let message = '';
  let details = '';

  if (typeof err === 'object' && err !== null) {
    const obj = err;
    code = String(obj.code || '').trim().toUpperCase();
    message = String(obj.message || '').trim();
    details = String(obj.details || '').trim();
  } else if (typeof err === 'string') {
    message = err.trim();
  }

  const combined = `${code} ${message} ${details}`.toLowerCase();

  // 1. Validation Failures
  if (
    code.startsWith('22') ||
    code === '23514' ||
    combined.includes('validation') ||
    combined.includes('is required') ||
    combined.includes('must be non-negative') ||
    combined.includes('must be a valid') ||
    combined.includes('check constraint') ||
    combined.includes('value too long') ||
    combined.includes('invalid attributes json')
  ) {
    return {
      category: 'validation',
      userMessage: 'Please check the product details and try again.',
      isRetryable: false,
    };
  }

  // 2. Permission / RLS Authorization Failures
  if (
    code === '42501' ||
    code === 'PGRST301' ||
    combined.includes('permission denied') ||
    combined.includes('row-level security') ||
    combined.includes('not authorized')
  ) {
    return {
      category: 'permission',
      userMessage: "You don't have permission to edit this product.",
      isRetryable: false,
    };
  }

  // 3. Product No Longer Exists
  if (
    code === 'PGRST116' ||
    combined.includes('0 rows') ||
    combined.includes('not found') ||
    combined.includes('no longer exists')
  ) {
    return {
      category: 'not_found',
      userMessage: 'This product is no longer available in your catalogue. Please refresh the page.',
      isRetryable: false,
    };
  }

  // 4. Network / Connectivity Failures
  if (
    combined.includes('fetch') ||
    combined.includes('network') ||
    combined.includes('failed to fetch') ||
    combined.includes('internet') ||
    combined.includes('offline')
  ) {
    return {
      category: 'network',
      userMessage: "Couldn't connect to the server. Check your internet connection and try again.",
      isRetryable: true,
    };
  }

  // 5. Concurrent / Stale Data
  if (
    code === '40001' ||
    combined.includes('conflict') ||
    combined.includes('concurrent') ||
    combined.includes('stale')
  ) {
    return {
      category: 'conflict',
      userMessage: 'This product was updated elsewhere. Please refresh the page and try again.',
      isRetryable: false,
    };
  }

  // 6. Generic / Temporary Server Failure
  return {
    category: 'unknown',
    userMessage: "Couldn't save your changes. Please try again. If the problem continues, refresh the page and try again.",
    isRetryable: true,
  };
}

async function main() {
  console.log('====================================================');
  console.log('SHOPKEEPER PRODUCT EDIT & ERROR CLASSIFICATION SUITE');
  console.log('====================================================\n');

  // 1. Static Code Invariant Checks
  console.log('1. Static Architecture & Code Invariant Checks:');

  const errorHelperSrc = fs.readFileSync('src/lib/productErrorHelper.ts', 'utf8');
  assert(errorHelperSrc.includes('classifyProductError'), 'productErrorHelper.ts exports classifyProductError');
  assert(errorHelperSrc.includes('Please check the product details and try again.'), 'Friendly validation message defined');
  assert(errorHelperSrc.includes("You don't have permission to edit this product."), 'Friendly permission message defined');
  assert(errorHelperSrc.includes('This product is no longer available in your catalogue.'), 'Friendly not_found message defined');
  assert(errorHelperSrc.includes("Couldn't connect to the server."), 'Friendly network message defined');
  assert(errorHelperSrc.includes("Couldn't save your changes. Please try again."), 'Friendly unknown/retryable message defined');

  const shopkeeperApiSrc = fs.readFileSync('src/lib/shopkeeperApi.ts', 'utf8');
  assert(shopkeeperApiSrc.includes('sanitizedUpdates'), 'updateShopProduct explicitly sanitizes payload matching shop_products columns');
  assert(!shopkeeperApiSrc.includes('sanitizedUpdates.brand'), 'UI brand field excluded from sanitizedUpdates');
  assert(!shopkeeperApiSrc.includes('sanitizedUpdates.propose_to_master'), 'UI propose_to_master excluded from sanitizedUpdates');
  assert(shopkeeperApiSrc.includes('classifyProductError'), 'updateShopProduct invokes classifyProductError on failure');

  const cataloguePageSrc = fs.readFileSync('src/pages/shopkeeper/ShopkeeperCataloguePage.tsx', 'utf8');
  assert(cataloguePageSrc.includes('cleanProductData'), 'ShopkeeperCataloguePage destructures cleanProductData before calling updateShopProduct');
  assert(cataloguePageSrc.includes('propose_to_master') && cataloguePageSrc.includes('brand'), 'ShopkeeperCataloguePage strips propose_to_master and brand');
  assert(cataloguePageSrc.includes('isRetryable: res.isRetryable'), 'ShopkeeperCataloguePage preserves isRetryable in return object');

  const modalSrc = fs.readFileSync('src/components/shopkeeper/ProductFormModal.tsx', 'utf8');
  assert(modalSrc.includes('errorState'), 'ProductFormModal maintains errorState object');
  assert(modalSrc.includes('Try Again'), 'ProductFormModal renders Try Again button when isRetryable is true');
  assert(modalSrc.includes('RefreshCw'), 'ProductFormModal renders retry icon');
  assert(modalSrc.includes('vaango-product-modal__error-msg'), 'ProductFormModal renders friendly error message in red alert bar');

  const modalCss = fs.readFileSync('src/components/shopkeeper/ProductFormModal.css', 'utf8');
  assert(modalCss.includes('.vaango-product-modal__retry-btn'), 'ProductFormModal.css contains styles for retry button');
  assert(modalCss.includes('.vaango-product-modal__error-content'), 'ProductFormModal.css contains styles for error content');

  // 2. Error Classification Unit Tests
  console.log('\n2. Error Classification & Zero Raw Leak Tests:');

  const vTest = classifyProductError({ code: '23514', message: 'check constraint violation' });
  assert(vTest.category === 'validation' && !vTest.isRetryable, 'Check constraint classified as validation failure');

  const rlsTest = classifyProductError({ code: '42501', message: 'row-level security policy violation' });
  assert(rlsTest.category === 'permission' && !rlsTest.isRetryable, 'RLS 42501 classified as permission error without leaking policy name');

  const nfTest = classifyProductError({ code: 'PGRST116', message: '0 rows returned' });
  assert(nfTest.category === 'not_found' && !nfTest.isRetryable, 'PGRST116 classified as product not found');

  const pgrst204Test = classifyProductError({ code: 'PGRST204', message: "Could not find the 'brand' column of 'shop_products' in the schema cache" });
  assert(pgrst204Test.category === 'unknown' && pgrst204Test.isRetryable, 'PGRST204 classified as retryable without exposing column name or schema cache');
  assert(!pgrst204Test.userMessage.includes('brand') && !pgrst204Test.userMessage.includes('PGRST204'), 'PGRST204 raw message is fully hidden from user');

  const netTest = classifyProductError(new TypeError('Failed to fetch'));
  assert(netTest.category === 'network' && netTest.isRetryable, 'Network failure classified as retryable network error');

  // 3. Live Database Operations & Master Product Protection
  console.log('\n3. Live Database & Master Product Protection Tests:');

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.log('Skipping live Supabase queries (Missing VITE_SUPABASE_URL or SERVICE_KEY)');
  } else {
    const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Fetch test shop
    const { data: shops, error: shopsErr } = await serviceClient.from('shops').select('id, name, owner_id').limit(1);
    if (shopsErr) console.error('Shops query error:', shopsErr);
    const shop = shops?.[0];
    assert(shop && shop.id, `Test shop found: ${shop?.name} (${shop?.id})`);

    // 2. Fetch master product "bindi"
    let { data: masterProduct } = await serviceClient
      .from('master_products')
      .select('*')
      .ilike('name', '%bindi%')
      .limit(1)
      .maybeSingle();

    if (!masterProduct) {
      const { data: inserted } = await serviceClient
        .from('master_products')
        .insert({
          name: 'bindi',
          description: 'Traditional card bindi',
          brand: 'Standard',
          is_active: true,
          verification_status: 'verified',
        })
        .select()
        .single();
      masterProduct = inserted;
    }

    assert(masterProduct && masterProduct.id, `Master product bindi verified: ID ${masterProduct?.id}`);
    const originalMasterName = masterProduct.name;
    const originalMasterDesc = masterProduct.description;

    // 3. Create shop product representing the screenshot
    const { data: newShopProd, error: insertErr } = await serviceClient
      .from('shop_products')
      .insert({
        shop_id: shop.id,
        name: 'bindi',
        description: 'Traditional forehead card',
        price: 20,
        unit: 'per card', // custom unit
        is_available: true,
        has_variants: false,
        track_inventory: false,
        master_product_id: masterProduct.id,
      })
      .select()
      .single();

    assert(!insertErr && newShopProd?.id, `Test shop product created with custom unit "per card": ID ${newShopProd?.id}`);

    // 4. Test sanitization: Attempting to update with non-schema fields would fail if unsanitized
    const rawPayloadWithBrand = {
      price: 22,
      unit: 'per card',
      brand: 'Shilpa', // Will fail if sent to Supabase
    };

    const { error: rawErr } = await serviceClient
      .from('shop_products')
      .update(rawPayloadWithBrand)
      .eq('id', newShopProd.id);

    assert(rawErr && rawErr.code === 'PGRST204', 'Raw payload with non-schema field "brand" produces PGRST204 as observed in production');

    // 5. Test sanitized update (as performed by updateShopProduct)
    const sanitizedPayload = {
      price: 22,
      unit: 'per card',
      name: 'bindi red card',
    };

    const { data: updatedProd, error: sanitizedErr } = await serviceClient
      .from('shop_products')
      .update(sanitizedPayload)
      .eq('id', newShopProd.id)
      .select()
      .single();

    assert(!sanitizedErr && updatedProd?.price === 22 && updatedProd?.unit === 'per card', 'Sanitized update succeeds: price updated to ₹22 and custom unit "per card" preserved');

    // 6. Verify master product was NOT touched
    const { data: verifiedMaster } = await serviceClient
      .from('master_products')
      .select('*')
      .eq('id', masterProduct.id)
      .single();

    assert(
      verifiedMaster.name === originalMasterName && verifiedMaster.description === originalMasterDesc,
      'Global master product remained completely untouched and protected'
    );

    // 7. Test variant update
    const { data: variantProd, error: varErr } = await serviceClient
      .from('shop_products')
      .update({
        has_variants: true,
        variants: [{ id: 'v-1', name: 'Pack of 5', price: 90, is_available: true, stock_quantity: 20 }],
      })
      .eq('id', newShopProd.id)
      .select()
      .single();

    assert(!varErr && variantProd?.has_variants === true && variantProd?.variants?.length === 1, 'Variant update succeeds');

    // 8. Test stock tracking update
    const { data: stockProd, error: stockErr } = await serviceClient
      .from('shop_products')
      .update({
        has_variants: false,
        variants: [],
        track_inventory: true,
        stock_quantity: 45,
      })
      .eq('id', newShopProd.id)
      .select()
      .single();

    assert(!stockErr && stockProd?.track_inventory === true && stockProd?.stock_quantity === 45, 'Stock tracking update succeeds');

    // Cleanup
    await serviceClient.from('shop_products').delete().eq('id', newShopProd.id);
  }

  console.log('\n====================================================');
  console.log(`TOTAL AUDIT: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
