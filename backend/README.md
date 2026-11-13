# ForgeAI Payment‑enabled Backend

This repository now contains a **backend** that:

1. **Collects a payment** with Stripe Checkout (one‑time or subscription).
2. **Generates the requested artifact** (website, software, or spreadsheet) using **OpenRouter**.
3. **Zips the output**, uploads it to **Supabase Storage**, and returns a **signed download URL**.
4. **Stores user & purchase data** in Supabase (PostgreSQL) so the same files can be listed/downloaded from any device.

---
## Quick start (local development)

```bash
# 1️⃣ Install dependencies (already running in the background)
cd /Users/joneshenry/.gemini/antigravity/scratch/ForgeAI-v1/backend
# wait for npm install to finish – you can check the task log:
#   cat $(ag task-44.log)   (or use the UI)

# 2️⃣ Copy example env and fill in your secrets
cp .env.example .env
# Edit .env with your Stripe, Supabase and OpenRouter credentials
open .env   # or edit with any editor

# 3️⃣ Run the server
npm run dev
```
The server will listen on `http://localhost:4000` (or the `PORT` you set).

---
## Required environment variables (`.env`)
```
# Stripe
STRIPE_SECRET_KEY=sk_test_**************
STRIPE_WEBHOOK_SECRET=whsec_**************

# Supabase
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=public-anon-key

# OpenRouter (generation of websites/software/spreadsheets)
OPENROUTER_API_KEY=or_**************
# Optional: pin a specific model
# OPENROUTER_MODEL=openrouter/mistralai/mistral-7b-instruct

# Server settings
PORT=4000
BASE_URL=http://localhost:4000   # used for Stripe success/cancel redirects
```
*The placeholders must be replaced with real values from your accounts.*

---
## Deploying to Cloudflare Workers (public webhook)
If you want Stripe to reach your webhook from the internet, a cheap way is to deploy the same code as a Cloudflare Worker.

1. **Install the Wrangler CLI** (requires `npm i -g @cloudflare/wrangler`).
2. Create `wrangler.toml` (see below).
3. Bind the same environment variables as **Secrets** in the Cloudflare dashboard (`wrangler secret put ...`).
4. Publish:
   ```bash
   wrangler publish
   ```
   The worker will be reachable at `https://<your‑worker>.workers.dev`.

---
## wrangler.toml (placed in `backend/`)
```toml
name = "forgeai-backend"
main = "server.js"
compatibility_date = "2024-09-30"

[vars]
# These are **placeholders** – override with real secrets via `wrangler secret put`.
STRIPE_SECRET_KEY = "sk_test_placeholder"
STRIPE_WEBHOOK_SECRET = "whsec_placeholder"
SUPABASE_URL = "https://YOUR-PROJECT.supabase.co"
SUPABASE_ANON_KEY = "public-anon-key"
OPENROUTER_API_KEY = "or_placeholder"
BASE_URL = "https://<your‑worker>.workers.dev"
PORT = "4000"
```
After publishing, set each secret:
```bash
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put OPENROUTER_API_KEY
wrangler secret put BASE_URL
```
(You’ll be prompted for the value.)

---
## Supabase schema
The `supabase/migrations/20231112_init.sql` file contains the SQL needed to create the three tables (`users`, `purchases`).

If you have the Supabase CLI installed you can apply it:
```bash
supabase start   # launches a local Postgres container (optional)
supabase db push  # applies the migration to your remote project (use the dashboard otherwise)
```
Otherwise you can copy‑paste the SQL into the Supabase dashboard → **SQL Editor → Run**.

---
## Front‑end integration (quick example)
```js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://YOUR-PROJ.supabase.co', 'PUBLIC_ANON_KEY');

// 1️⃣ Sign‑in (magic link)
await supabase.auth.signInWithOtp({ email: userEmail });

// 2️⃣ Start checkout – your UI sends {email, prompt, type}
const {url} = await fetch('http://localhost:4000/create-checkout', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({email: userEmail, prompt: 'My portfolio site', type: 'website'}),
}).then(r=>r.json());
window.location = url; // goes to Stripe

// 3️⃣ Listen for the purchase fulfillment (realtime)
supabase.channel('public:purchases')
  .on('postgres_changes', {event:'UPDATE', schema:'public', table:'purchases'}, payload => {
    const p = payload.new;
    if (p.fulfilled) {
      // download zip
      fetch(p.download_url).then(r=>r.blob()).then(blob=>{ /* prompt save */ });
    }
  })
  .subscribe();
```
Replace the `fetch` URL with your deployed worker URL if you go production.

---
## What’s left for you to do
1. **Create Stripe account** → obtain `STRIPE_SECRET_KEY` & `STRIPE_WEBHOOK_SECRET`.
2. **Create Supabase project** → get `SUPABASE_URL` & `SUPABASE_ANON_KEY`, run the migration SQL, and create a Storage bucket named `projects`.
3. **Create OpenRouter account** → obtain `OPENROUTER_API_KEY` (optional model selection).
4. **Fill the .env file** (or set Cloudflare secrets) with those values.
5. **Run locally** (`npm run dev`) to test the flow:
   - Open `/create-checkout` via Postman or a tiny front‑end.
   - Complete Stripe payment on the test card `4242 4242 4242 4242`.
   - Verify that a zip appears in Supabase Storage and that the purchase row is marked `fulfilled`.
6. **Deploy** (Cloudflare Workers, Vercel, Railway, etc.) if you need a public webhook.

---
## License & attribution
The backend code is MIT‑licensed. You’re free to modify, host, or sell the generated projects – the only costs are Stripe transaction fees and any paid OpenRouter model usage you may choose.

---
### Happy building!
If you hit any roadblocks (e.g., Supabase schema errors, OpenRouter response format, Stripe webhook verification), let me know and I’ll help you debug the exact step.
