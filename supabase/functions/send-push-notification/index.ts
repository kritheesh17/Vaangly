import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const email = Deno.env.get('VAPID_EMAIL') ?? '';
webpush.setVapidDetails(email, publicKey, privateKey);

Deno.serve(async (request) => {
  try {
    const { user_id, title, body, url } = await request.json();
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: subscription, error } = await supabase.from('push_subscriptions').select('subscription').eq('user_id', user_id).single();
    if (error || !subscription?.subscription) return new Response('No subscription', { status: 404 });
    await webpush.sendNotification(JSON.parse(subscription.subscription), JSON.stringify({ title, body, url }));
    return new Response('Sent', { status: 200 });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Unable to send notification', { status: 500 });
  }
});
