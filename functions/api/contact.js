// Sends the Travel with ADB contact form to the inbox via the Resend REST API.
//
// Cloudflare Pages Function. Calls Resend directly via fetch (no npm SDK) since
// Pages Functions doesn't run `npm install` for the functions/ bundle.
//
// Required environment variable (set in Cloudflare Pages project settings, never in git):
//   RESEND_API_KEY     - API key from resend.com
//
// Optional environment variables:
//   CONTACT_TO_EMAIL    - Where enquiries land. Defaults to hello@travelwithadb.com
//   CONTACT_FROM_EMAIL  - Verified sending address, e.g. "Travel with ADB <hello@travelwithadb.com>".
//                          Defaults to Resend's shared sandbox sender.

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.RESEND_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'The contact form is not fully set up yet. Please email or DM directly instead.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let name, email, brand, message, botField;
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      ({ name, email, brand, message, 'bot-field': botField } = await request.json());
    } else {
      const form = await request.formData();
      name = form.get('name');
      email = form.get('email');
      brand = form.get('brand');
      message = form.get('message');
      botField = form.get('bot-field');
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Honeypot: bots fill hidden fields, real users leave it blank.
  if (botField) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!name || !email || !message) {
    return new Response(JSON.stringify({ error: 'Please fill in your name, email and message.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const toEmail = env.CONTACT_TO_EMAIL || 'hello@travelwithadb.com';
  const fromEmail = env.CONTACT_FROM_EMAIL || 'Travel with ADB Website <onboarding@resend.dev>';

  const lines = [
    `Name: ${name}`,
    `Email: ${email}`,
    brand ? `Hotel / Brand: ${brand}` : null,
    '',
    'Message:',
    message
  ].filter(Boolean);

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: email,
        subject: `New contact form message from ${name}`,
        text: lines.join('\n')
      })
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      return new Response(
        JSON.stringify({ error: 'Could not send your message. Please try again or contact us directly.', detail: errText }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Could not send your message. Please try again or contact us directly.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function onRequestGet() {
  return new Response('Method Not Allowed', { status: 405 });
}
