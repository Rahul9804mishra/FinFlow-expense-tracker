/* =====================================================
   FINFLOW — Supabase Client & Data Layer
   supabase.js  v1.0

   SETUP INSTRUCTIONS:
   1. Create a project at https://supabase.com
   2. Run supabase_schema.sql in the SQL Editor
   3. Enable Google provider:
      Authentication → Providers → Google
   4. Replace the two values below with your project's:
      Settings → API → Project URL & anon public key
   5. Set your redirect URL in:
      Authentication → URL Configuration → Site URL
      Add:  http://localhost:PORT  (for local dev)
            https://yourdomain.com  (for production)
   ===================================================== */

const SUPABASE_URL  = 'https://emmrgzpjnqczijxfipcu.supabase.co';   // ← replace
const SUPABASE_ANON = 'sb_publishable_mpaVatqxrTuhWnN_ubhlZQ_N013anQt';                   // ← replace

// ── Load Supabase SDK from CDN (loaded before this file in HTML) ──
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: true,   // picks up OAuth redirect token from URL hash
  },
});

/* ─────────────────────────────────────────────────────
   AUTH HELPERS
   ───────────────────────────────────────────────────── */

/** Sign up with email + password */
async function sbSignUp(name, email, password) {
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });
  if (error) throw error;
  return data.user;
}

/** Sign in with email + password */
async function sbSignIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

/** Sign in / sign up with Google OAuth (redirects to Google) */
async function sbSignInWithGoogle() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/index.html',
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error) throw error;
}

/** Sign out */
async function sbSignOut() {
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

/** Password reset email */
async function sbResetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/login.html',
  });
  if (error) throw error;
}

/** Get currently authenticated user (null if not logged in) */
async function sbGetUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

/** Get active session */
async function sbGetSession() {
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

/* ─────────────────────────────────────────────────────
   PROFILE HELPERS
   ───────────────────────────────────────────────────── */

async function sbGetProfile(userId) {
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
  return data;
}

async function sbUpsertProfile(userId, fields) {
  const { error } = await sb
    .from('profiles')
    .upsert({ id: userId, ...fields, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/* ─────────────────────────────────────────────────────
   EXPENSES HELPERS
   ───────────────────────────────────────────────────── */

/** Fetch all expenses + income for the current user */
async function sbGetExpenses(userId) {
  const { data, error } = await sb
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Insert a single transaction */
async function sbInsertExpense(userId, record) {
  const { error } = await sb.from('expenses').insert({
    id:        record.id,
    user_id:   userId,
    name:      record.name,
    amount:    record.amount,
    date:      record.date,
    category:  record.category,
    type:      record.type,
    note:      record.note   || null,
    tags:      record.tags   || [],
    recurring: record.recurring || null,
  });
  if (error) throw error;
}

/** Update a transaction */
async function sbUpdateExpense(userId, record) {
  const { error } = await sb
    .from('expenses')
    .update({
      name:      record.name,
      amount:    record.amount,
      date:      record.date,
      category:  record.category,
      type:      record.type,
      note:      record.note   || null,
      tags:      record.tags   || [],
      recurring: record.recurring || null,
    })
    .eq('id', record.id)
    .eq('user_id', userId);
  if (error) throw error;
}

/** Delete a transaction by id */
async function sbDeleteExpense(userId, id) {
  const { error } = await sb
    .from('expenses')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

/** Bulk delete */
async function sbBulkDeleteExpenses(userId, ids) {
  const { error } = await sb
    .from('expenses')
    .delete()
    .in('id', ids)
    .eq('user_id', userId);
  if (error) throw error;
}

/* ─────────────────────────────────────────────────────
   BUDGETS HELPERS
   ───────────────────────────────────────────────────── */

async function sbGetBudgets(userId) {
  const { data, error } = await sb
    .from('budgets')
    .select('category, amount')
    .eq('user_id', userId);
  if (error) throw error;
  // Convert array → object { Food: 5000, ... }
  const obj = {};
  (data || []).forEach(row => { obj[row.category] = Number(row.amount); });
  return obj;
}

async function sbUpsertBudget(userId, category, amount) {
  const { error } = await sb
    .from('budgets')
    .upsert(
      { user_id: userId, category, amount, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,category' }
    );
  if (error) throw error;
}

/* ─────────────────────────────────────────────────────
   SYNC HELPERS  (localStorage ↔ Supabase)
   Used to load data into the app's in-memory state
   ───────────────────────────────────────────────────── */

/**
 * Pull all user data from Supabase into localStorage
 * so the existing script.js `loadData()` works unchanged.
 */
async function syncFromSupabase(userId) {
  try {
    const [profile, expenses, budgets] = await Promise.all([
      sbGetProfile(userId),
      sbGetExpenses(userId),
      sbGetBudgets(userId),
    ]);

    if (profile) {
      if (profile.name)
        localStorage.setItem('finflow_username', JSON.stringify(profile.name));
      if (profile.currency)
        localStorage.setItem('finflow_currency', JSON.stringify(profile.currency));
      if (profile.accent)
        localStorage.setItem('finflow_accent', JSON.stringify(profile.accent));
      if (profile.savings_goal != null)
        localStorage.setItem('finflow_savings_goal', JSON.stringify(Number(profile.savings_goal)));
    }

    const expenseRows = expenses.filter(e => e.type === 'expense').map(dbRowToRecord);
    const incomeRows  = expenses.filter(e => e.type === 'income').map(dbRowToRecord);
    localStorage.setItem('finflow_expenses', JSON.stringify(expenseRows));
    localStorage.setItem('finflow_income',   JSON.stringify(incomeRows));
    localStorage.setItem('finflow_budgets',  JSON.stringify(budgets));

    return true;
  } catch (err) {
    console.error('[FinFlow] syncFromSupabase error:', err.message);
    return false;
  }
}

/** Convert a Supabase DB row back to the app's record format */
function dbRowToRecord(row) {
  return {
    id:        row.id,
    name:      row.name,
    amount:    Number(row.amount),
    date:      row.date,          // 'YYYY-MM-DD' string
    category:  row.category,
    type:      row.type,
    note:      row.note   || '',
    tags:      row.tags   || [],
    recurring: row.recurring || '',
    createdAt: new Date(row.created_at).getTime(),
  };
}

/**
 * Push localStorage data up to Supabase.
 * Called once after sign-up so local demo data is preserved.
 */
async function pushLocalDataToSupabase(userId) {
  try {
    const localExp = JSON.parse(localStorage.getItem('finflow_expenses') || '[]');
    const localInc = JSON.parse(localStorage.getItem('finflow_income')   || '[]');
    const localBud = JSON.parse(localStorage.getItem('finflow_budgets')  || '{}');

    const allRecords = [
      ...localExp.map(r => ({ ...r, type: 'expense' })),
      ...localInc.map(r => ({ ...r, type: 'income'  })),
    ];

    // Insert in batches of 50
    for (let i = 0; i < allRecords.length; i += 50) {
      const batch = allRecords.slice(i, i + 50).map(r => ({
        id:        r.id,
        user_id:   userId,
        name:      r.name,
        amount:    r.amount,
        date:      r.date,
        category:  r.category,
        type:      r.type,
        note:      r.note      || null,
        tags:      r.tags      || [],
        recurring: r.recurring || null,
      }));
      await sb.from('expenses').upsert(batch, { onConflict: 'id' });
    }

    // Push budgets
    for (const [category, amount] of Object.entries(localBud)) {
      if (amount > 0) await sbUpsertBudget(userId, category, amount);
    }
  } catch (err) {
    console.error('[FinFlow] pushLocalDataToSupabase error:', err.message);
  }
}

/* ─────────────────────────────────────────────────────
   AUTH STATE OBSERVER
   Exposed so other scripts can react to login/logout
   ───────────────────────────────────────────────────── */
function onAuthStateChange(callback) {
  sb.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

/* ─────────────────────────────────────────────────────
   GUEST / DEMO MODE FLAG
   Guest users skip Supabase entirely (data stays local)
   ───────────────────────────────────────────────────── */
const GUEST_KEY = 'finflow_guest_mode';
const setGuestMode  = (v) => localStorage.setItem(GUEST_KEY, v ? '1' : '');
const isGuestMode   = ()  => localStorage.getItem(GUEST_KEY) === '1';
const clearGuestMode = () => localStorage.removeItem(GUEST_KEY);
