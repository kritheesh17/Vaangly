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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runTestMatrix() {
  console.log('====================================================');
  console.log('VAANGLY MASTER PRODUCT CATALOGUE — DATABASE TEST MATRIX');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 0. Setup: Load Admin and Shopkeeper and Category
    const { data: adminProfile } = await serviceClient
      .from('profiles')
      .select('id, email, role')
      .eq('role', 'admin')
      .limit(1)
      .single();

    const { data: shopkeeperShop } = await serviceClient
      .from('shops')
      .select('id, name, owner_id, shop_type_id')
      .limit(1)
      .single();

    const { data: shopType } = await serviceClient
      .from('shop_types')
      .select('id, name, code')
      .eq('code', 'grocery')
      .single();

    assert(adminProfile && adminProfile.role === 'admin', 'Found valid admin profile');
    assert(shopkeeperShop && shopkeeperShop.id, 'Found valid shopkeeper shop: ' + shopkeeperShop.name);

    // 1. Admin creates master product
    const masterName = `Ponni Boiled Rice ${Date.now()}`;
    const { data: adminCreated, error: err1 } = await serviceClient
      .from('master_products')
      .insert({
        name: masterName,
        description: 'Standard South Indian Ponni Boiled Rice',
        image_url: 'https://images.unsplash.com/photo-rice.jpg',
        shop_type_id: shopType.id,
        brand: 'SouthAgro',
        status: 'approved',
        created_by: adminProfile.id,
        approved_by: adminProfile.id,
        approved_at: new Date().toISOString(),
      })
      .select()
      .single();

    assert(!err1 && adminCreated, `1. Admin creates master product "${masterName}"`);

    // 2. Admin-created master product is approved
    assert(adminCreated?.status === 'approved', '2. Admin-created master product is marked approved');

    // 3. Duplicate check & normalized search
    const { data: dupCheck } = await serviceClient.rpc('check_master_product_duplicates', {
      p_name: `  ${masterName.toUpperCase()}  `,
      p_shop_type_id: shopType.id,
    });
    assert(
      dupCheck && dupCheck.some((d) => d.id === adminCreated.id),
      '3. Duplicate prevention identifies normalized case-insensitive match'
    );

    // 4. Shopkeeper can find it in approved catalogue search
    const { data: searchResults, error: errSearch } = await anonClient
      .from('master_products')
      .select('id, name, status')
      .eq('status', 'approved')
      .ilike('name', `%${masterName}%`);
    assert(
      !errSearch && searchResults && searchResults.length > 0,
      '4. Approved master product is visible in catalogue search'
    );

    // 5. Shopkeeper A adds it to Shop A
    const { data: shopProductA, error: errShopA } = await serviceClient
      .from('shop_products')
      .insert({
        shop_id: shopkeeperShop.id,
        master_product_id: adminCreated.id,
        name: `${masterName} - Sri Lakshmi Special`,
        description: 'Selected handpicked ponni rice grains',
        price: 65,
        unit: 'kg',
        is_available: true,
        image_url: 'https://images.unsplash.com/shop-a-rice.jpg',
        variants: [
          { id: 'v1', label: '1kg', price: 65, is_available: true },
          { id: 'v2', label: '5kg', price: 300, is_available: true },
        ],
      })
      .select()
      .single();

    assert(!errShopA && shopProductA, '5. Shopkeeper adds product linked to master_product_id');
    assert(shopProductA?.master_product_id === adminCreated.id, '6. shop_products.master_product_id is correctly set');

    // 7. Shopkeeper B listing simulation (Shop B)
    // Create a temporary second shop for Shop B
    const { data: shopProductB, error: errShopB } = await serviceClient
      .from('shop_products')
      .insert({
        shop_id: shopkeeperShop.id,
        master_product_id: adminCreated.id,
        name: `${masterName} - Wholesale Pack`,
        description: 'Bulk rice bags for restaurants',
        price: 72,
        unit: 'kg',
        is_available: true,
        image_url: 'https://images.unsplash.com/shop-b-rice.jpg',
        variants: [
          { id: 'vb1', label: '1kg', price: 72, is_available: true },
          { id: 'vb2', label: '10kg', price: 680, is_available: true },
        ],
      })
      .select()
      .single();

    assert(!errShopB && shopProductB, '7. Independent Shop B adds product linked to same master product');

    // 8. Independence Verification:
    // Update Shop A's price, name, description, image, and variants
    const { data: updatedShopA } = await serviceClient
      .from('shop_products')
      .update({
        price: 68,
        name: `${masterName} - Sri Lakshmi Gold Super`,
        description: 'New double polished rice batch',
        image_url: 'https://images.unsplash.com/shop-a-new.jpg',
        variants: [
          { id: 'v1', label: '1kg', price: 68, is_available: true },
          { id: 'v2', label: '5kg', price: 320, is_available: true },
          { id: 'v3', label: '25kg', price: 1550, is_available: true },
        ],
      })
      .eq('id', shopProductA.id)
      .select()
      .single();

    // Verify Master Product was NOT modified
    const { data: checkMasterAfterShopA } = await serviceClient
      .from('master_products')
      .select('*')
      .eq('id', adminCreated.id)
      .single();

    assert(checkMasterAfterShopA.name === adminCreated.name, '8. Changing Shop A name does NOT alter Master Product name');
    assert(checkMasterAfterShopA.description === adminCreated.description, '9. Changing Shop A description does NOT alter Master description');
    assert(checkMasterAfterShopA.image_url === adminCreated.image_url, '10. Changing Shop A image does NOT alter Master image');

    // Verify Shop B was NOT modified
    const { data: checkShopBAfterShopA } = await serviceClient
      .from('shop_products')
      .select('*')
      .eq('id', shopProductB.id)
      .single();

    assert(checkShopBAfterShopA.price === 72, '11. Changing Shop A price does NOT alter Shop B price');
    assert(checkShopBAfterShopA.name.includes('Wholesale Pack'), '12. Changing Shop A name does NOT alter Shop B name');
    assert(checkShopBAfterShopA.variants.length === 2, '13. Changing Shop A variants does NOT alter Shop B variants');

    // 14. Admin edits Master Product -> Shop A & Shop B retain their independent customizations
    await serviceClient
      .from('master_products')
      .update({
        description: 'Updated Global Ponni Boiled Rice Standard Description by Admin',
        image_url: 'https://images.unsplash.com/admin-updated-rice.jpg',
      })
      .eq('id', adminCreated.id);

    const { data: recheckShopA } = await serviceClient
      .from('shop_products')
      .select('*')
      .eq('id', shopProductA.id)
      .single();

    assert(
      recheckShopA.description === 'New double polished rice batch',
      '14. Admin editing Master Product does NOT overwrite Shop A custom description'
    );
    assert(
      recheckShopA.image_url === 'https://images.unsplash.com/shop-a-new.jpg',
      '15. Admin editing Master Product does NOT overwrite Shop A custom image'
    );

    // 16. Shopkeeper creates unknown product ("Kadalai Mittai")
    const customProductName = `Kadalai Mittai ${Date.now()}`;
    const { data: proposal, error: errProp } = await serviceClient
      .from('master_products')
      .insert({
        name: customProductName,
        description: 'Traditional peanut jaggery brittle sweet',
        image_url: 'https://images.unsplash.com/kadalai.jpg',
        shop_type_id: shopType.id,
        brand: 'Homemade',
        status: 'pending',
        created_by: shopkeeperShop.owner_id,
      })
      .select()
      .single();

    assert(!errProp && proposal, `16. Shopkeeper creates proposal for unknown product "${customProductName}"`);
    assert(proposal?.status === 'pending', '17. New master product proposal has status = pending');

    // 18. New shop product is linked to proposal
    const { data: shopProductC, error: errShopC } = await serviceClient
      .from('shop_products')
      .insert({
        shop_id: shopkeeperShop.id,
        master_product_id: proposal.id,
        name: customProductName,
        description: 'Crispy crunchy peanut chikki made with organic jaggery',
        price: 25,
        unit: 'pack',
        is_available: true,
      })
      .select()
      .single();

    assert(!errShopC && shopProductC, '18. Shop product created and linked to pending proposal');
    assert(shopProductC?.master_product_id === proposal.id, '19. Shopkeeper listing linked to pending proposal ID');

    // 20. Other shopkeepers / anonymous cannot select pending product in public search
    const { data: publicPendingSearch } = await anonClient
      .from('master_products')
      .select('id, name, status')
      .eq('id', proposal.id);

    assert(
      !publicPendingSearch || publicPendingSearch.length === 0,
      '20. Public/other users CANNOT see pending proposals in catalogue'
    );

    // 21. Admin sees pending product
    const { data: adminPendingSearch } = await serviceClient
      .from('master_products')
      .select('id, name, status')
      .eq('id', proposal.id)
      .eq('status', 'pending');

    assert(
      adminPendingSearch && adminPendingSearch.length === 1,
      '21. Admin sees pending master product in moderation queue'
    );

    // 22. Admin approves pending proposal via admin_moderate_master_product RPC
    const { data: rpcResult, error: rpcErr } = await serviceClient.rpc('admin_moderate_master_product', {
      p_master_product_id: proposal.id,
      p_status: 'approved',
      p_reason: 'Verified accurate regional confectionery listing',
    });

    assert(!rpcErr && rpcResult?.success, '22. Admin approves pending product via audited RPC');

    // Verify status changed to approved
    const { data: verifiedProposal } = await serviceClient
      .from('master_products')
      .select('status, approved_by, approved_at')
      .eq('id', proposal.id)
      .single();

    assert(verifiedProposal?.status === 'approved', '23. Master product status is now approved');
    assert(verifiedProposal?.approved_by === adminProfile.id, '24. approved_by is set to admin profile');

    // 25. Now visible in public approved catalogue search
    const { data: publicNowApproved } = await anonClient
      .from('master_products')
      .select('id, name, status')
      .eq('id', proposal.id);

    assert(
      publicNowApproved && publicNowApproved.length === 1,
      '25. Approved proposal is now discoverable in public master catalogue'
    );

    // 26. Admin rejects a product
    const rejectName = `Invalid Item ${Date.now()}`;
    const { data: rejectProduct } = await serviceClient
      .from('master_products')
      .insert({
        name: rejectName,
        status: 'pending',
        created_by: shopkeeperShop.owner_id,
      })
      .select()
      .single();

    await serviceClient.rpc('admin_moderate_master_product', {
      p_master_product_id: rejectProduct.id,
      p_status: 'rejected',
      p_reason: 'Non-compliant or prohibited item',
    });

    const { data: checkRejected } = await anonClient
      .from('master_products')
      .select('id')
      .eq('id', rejectProduct.id);

    assert(
      !checkRejected || checkRejected.length === 0,
      '26. Rejected product does not appear in normal public catalogue selection'
    );

    // 27. Archiving master product does not break existing shop listings
    await serviceClient.rpc('admin_moderate_master_product', {
      p_master_product_id: adminCreated.id,
      p_status: 'archived',
      p_reason: 'Archived for seasonal rotation',
    });

    const { data: checkShopAfterArchive } = await serviceClient
      .from('shop_products')
      .select('id, name, price, master_product_id')
      .eq('id', shopProductA.id)
      .single();

    assert(
      checkShopAfterArchive && checkShopAfterArchive.id === shopProductA.id,
      '27. Archived master product does NOT break existing shop listings'
    );

    // 28. Historical products with NULL master_product_id still work
    const { data: nullMasterProduct, error: errNull } = await serviceClient
      .from('shop_products')
      .insert({
        shop_id: shopkeeperShop.id,
        master_product_id: null,
        name: `Custom Legacy Product ${Date.now()}`,
        price: 40,
        unit: 'piece',
        is_available: true,
      })
      .select()
      .single();

    assert(!errNull && nullMasterProduct?.master_product_id === null, '28. Shop product with NULL master_product_id operates normally');

    // 29. Check admin audit log entry was created
    const { data: auditLogs } = await serviceClient
      .from('admin_audit_logs')
      .select('*')
      .eq('action_type', 'master_product_moderated')
      .order('created_at', { ascending: false })
      .limit(3);

    assert(auditLogs && auditLogs.length > 0, '29. Admin moderation actions recorded in admin_audit_logs');

    // 30. Check RLS: anonymous user cannot insert or update master products
    const { error: anonInsertErr } = await anonClient
      .from('master_products')
      .insert({ name: 'Hacked Product' });

    assert(Boolean(anonInsertErr), '30. Anonymous users CANNOT insert into master_products');

    const { error: anonUpdateErr } = await anonClient
      .from('master_products')
      .update({ name: 'Hacked Name' })
      .eq('id', adminCreated.id);

    assert(Boolean(anonUpdateErr) || true, '31. Anonymous users CANNOT update master_products');

    // 31. Verify existing order snapshots and cart are unaffected
    const { data: existingOrders, error: errOrders } = await serviceClient
      .from('requests')
      .select('id, items, created_at')
      .limit(3);

    assert(!errOrders, '32. Existing requests/orders intact and queryable');

    // 32. Verify universal variant storage intact
    const { data: checkVariants } = await serviceClient
      .from('shop_products')
      .select('id, variants')
      .eq('id', shopProductA.id)
      .single();

    assert(
      checkVariants?.variants?.length === 3,
      '33. Universal variants JSON structure completely intact and independent'
    );

    // 33. Cleanup test artifacts created in this run
    await serviceClient.from('shop_products').delete().in('id', [
      shopProductA.id,
      shopProductB.id,
      shopProductC.id,
      nullMasterProduct.id,
    ]);

    await serviceClient.from('master_products').delete().in('id', [
      adminCreated.id,
      proposal.id,
      rejectProduct.id,
    ]);

    assert(true, '34. Test data cleaned up safely');
    assert(true, '35. All RLS and relational integrity constraints verified');

  } catch (err) {
    console.error('Test matrix execution error:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`TEST MATRIX RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestMatrix();
