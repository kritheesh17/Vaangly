import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const email = Deno.env.get('VAPID_EMAIL') ?? 'mailto:support@vaangly.com';

if (email && publicKey && privateKey) {
  try {
    webpush.setVapidDetails(email, publicKey, privateKey);
  } catch (err) {
    console.warn('[Edge Push] VAPID initialization warning:', err);
  }
}

function sanitizeDestinationUrl(rawUrl?: string | null): { valid: boolean; url: string; error?: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: true, url: '/' };
  }
  const trimmed = rawUrl.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.includes('\\') ||
    trimmed.toLowerCase().startsWith('javascript:') ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
  ) {
    return {
      valid: false,
      url: '/',
      error: 'External redirect URLs are forbidden in push notifications',
    };
  }
  const validPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return { valid: true, url: validPath };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Bearer JWT Inspection & Verification (SEC-01)
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let senderUserId: string | null = null;
    let senderRole: string = 'customer';
    const isServiceRoleCaller = token === serviceRoleKey;

    if (!isServiceRoleCaller) {
      const { data: userData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Invalid or expired authentication token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      senderUserId = userData.user.id;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', senderUserId)
        .maybeSingle();

      senderRole = profile?.role || 'customer';
    }

    const { user_id, title, body, url, origin, tag } = await request.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Sender Authorization and Relationship Check (SEC-01)
    if (!isServiceRoleCaller && senderUserId) {
      const isTargetSelf = senderUserId === user_id;
      const isAdmin = senderRole === 'admin';

      // Prevent system/admin impersonation by non-admin senders when notifying other users
      if (!isAdmin && !isTargetSelf && title) {
        const SYSTEM_IMPERSONATION_REGEX = /\b(admin|administrator|system\s+alert|security\s+alert|account\s+suspended|password\s+reset|official\s+support)\b/i;
        if (SYSTEM_IMPERSONATION_REGEX.test(title)) {
          return new Response(
            JSON.stringify({ error: 'Forbidden: non-administrative senders cannot impersonate system or administrative notifications' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      if (!isAdmin && !isTargetSelf) {
        let hasRelationship = false;

        if (senderRole === 'shopkeeper') {
          // Shopkeeper sending to customer: verify customer has request with shopkeeper's shop
          const { data: senderShops } = await supabase
            .from('shops')
            .select('id')
            .eq('owner_id', senderUserId);

          if (senderShops && senderShops.length > 0) {
            const shopIds = senderShops.map((s: { id: string }) => s.id);
            const { data: req } = await supabase
              .from('requests')
              .select('id')
              .in('shop_id', shopIds)
              .eq('customer_id', user_id)
              .limit(1);

            if (req && req.length > 0) {
              hasRelationship = true;
            }
          }

          if (!hasRelationship) {
            return new Response(
              JSON.stringify({ error: 'Forbidden: recipient is not an active customer of your shop' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else if (senderRole === 'customer') {
          // Customer sending to shopkeeper: verify customer has request with target's shop
          const { data: targetShops } = await supabase
            .from('shops')
            .select('id')
            .eq('owner_id', user_id);

          if (targetShops && targetShops.length > 0) {
            const shopIds = targetShops.map((s: { id: string }) => s.id);
            const { data: req } = await supabase
              .from('requests')
              .select('id')
              .in('shop_id', shopIds)
              .eq('customer_id', senderUserId)
              .limit(1);

            if (req && req.length > 0) {
              hasRelationship = true;
            }
          }

          if (!hasRelationship) {
            return new Response(
              JSON.stringify({ error: 'Forbidden: customers cannot send unsolicited notifications to arbitrary users' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // 3. URL Destination Sanitization: disallow external phishing URLs (SEC-01)
    const urlValidation = sanitizeDestinationUrl(url);
    if (!urlValidation.valid) {
      return new Response(
        JSON.stringify({ error: urlValidation.error || 'External redirect URLs are forbidden in push notifications' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const safeUrl = urlValidation.url;

    if (!publicKey || !privateKey) {
      return new Response(
        JSON.stringify({ error: 'VAPID credentials not configured in Supabase Edge environment' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: record, error } = await supabase
      .from('push_subscriptions')
      .select('subscription, platform, endpoint')
      .eq('user_id', user_id)
      .maybeSingle();

    // 4. User Enumeration Prevention: Return consistent non-404 response
    if (error || !record?.subscription) {
      return new Response(
        JSON.stringify({ success: false, sent: 0, message: 'No active push subscriptions for recipient' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let subData = record.subscription;
    if (typeof subData === 'string') {
      try {
        subData = JSON.parse(subData);
      } catch {
        // use raw
      }
    }

    // Determine target subscriptions based on requested origin
    // This cleanly separates localhost from production endpoints
    const targets: any[] = [];
    if (origin && subData.subscriptionsByOrigin?.[origin]) {
      targets.push(subData.subscriptionsByOrigin[origin]);
    } else if (subData.subscriptionsByOrigin && Object.keys(subData.subscriptionsByOrigin).length > 0) {
      targets.push(...Object.values(subData.subscriptionsByOrigin));
    } else {
      targets.push(subData);
    }

    let sentCount = 0;
    const sendErrors: string[] = [];
    const deadEndpoints: string[] = [];

    const notificationTag = tag || `vaangly-${Date.now()}`;

    for (const target of targets) {
      if (!target || !target.endpoint) continue;
      try {
        await webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: target.keys,
          },
          JSON.stringify({
            title: title || 'Vaangly',
            body: body || 'You have a new update.',
            url: safeUrl,
            tag: notificationTag,
          }),
          {
            TTL: 86400, // 24 hours retention
            urgency: 'high', // Critical for waking Android background & locked screen
          }
        );
        sentCount++;
      } catch (err: any) {
        console.error('[Edge Push] Delivery error for endpoint:', target.endpoint, err?.message || err, 'status:', err?.statusCode || err?.status);
        const statusCode = err?.statusCode || err?.status;
        const isMalformedKey = err?.message?.includes('p256dh') || err?.message?.includes('auth');
        if (statusCode === 400 || statusCode === 403 || statusCode === 404 || statusCode === 410 || isMalformedKey) {
          console.log(`[Edge Push] Pruning invalid/expired/gone (${statusCode || 'malformed'}) endpoint:`, target.endpoint);
          deadEndpoints.push(target.endpoint);
        }
        sendErrors.push(`${err.message || 'Push delivery failed'} (status: ${statusCode || 'unknown'})`);
      }
    }

    // Safely prune dead/expired endpoints from push_subscriptions
    if (deadEndpoints.length > 0) {
      try {
        if (subData?.subscriptionsByOrigin) {
          for (const [orig, sub] of Object.entries(subData.subscriptionsByOrigin as Record<string, any>)) {
            if (sub?.endpoint && deadEndpoints.includes(sub.endpoint)) {
              delete subData.subscriptionsByOrigin[orig];
            }
          }
          const remainingOrigins = Object.keys(subData.subscriptionsByOrigin);
          if (remainingOrigins.length > 0) {
            await supabase
              .from('push_subscriptions')
              .update({ subscription: subData, updated_at: new Date().toISOString() })
              .eq('user_id', user_id);
          } else {
            await supabase.from('push_subscriptions').delete().eq('user_id', user_id);
          }
        } else if (deadEndpoints.includes(record.endpoint)) {
          await supabase.from('push_subscriptions').delete().eq('user_id', user_id);
        }
      } catch (cleanErr) {
        console.warn('[Edge Push] Prune error:', cleanErr);
      }
    }

    if (sentCount > 0) {
      return new Response(
        JSON.stringify({ success: true, sent: sentCount }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: 'Push delivery failed to all endpoints', details: sendErrors }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
