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

  const PHONE_RE = /^(\+91[\-\s]?)?[6-9]\d{9}$/;
  const cleanedPhone = phone.replace(/[\s\-]/g, '');

  if (!name || !email || !phone || !subject || !message || !EMAIL_RE.test(email) || !PHONE_RE.test(cleanedPhone)) {
    res.status(400).json({ ok: false, error: 'Missing or invalid required fields' });
    return;
  }

  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const notifyEmail = process.env.BREVO_NOTIFY_EMAIL || 'athisahealth@gmail.com';
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
    const subjectLabels = {
      general: 'General Inquiry', booking: 'Book a Session',
      services: 'Question About Services', billing: 'Billing Question', other: 'Other'
    };
    const subjectLabel = subjectLabels[subject] || subject;

    const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: brevoHeaders,
      body: JSON.stringify({
        sender: { email: senderEmail, name: 'Athisa Health Website' },
        to: [{ email: notifyEmail }],
        replyTo: { email: email, name: name },
        subject: 'New Contact Form Message — ' + subjectLabel,
        htmlContent: buildEmailHtml({ name, email, phone, subjectLabel, message })
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

function buildEmailHtml(data) {
  var name = escapeHtml(data.name);
  var email = escapeHtml(data.email);
  var phone = escapeHtml(data.phone || '—');
  var subjectLabel = escapeHtml(data.subjectLabel);
  var message = escapeHtml(data.message).replace(/\n/g, '<br>');

  function row(label, valueHtml) {
    return '' +
      '<tr>' +
        '<td style="padding:14px 0; border-bottom:1px solid #F1E4E1;">' +
          '<p style="margin:0 0 4px; font-family:Rubik,Arial,sans-serif; font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:#885784;">' + label + '</p>' +
          '<p style="margin:0; font-family:Rubik,Arial,sans-serif; font-size:15px; color:#222941; line-height:1.5;">' + valueHtml + '</p>' +
        '</td>' +
      '</tr>';
  }

  return '' +
    '<div style="background:#FDF1EE; padding:40px 16px; font-family:Rubik,Arial,sans-serif;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto; background:#FFFFFF; border-radius:20px; overflow:hidden;">' +
        '<tr>' +
          '<td style="background:#FDF1EE; padding:32px 32px 24px; text-align:center;">' +
            '<img src="https://athisahealth.com/assets/AthisaLogo.svg" alt="Athisa Health" width="150" style="display:inline-block; height:auto;">' +
          '</td>' +
        '</tr>' +
        '<tr><td style="height:4px; background:linear-gradient(90deg,#885784,#602B7A); font-size:0; line-height:0;">&nbsp;</td></tr>' +
        '<tr>' +
          '<td style="padding:32px;">' +
            '<p style="margin:0 0 4px; font-family:\'Roboto Slab\',Georgia,serif; font-size:22px; font-weight:600; color:#222941;">New message from your website</p>' +
            '<p style="margin:0 0 20px; font-size:14px; color:#6b6470;">Someone reached out through the Athisa Health contact form.</p>' +
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
              row('Name', name) +
              row('Email', '<a href="mailto:' + email + '" style="color:#602B7A; text-decoration:none;">' + email + '</a>') +
              row('Phone', '<a href="tel:' + phone + '" style="color:#602B7A; text-decoration:none;">' + phone + '</a>') +
              row('Subject', subjectLabel) +
              row('Message', message) +
            '</table>' +
            '<a href="mailto:' + email + '" style="display:inline-block; margin-top:28px; padding:14px 28px; background:linear-gradient(90deg,#885784,#602B7A); color:#FFFFFF; font-family:Rubik,Arial,sans-serif; font-size:14px; font-weight:600; text-decoration:none; border-radius:999px;">Reply to ' + name + '</a>' +
          '</td>' +
        '</tr>' +
        '<tr>' +
          '<td style="background:#FDF1EE; padding:20px 32px; text-align:center;">' +
            '<p style="margin:0; font-size:12px; color:#8a8390;">Athisa Health &middot; Healing the whole you through mind, body, and lifestyle.</p>' +
          '</td>' +
        '</tr>' +
      '</table>' +
    '</div>';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
