# Athisa Health — Brevo contact proxy

A tiny Vercel serverless function that receives the Contact page form
submission, upserts the sender as a Brevo contact, and emails the team via
Brevo's transactional API. The Brevo API key lives only in Vercel's
environment variables — it is never shipped to the browser.

## Deploy

1. `npm i -g vercel` (if you don't have it), then from this `brevo-function`
   folder run `vercel` and follow the prompts to create a new project
   (e.g. `athisa-brevo-function`). Accept the defaults.
2. In the Vercel dashboard, open the new project → **Settings → Environment
   Variables** and add (Production + Preview):
   - `BREVO_API_KEY` — your Brevo API key (Brevo dashboard → SMTP & API →
     API Keys). Keep this secret.
   - `BREVO_SENDER_EMAIL` — an email address verified as a sender in Brevo
     (Brevo → Senders, Domains & Dedicated IPs). Used as the "from" address.
   - `BREVO_NOTIFY_EMAIL` — optional, where form submissions are emailed.
     Defaults to `hello@athisahealth.care`.
   - `BREVO_LIST_ID` — optional Brevo contact list ID to add submitters to.
   - `ALLOWED_ORIGINS` — optional, comma-separated list of origins allowed
     to call this function. Defaults to the current Hostinger site URL plus
     `athisahealth.care` / `www.athisahealth.care`. Add your final domain
     here once it's live.
3. Run `vercel --prod` to deploy with those env vars applied.
4. Copy the deployed URL (e.g. `https://athisa-brevo-function.vercel.app`)
   and update `BREVO_CONTACT_ENDPOINT` in `../assets/js/site.js` to
   `<that-url>/api/contact`, then commit and push so Hostinger redeploys.

## Notes

- The function includes a hidden honeypot field (`company`) already wired
  into `contact.html` — bots that fill every field will silently succeed
  without actually sending anything.
- Server-side validation duplicates the client-side `required`/email checks
  since client validation can always be bypassed.
