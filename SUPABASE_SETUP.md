# FinFlow — Supabase + Google Auth Setup Guide

Follow these steps **in order** to go from zero to a working
Google login backed by Supabase.

---

## Step 1 — Create a Supabase project

1. Go to <https://supabase.com> and sign in (free tier is fine)
2. Click **New project**
3. Choose a name (e.g. `finflow`), set a strong DB password, pick a region close to your users
4. Wait ~2 min for provisioning

---

## Step 2 — Run the database schema

1. In your Supabase dashboard → **SQL Editor** → **New query**
2. Open `supabase_schema.sql` from this folder
3. Paste the entire file contents → click **Run**
4. You should see: `profiles`, `expenses`, `budgets` tables created with RLS enabled

---

## Step 3 — Enable Google OAuth provider

### In Supabase
1. Dashboard → **Authentication** → **Providers** → find **Google** → toggle **Enable**
2. Leave the page open — you need to paste values here from Google

### In Google Cloud Console
1. Go to <https://console.cloud.google.com>
2. Create a new project (or use existing)
3. **APIs & Services** → **OAuth consent screen**
   - User Type: **External**
   - Fill in App name, support email, developer email → Save
4. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Name: `FinFlow`
   - **Authorized JavaScript origins:**
     ```
     http://localhost:5500
     https://YOUR_NETLIFY_OR_VERCEL_DOMAIN.com
     ```
   - **Authorized redirect URIs** — paste the callback URL from the Supabase Google provider page:
     ```
     https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
     ```
5. Click **Create** → copy the **Client ID** and **Client Secret**

### Back in Supabase
6. Paste **Client ID** and **Client Secret** into the Google provider form → **Save**

---

## Step 4 — Configure redirect URLs

1. Supabase dashboard → **Authentication** → **URL Configuration**
2. **Site URL** — set to your production domain:
   ```
   https://yourdomain.com
   ```
   For local dev use:
   ```
   http://localhost:5500
   ```
3. **Redirect URLs** — add both:
   ```
   http://localhost:5500/index.html
   https://yourdomain.com/index.html
   ```

---

## Step 5 — Add your keys to supabase.js

Open `supabase.js` and replace lines 18–19:

```js
const SUPABASE_URL  = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON = 'YOUR_ANON_PUBLIC_KEY';
```

Find your values at:  
**Supabase dashboard → Settings → API**
- **Project URL** → paste as `SUPABASE_URL`
- **anon public** key → paste as `SUPABASE_ANON`

> ⚠️ The `anon` key is safe to expose in frontend code.  
> **Never** use the `service_role` key in client-side code.

---

## Step 6 — (Optional) Create a demo Supabase account

The "Demo Account" button tries to sign in as `demo@finflow.app / Demo@1234`.  
To make it work with Supabase:

1. Supabase dashboard → **Authentication** → **Users** → **Invite user**
2. Email: `demo@finflow.app`
3. After invite, set password to `Demo@1234` via the reset flow

If the demo account doesn't exist in Supabase, the button falls back to
**guest mode** automatically (local data only, no sync).

---

## Step 7 — Test locally

Use **Live Server** (VS Code extension) or any static server:

```bash
# Python
python -m http.server 5500

# Node
npx serve .
```

Open `http://localhost:5500/login.html`

1. Click **Continue with Google** → Google consent screen → redirects back to `index.html`
2. Try email/password sign-up
3. Check **Supabase → Table Editor → profiles** — your row should appear

---

## How data flows

```
User action (add expense)
  → localStorage updated immediately   (fast, offline-capable)
  → sbSyncExpense() called async       (non-blocking)
    → Supabase expenses table updated

Next login / page load
  → syncFromSupabase() called
    → pulls latest rows from Supabase
    → writes into localStorage
  → script.js loadData() reads localStorage as normal
```

This means:
- **UI is never blocked** by network calls
- **Works offline** — changes sync when back online on next load
- **Multi-device** — sign in on phone, data syncs from cloud

---

## File overview

| File | Purpose |
|------|---------|
| `supabase.js` | Supabase client + all DB helper functions |
| `supabase_schema.sql` | Run once in Supabase SQL Editor |
| `auth.js` | Login/register/Google OAuth UI logic |
| `login.html` | Login page with Google button |
| `index.html` | Main app — Supabase auth guard + session sync |
| `script.js` | App logic — calls `sbSync*` functions on every write |
