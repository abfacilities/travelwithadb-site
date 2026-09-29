// One-time admin endpoint: creates the Resend Audience used to store newsletter
// subscribers for travelwithadb.com. Run once, note the returned audience ID,
// set it as the RESEND_AUDIENCE_ID env var in Cloudflare, then remove this file.
//
// Protected by ADMIN_SETUP_SECRET so it can't be hit by randoms to spam-create audiences.

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.NEWSLETTER_RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'NEWSLETTER_RESEND_API_KEY not set' }), { status: 500 });
  }
  if (!env.ADMIN_SETUP_SECRET) {
    return new Response(JSON.stringify({ error: 'ADMIN_SETUP_SECRET not set' }), { status: 500 });
  }

  const providedSecret = request.headers.get('x-admin-secret');
  if (providedSecret !== env.ADMIN_SETUP_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const res = await fetch('https://api.resend.com/audiences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.NEWSLETTER_RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Travel with ADB Website Subscribers' })
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Resend API error', detail: data }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, audienceId: data.id, raw: data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Request failed', detail: String(err) }), { status: 500 });
  }
}

export async function onRequestGet() {
  return new Response('Method Not Allowed', { status: 405 });
}
