// Handles newsletter signups for travelwithadb.com via the Resend REST API.
//
// Adds the visitor as a contact to the Resend Audience (RESEND_AUDIENCE_ID) so they
// receive future newsletter sends, plus a one-off notification email to Adam so
// signups aren't missed.
//
// Cloudflare Pages Function. Calls Resend directly via fetch (no npm SDK), matching
// the pattern used by functions/api/contact.js.
//
// Required environment variables (set in Cloudflare Pages project settings, never in git):
//   RESEND_API_KEY            - API key from resend.com (used for the signup-notification email)
//   RESEND_AUDIENCE_ID        - Resend Audience ID to add subscribers to (see setup-audience.js)
//   NEWSLETTER_RESEND_API_KEY - Fully-permissioned Resend key (Audiences/Broadcasts), used to add contacts
//
// Optional environment variables:
//   CONTACT_TO_EMAIL    - Where signup notifications land. Defaults to hello@travelwithadb.com
//   CONTACT_FROM_EMAIL  - Verified sending address. Defaults to the shared sandbox sender.

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.RESEND_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'This form is not fully set up yet. Please email us directly instead.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let email, botField;
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      ({ email, 'bot-field': botField } = await request.json());
    } else {
      const form = await request.formData();
      email = form.get('email');
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

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailPattern.test(String(email))) {
    return new Response(JSON.stringify({ error: 'Please enter a valid email address.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const toEmail = env.CONTACT_TO_EMAIL || 'hello@travelwithadb.com';
  const fromEmail = env.CONTACT_FROM_EMAIL || 'Travel with ADB Website <hello@travelwithadb.com>';

  // Add to the Resend audience so this person actually receives future newsletter sends.
  // Non-fatal if this fails - we still want the visitor to see the confirmation.
  if (env.RESEND_AUDIENCE_ID && env.NEWSLETTER_RESEND_API_KEY) {
    try {
      await fetch(`https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.NEWSLETTER_RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: String(email), unsubscribed: false })
      });
    } catch (e) {
      // swallow - notification email below still lets Adam know about the signup
    }
  }

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
        reply_to: String(email),
        subject: `New newsletter signup: ${email}`,
        text: `${email} signed up for travel updates from travelwithadb.com and has been added to the newsletter list.`
      })
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      // Contact was likely still added to the audience above, so don't fail the whole
      // request just because the notification email had trouble.
      return new Response(
        JSON.stringify({ ok: true, warning: 'notification_failed', detail: errText }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Could not process your request. Please try again or contact us directly.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function onRequestGet() {
  return new Response('Method Not Allowed', { status: 405 });
}
