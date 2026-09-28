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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user_id, title, body, url, origin } = await request.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!publicKey || !privateKey) {
      return new Response(
        JSON.stringify({ error: 'VAPID credentials not configured in Supabase Edge environment' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: record, error } = await supabase
      .from('push_subscriptions')
      .select('subscription, platform, endpoint')
      .eq('user_id', user_id)
      .maybeSingle();

    if (error || !record?.subscription) {
      return new Response(
        JSON.stringify({ error: 'No subscription found for user', user_id }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
            url: url || '/',
            tag: 'vaangly-cloud-push',
          })
        );
        sentCount++;
      } catch (err: any) {
        console.error('[Edge Push] Delivery error for endpoint:', target.endpoint, err);
        sendErrors.push(err.message || 'Push delivery failed');
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

