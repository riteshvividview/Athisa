// Vercel serverless function — proxies the Athisa Health contact form to Brevo.
// Keeps the Brevo API key server-side only (set as BREVO_API_KEY in Vercel's
// Project Settings > Environment Variables — never commit it here).

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  'https://lightseagreen-seal-529108.hostingersite.com,https://athisahealth.care,https://www.athisahealth.care'
).split(',').map(function (s) { return s.trim(); }).filter(Boolean);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const body = req.body || {};
  const name = (body.name || '').toString().trim();
  const email = (body.email || '').toString().trim();
  const phone = (body.phone || '').toString().trim();
  const subject = (body.subject || '').toString().trim();
  const message = (body.message || '').toString().trim();
  const honeypot = (body.company || '').toString().trim();

  // Honeypot: real users never fill this hidden field; bots often do.
  if (honeypot) {
    res.status(200).json({ ok: true });
    return;
  }

  if (!name || !email || !subject || !message || !EMAIL_RE.test(email)) {
    res.status(400).json({ ok: false, error: 'Missing or invalid required fields' });
    return;
  }

  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const notifyEmail = process.env.BREVO_NOTIFY_EMAIL || 'hello@athisahealth.care';
  const listId = process.env.BREVO_LIST_ID;

  if (!apiKey || !senderEmail) {
    res.status(500).json({ ok: false, error: 'Server not configured' });
    return;
  }

  const brevoHeaders = {
    'api-key': apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };

  try {
    // 1. Upsert the sender as a Brevo contact (non-fatal if it fails).
    const contactPayload = {
      email: email,
      attributes: {
        FIRSTNAME: name,
        SMS: phone || undefined
      },
      updateEnabled: true
    };
    if (listId) contactPayload.listIds = [Number(listId)];

    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: brevoHeaders,
      body: JSON.stringify(contactPayload)
    }).catch(function () {});

    // 2. Send the actual notification email to the clinic inbox.
    const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: brevoHeaders,
      body: JSON.stringify({
        sender: { email: senderEmail, name: 'Athisa Health Website' },
        to: [{ email: notifyEmail }],
        replyTo: { email: email, name: name },
        subject: 'New contact form message: ' + subject,
        htmlContent:
          '<p><strong>Name:</strong> ' + escapeHtml(name) + '</p>' +
          '<p><strong>Email:</strong> ' + escapeHtml(email) + '</p>' +
          '<p><strong>Phone:</strong> ' + escapeHtml(phone || '—') + '</p>' +
          '<p><strong>Subject:</strong> ' + escapeHtml(subject) + '</p>' +
          '<p><strong>Message:</strong><br>' + escapeHtml(message).replace(/\n/g, '<br>') + '</p>'
      })
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text().catch(function () { return ''; });
      console.error('Brevo email send failed:', emailRes.status, errText);
      res.status(502).json({ ok: false, error: 'Failed to send message' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Brevo contact handler error:', err);
    res.status(500).json({ ok: false, error: 'Unexpected server error' });
  }
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
