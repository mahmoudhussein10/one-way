# One Way Finance lead funnel

An Arabic-first RTL landing page and compact lead dashboard. Local development uses the encrypted JSON store in `server.mjs`; Vercel deployment uses serverless API routes backed by Supabase Postgres.

## Local development

Use Node.js 20.6 or later. Copy `.env.example` to `.env`, set `ADMIN_TOKEN` to a random secret of at least 32 bytes, and set `LEADS_ENCRYPTION_KEY` to a random 32-byte key encoded as Base64.

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
npm start
```

Open `http://127.0.0.1:3000/` for the form and `/admin` for the dashboard. Local leads are encrypted and saved to `data/leads.json`.

## Supabase and Vercel deployment

1. Create a Supabase project in a region close to the intended customers. In the Supabase SQL Editor, run `supabase/setup.sql`. It enables RLS, grants the backend role access, and creates a database-backed request limiter.
2. In Supabase project settings, copy the project URL and a server-side Secret API key (`sb_secret_...`). Never put this key in browser code or commit it.
3. Deploy this repository to Vercel. Vercel serves the static page and runs `api/leads.js` and `api/admin/leads.js` as serverless functions. The `/admin` rewrite is in `vercel.json`.
4. Before switching traffic, migrate existing local leads with `node --env-file=.env scripts/migrate-local-leads.mjs`. Set the same `LEADS_ENCRYPTION_KEY` in Vercel that currently encrypts the local records; changing it before re-encrypting existing leads will make them unreadable.
5. Add these Production environment variables in Vercel, then redeploy:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `ADMIN_TOKEN` (generate a new secret; do not reuse the previously shared token)
   - `LEADS_ENCRYPTION_KEY` (use the existing key while migrating local records, then store a protected backup)
   - `NEXT_PUBLIC_META_PIXEL_ID` (the public Meta Pixel ID; set it for Production, Preview, and Development)
6. Open the Vercel production URL, submit an approved test lead, confirm it appears in `/admin`, then remove the test record before advertising.

The Supabase `leads` table stores the applicant fields as AES-256-GCM encrypted JSON. Row-level security is enabled without public policies; only the server-side secret key can access the table. The database-backed request limiter uses hashed IP keys and allows up to 30 requests per minute per IP and route group, with admin login attempts limited to 5 per minute. The dashboard stores its authenticated session in an HttpOnly, same-site cookie for 30 days or until logout; it does not store the admin token in browser storage. If the project has Data API exposure disabled, enable access to the `public` schema for the server role used by the backend.

## Before a public campaign

- Attach the intended production domain and confirm HTTPS is active.
- Replace the placeholder privacy-policy link and have the consent language and retention period approved for this use.
- Have the financing company approve the claims, terms, required license and contact disclosures, and the screening question.
- Confirm Supabase backups and recovery settings for the selected plan; keep a separate protected backup of `LEADS_ENCRYPTION_KEY`. Losing the key makes stored applicant details unreadable.
- Keep the Supabase secret key and administrator token server-side only. The browser dashboard exchanges the admin token for an HttpOnly session cookie.

### Meta Pixel and analytics consent

The public lead form asks for optional analytics consent inline; no consent banner is shown when a visitor first opens the site. Meta Pixel stays unloaded unless the visitor opts in, and the optional choice is separate from the required consent to process the financing application. `NEXT_PUBLIC_META_PIXEL_ID` is read by the same-origin `/api/meta-pixel-config` endpoint because this project serves plain HTML/JavaScript rather than a Next.js client bundle. Set the variable in Vercel Project Settings → Environment Variables and redeploy for changes to take effect. Only `PageView` and a parameter-free `Lead` event are sent; the lead event runs after the API returns a saved application ID. Applicant fields are never passed to Meta.

Applicants self-report repayment history. The app does not query a credit bureau or approve financing. New leads remain for manual review until approved company screening rules are configured.
