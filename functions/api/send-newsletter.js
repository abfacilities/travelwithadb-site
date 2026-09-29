// Secret-protected endpoint that sends a newsletter broadcast to the travelwithadb.com
// subscriber audience via Resend. Called either manually (after publishing new content)
// or by the scheduled monthly-digest task - never triggered by public traffic.
//
// Required environment variables (set in Cloudflare Pages project settings, never in git):
//   NEWSLETTER_RESEND_API_KEY - Fully-permissioned Resend key (Audiences/Broadcasts)
//   RESEND_AUDIENCE_ID        - Resend Audience ID holding subscribers (see setup-audience.js)
//   NEWSLETTER_SECRET         - Shared secret required in the x-newsletter-secret header
//
// Optional:
//   NEWSLETTER_FROM_EMAIL - Verified sending address. Defaults to news@updates.travelwithadb.com
//
// Expected JSON body: { subject: string, html: string, text: string }

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.NEWSLETTER_RESEND_API_KEY || !env.RESEND_AUDIENCE_ID || !env.NEWSLETTER_SECRET) {
    return new Response(JSON.stringify({ error: 'Newsletter sending is not fully configured yet.' }), { status: 500 });
  }

  const providedSecret = request.headers.get('x-newsletter-secret');
  if (providedSecret !== env.NEWSLETTER_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let subject, html, text;
  try {
    ({ subject, html, text } = await request.json());
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  if (!subject || (!html && !text)) {
    return new Response(JSON.stringify({ error: 'subject and (html or text) are required' }), { status: 400 });
  }

  const fromEmail = env.NEWSLETTER_FROM_EMAIL || 'Travel with ADB <news@updates.travelwithadb.com>';

  try {
    // Create the broadcast
    const createRes = await fetch('https://api.resend.com/broadcasts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.NEWSLETTER_RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audience_id: env.RESEND_AUDIENCE_ID,
        from: fromEmail,
        subject,
        html: html || undefined,
        text: text || undefined
      })
    });

    const createData = await createRes.json();
    if (!createRes.ok) {
      return new Response(JSON.stringify({ error: 'Could not create broadcast', detail: createData }), { status: 500 });
    }

    // Send it immediately
    const sendRes = await fetch(`https://api.resend.com/broadcasts/${createData.id}/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.NEWSLETTER_RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const sendData = await sendRes.json();
    if (!sendRes.ok) {
      return new Response(JSON.stringify({ error: 'Broadcast created but send failed', broadcastId: createData.id, detail: sendData }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, broadcastId: createData.id, sendResult: sendData }), {
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
