/* =====================================================
   FINFLOW — Enterprise Finance Platform  v3.0
   script.js  —  Complete logic
   ===================================================== */
'use strict';

/* ── CONSTANTS ───────────────────────────────────────── */
const STORAGE_KEYS = {
  USER_NAME:    'finflow_username',
  EXPENSES:     'finflow_expenses',
  BUDGETS:      'finflow_budgets',
  THEME:        'finflow_theme',
  CURRENCY:     'finflow_currency',
  ACCENT:       'finflow_accent',
  SAVINGS_GOAL: 'finflow_savings_goal',
  INCOME:       'finflow_income',
};

const CATEGORIES = ['Food','Transport','Shopping','Bills','Health','Other'];

const CAT_ICONS = {
  Food:'🍔', Transport:'🚗', Shopping:'🛍',
  Bills:'💡', Health:'🏥', Other:'📦',
};

const CAT_COLORS = {
  Food:'#f97316', Transport:'#4f46e5', Shopping:'#7c3aed',
  Bills:'#d97706', Health:'#0d9488', Other:'#64748b',
};

const CURRENCIES = {
  INR:{ symbol:'₹', locale:'en-IN' },
  USD:{ symbol:'$', locale:'en-US' },
  EUR:{ symbol:'€', locale:'de-DE' },
  GBP:{ symbol:'£', locale:'en-GB' },
  JPY:{ symbol:'¥', locale:'ja-JP' },
};

const KEYWORD_MAP = {
  Food:      ['lunch','dinner','breakfast','cafe','restaurant','pizza','burger','coffee','tea','snack','food','eat','meal','biryani','zomato','swiggy','dine','grocery','fruit','vegetable','chai'],
  Transport: ['uber','ola','auto','bus','metro','petrol','diesel','taxi','train','flight','fuel','car','bike','rickshaw','cab','parking','toll'],
  Shopping:  ['amazon','flipkart','myntra','clothes','shirt','shoes','bag','dress','mall','buy','purchase','electronics','phone','laptop','gadget'],
  Bills:     ['electricity','water','gas','internet','wifi','mobile','recharge','subscription','netflix','rent','emi','loan','insurance','bill'],
  Health:    ['medicine','doctor','hospital','clinic','pharmacy','gym','fitness','health','test','vaccine','dental','optical'],
};

/* ── STATE ───────────────────────────────────────────── */
const state = {
  expenses:       [],
  income:         [],
  budgets:        {},
  userName:       '',
  currency:       'INR',
  accent:         'indigo',
  savingsGoal:    0,
  trendRange:     7,
  deleteTargetId: null,
  deletedItem:    null,
  undoTimer:      null,
  chartInstances: {},
  groupByDate:    false,
  selectedIds:    new Set(),
};

/* ── STORAGE ─────────────────────────────────────────── */
const store = {
  get:(k,fb=null)=>{try{const v=localStorage.getItem(k);return v!==null?JSON.parse(v):fb;}catch{return fb;}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}},
};

/* ── LOAD DATA ───────────────────────────────────────── */
function loadData() {
  state.expenses    = store.get(STORAGE_KEYS.EXPENSES, []);
  state.income      = store.get(STORAGE_KEYS.INCOME,   []);
  state.budgets     = store.get(STORAGE_KEYS.BUDGETS,  {});
  state.userName    = store.get(STORAGE_KEYS.USER_NAME,'');
  state.currency    = store.get(STORAGE_KEYS.CURRENCY, 'INR');
  state.accent      = store.get(STORAGE_KEYS.ACCENT,   'indigo');
  state.savingsGoal = store.get(STORAGE_KEYS.SAVINGS_GOAL, 0);
  CATEGORIES.forEach(cat=>{ if(!state.budgets[cat]) state.budgets[cat]=0; });
}

function saveExpenses(){ store.set(STORAGE_KEYS.EXPENSES, state.expenses); }
function saveIncome()  { store.set(STORAGE_KEYS.INCOME,   state.income);   }
function saveBudgets() { store.set(STORAGE_KEYS.BUDGETS,  state.budgets);  }

/* ── SUPABASE WRITE-THROUGH ──────────────────────────── */
// Called after local save so the UI is never blocked.
// Silently skipped in guest mode or if supabase.js isn't loaded.
function _sbUserId() {
  return window.__sbUserId || null;
}
async function sbSyncExpense(record) {
  const uid = _sbUserId();
  if (!uid || (typeof isGuestMode === 'function' && isGuestMode())) return;
  try {
    if (typeof sbInsertExpense === 'function')
      await sbInsertExpense(uid, record);
  } catch(e) { console.warn('[sb] syncExpense:', e.message); }
}
async function sbSyncUpdateExpense(record) {
  const uid = _sbUserId();
  if (!uid || (typeof isGuestMode === 'function' && isGuestMode())) return;
  try {
    if (typeof sbUpdateExpense === 'function')
      await sbUpdateExpense(uid, record);
  } catch(e) { console.warn('[sb] syncUpdateExpense:', e.message); }
}
async function sbSyncDeleteExpense(id) {
  const uid = _sbUserId();
  if (!uid || (typeof isGuestMode === 'function' && isGuestMode())) return;
  try {
    if (typeof sbDeleteExpense === 'function')
      await sbDeleteExpense(uid, id);
  } catch(e) { console.warn('[sb] syncDeleteExpense:', e.message); }
}
async function sbSyncBulkDelete(ids) {
  const uid = _sbUserId();
  if (!uid || (typeof isGuestMode === 'function' && isGuestMode())) return;
  try {
    if (typeof sbBulkDeleteExpenses === 'function')
      await sbBulkDeleteExpenses(uid, ids);
  } catch(e) { console.warn('[sb] syncBulkDelete:', e.message); }
}
async function sbSyncBudget(category, amount) {
  const uid = _sbUserId();
  if (!uid || (typeof isGuestMode === 'function' && isGuestMode())) return;
  try {
    if (typeof sbUpsertBudget === 'function')
      await sbUpsertBudget(uid, category, amount);
  } catch(e) { console.warn('[sb] syncBudget:', e.message); }
}
async function sbSyncProfile(fields) {
  const uid = _sbUserId();
  if (!uid || (typeof isGuestMode === 'function' && isGuestMode())) return;
  try {
    if (typeof sbUpsertProfile === 'function')
      await sbUpsertProfile(uid, fields);
  } catch(e) { console.warn('[sb] syncProfile:', e.message); }
}

/* ── DOM HELPERS ─────────────────────────────────────── */
const $  = (sel,ctx=document) => ctx.querySelector(sel);
const $$ = (sel,ctx=document) => [...ctx.querySelectorAll(sel)];
function openModal(id)  { $(id).classList.add('open');  document.body.style.overflow='hidden'; }
function closeModal(id) { $(id).classList.remove('open'); document.body.style.overflow=''; }

/* ── TOAST ───────────────────────────────────────────── */
function toast(message, type='success') {
  const container = $('#toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type==='success'?'✓':type==='error'?'✕':'⚠';
  el.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(()=>{ el.classList.add('fade-out'); setTimeout(()=>el.remove(),300); }, 2800);
}

/* ── FORMAT HELPERS ──────────────────────────────────── */
function formatMoney(n) {
  const cur = CURRENCIES[state.currency];
  if (state.currency === 'JPY') {
    return cur.symbol + Math.round(n).toLocaleString(cur.locale);
  }
  return cur.symbol + Number(n).toLocaleString(cur.locale, { maximumFractionDigits:0 });
}

/* PDF-safe formatter: replaces Unicode symbols with ASCII equivalents
   so jsPDF's built-in Helvetica font renders them correctly */
const PDF_CURRENCY_SYMBOLS = {
  INR: 'Rs.',
  USD: '$',
  EUR: 'EUR',
  GBP: 'GBP',
  JPY: 'JPY',
};
function pdfMoney(n) {
  const sym = PDF_CURRENCY_SYMBOLS[state.currency] || 'Rs.';
  const cur = CURRENCIES[state.currency];
  if (state.currency === 'JPY') {
    return sym + ' ' + Math.round(n).toLocaleString('en-US');
  }
  const formatted = Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return sym + ' ' + formatted;
}

function formatDate(ds) {
  if (!ds) return '';
  const [y,m,d] = ds.split('-');
  return `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]} ${y}`;
}

function todayStr()  { return dateStr(new Date()); }
function dateStr(d)  { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function uid()       { return Math.random().toString(36).slice(2,11)+Date.now().toString(36); }
function escapeHTML(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ── CURRENCY ────────────────────────────────────────── */
function applyCurrency(code) {
  state.currency = code;
  store.set(STORAGE_KEYS.CURRENCY, code);
  $('#currency-select').value = code;
  const sym = CURRENCIES[code].symbol;
  const symEl = $('#modal-currency-symbol');
  if (symEl) symEl.textContent = sym;
  refreshAll();
  sbSyncProfile({ currency: code });
}

/* ── ACCENT THEME ────────────────────────────────────── */
function applyAccent(accent) {
  state.accent = accent;
  store.set(STORAGE_KEYS.ACCENT, accent);
  document.documentElement.setAttribute('data-accent', accent);
  $$('.accent-swatch').forEach(s => s.classList.toggle('active', s.dataset.accent === accent));
  sbSyncProfile({ accent });
}

/* ── THEME ───────────────────────────────────────────── */
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark?'dark':'light');
  $('#theme-icon').textContent = dark?'☀':'☽';
  store.set(STORAGE_KEYS.THEME, dark?'dark':'light');
  rebuildAllCharts();
}

/* ── USER / ONBOARDING ───────────────────────────────── */
function initUser() {
  const name = state.userName.trim();
  if (!name) { openOnboarding(); return; }
  applyUserName(name);
}
function openOnboarding() { $('#onboarding-overlay').classList.remove('hidden'); }
function applyUserName(name) {
  state.userName = name;
  store.set(STORAGE_KEYS.USER_NAME, name);
  $('#onboarding-overlay').classList.add('hidden');
  const init = name.charAt(0).toUpperCase();
  $('#sidebar-avatar').textContent   = init;
  $('#sidebar-username').textContent = name;
  $('#topbar-name').textContent      = name;
  $('#dashboard-subtitle').textContent = `Here's your financial snapshot, ${name.split(' ')[0]} ✨`;
}
function getGreeting() {
  const h = new Date().getHours();
  return h<12?'Good morning,':h<17?'Good afternoon,':'Good evening,';
}

/* ── NAVIGATION ──────────────────────────────────────── */
function navigateTo(section) {
  $$('.nav-item').forEach(el => el.classList.remove('active'));
  $$('.page').forEach(el => el.classList.remove('active'));
  const nav = $(`.nav-item[data-section="${section}"]`);
  if (nav) nav.classList.add('active');
  const page = $(`#page-${section}`);
  if (page) page.classList.add('active');
  closeSidebar();
  if (section==='dashboard') refreshDashboard();
  if (section==='budget')    renderBudget();
  if (section==='analytics') renderAnalytics();
  if (section==='expenses')  renderExpenseList();
  if (section==='income')    renderIncomePage();
  if (section==='recurring') renderRecurringPage();
  if (section==='report')    renderReportPage();
}

/* ── SIDEBAR ─────────────────────────────────────────── */
function openSidebar()  { $('#sidebar').classList.add('open'); $('#sidebar-overlay').classList.add('open'); document.body.style.overflow='hidden'; }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebar-overlay').classList.remove('open'); document.body.style.overflow=''; }

/* ── MODAL: ADD/EDIT ─────────────────────────────────── */
function openAddModal(prefillType) {
  resetModal();
  $('#modal-title').textContent  = 'Add Transaction';
  $('#modal-submit').textContent = 'Save';
  $('#edit-expense-id').value    = '';
  $('#expense-date').value       = todayStr();
  if (prefillType==='income') setTypeToggle('income');
  else setTypeToggle('expense');
  openModal('#expense-modal');
}

function openEditModal(id) {
  // search both arrays
  const exp = state.expenses.find(e=>e.id===id) || state.income.find(e=>e.id===id);
  if (!exp) return;
  resetModal();
  $('#modal-title').textContent  = 'Edit Transaction';
  $('#modal-submit').textContent = 'Update';
  $('#edit-expense-id').value    = id;
  $('#expense-name').value       = exp.name;
  $('#expense-amount').value     = exp.amount;
  $('#expense-date').value       = exp.date;
  $('#expense-note').value       = exp.note||'';
  $('#expense-tags').value       = (exp.tags||[]).join(', ');
  $('#expense-recurring').value  = exp.recurring||'';
  if (exp.type==='income') {
    setTypeToggle('income');
  } else {
    setTypeToggle('expense');
    selectCategory(exp.category);
  }
  openModal('#expense-modal');
}

function resetModal() {
  $('#expense-name').value     = '';
  $('#expense-amount').value   = '';
  $('#expense-note').value     = '';
  $('#expense-tags').value     = '';
  $('#expense-recurring').value= '';
  $('#expense-category').value = '';
  $('#amount-formatted').textContent = '';
  $('#suggestion-chip').classList.add('hidden');
  $$('.cat-btn').forEach(b=>b.classList.remove('active'));
}

function setTypeToggle(type) {
  $('#expense-type').value = type;
  $$('.type-btn').forEach(b=>b.classList.toggle('active', b.dataset.type===type));
  const catGroup = $('#category-group');
  if (catGroup) catGroup.style.display = type==='income'?'none':'block';
}

function selectCategory(cat) {
  $('#expense-category').value = cat;
  $$('.cat-btn').forEach(b=>b.classList.toggle('active', b.dataset.cat===cat));
}

function suggestCategory(nameVal) {
  const lower = nameVal.toLowerCase();
  for (const [cat,kws] of Object.entries(KEYWORD_MAP)) {
    if (kws.some(kw=>lower.includes(kw))) return cat;
  }
  return null;
}

function saveTransaction() {
  const name     = $('#expense-name').value.trim();
  const amount   = parseFloat($('#expense-amount').value);
  const date     = $('#expense-date').value;
  const type     = $('#expense-type').value;
  const category = type==='income'?'Income':$('#expense-category').value;
  const note     = $('#expense-note').value.trim();
  const tagsRaw  = $('#expense-tags').value.trim();
  const tags     = tagsRaw ? tagsRaw.split(',').map(t=>t.trim()).filter(Boolean) : [];
  const recurring= $('#expense-recurring').value;

  if (!name)               return toast('Please enter a description','error');
  if (!amount||amount<=0)  return toast('Please enter a valid amount','error');
  if (!date)               return toast('Please pick a date','error');
  if (type==='expense'&&!category) return toast('Please select a category','error');

  const editId = $('#edit-expense-id').value;
  const record = { id: editId||uid(), name, amount, date, category, note, tags, recurring, type, createdAt: Date.now() };

  if (editId) {
    // remove from both arrays first
    state.expenses = state.expenses.filter(e=>e.id!==editId);
    state.income   = state.income.filter(e=>e.id!==editId);
    if (type==='income') state.income.push(record);
    else state.expenses.push(record);
    toast('Transaction updated!');
  } else {
    if (type==='income') state.income.push(record);
    else state.expenses.push(record);
    toast('Transaction added!');
  }

  saveExpenses(); saveIncome();
  closeModal('#expense-modal');
  refreshAll();
  // Supabase write-through
  if (editId) sbSyncUpdateExpense(record);
  else        sbSyncExpense(record);
}

/* ── DELETE WITH UNDO ────────────────────────────────── */
function triggerDelete(id) {
  state.deleteTargetId = id;
  openModal('#delete-modal');
}

function confirmDelete() {
  const id = state.deleteTargetId;
  const expIdx = state.expenses.findIndex(e=>e.id===id);
  const incIdx = state.income.findIndex(e=>e.id===id);

  if (expIdx !== -1) { state.deletedItem = { arr:'expenses', item: state.expenses[expIdx] }; state.expenses.splice(expIdx,1); }
  else if (incIdx !== -1) { state.deletedItem = { arr:'income', item: state.income[incIdx] }; state.income.splice(incIdx,1); }

  state.deleteTargetId = null;
  saveExpenses(); saveIncome();
  closeModal('#delete-modal');
  refreshAll();
  showUndoBar();
  // Supabase write-through (delayed so undo can cancel it)
  state._pendingDeleteId = id;
  state._pendingDeleteTimer = setTimeout(() => {
    if (state._pendingDeleteId === id) sbSyncDeleteExpense(id);
  }, 5100); // fires after undo window closes
}

function showUndoBar() {
  const bar = $('#undo-bar');
  bar.classList.remove('hidden');
  clearTimeout(state.undoTimer);
  state.undoTimer = setTimeout(()=>{ bar.classList.add('hidden'); state.deletedItem=null; }, 5000);
}

function undoDelete() {
  if (!state.deletedItem) return;
  const { arr, item } = state.deletedItem;
  if (arr==='expenses') state.expenses.push(item);
  else state.income.push(item);
  saveExpenses(); saveIncome();
  // cancel the pending Supabase delete
  state._pendingDeleteId = null;
  clearTimeout(state._pendingDeleteTimer);
  // re-insert in Supabase
  sbSyncExpense(item);
  state.deletedItem = null;
  clearTimeout(state.undoTimer);
  $('#undo-bar').classList.add('hidden');
  toast('Undo successful!');
  refreshAll();
}

/* ── BULK DELETE ─────────────────────────────────────── */
function updateBulkUI() {
  const count = state.selectedIds.size;
  const btn   = $('#bulk-delete-btn');
  const bar   = $('#bulk-bar');
  if (count > 0) {
    btn.style.display = 'inline-flex';
    bar.style.display = 'flex';
    $('#bulk-count').textContent = count;
  } else {
    btn.style.display = 'none';
    bar.style.display = 'none';
  }
  // sync select-all cb
  const allIds = [...state.expenses, ...state.income].map(e=>e.id);
  const selectAllCb = $('#select-all-cb');
  if (selectAllCb) selectAllCb.checked = allIds.length>0 && allIds.every(id=>state.selectedIds.has(id));
}

function bulkDeleteSelected() {
  if (!state.selectedIds.size) return;
  const ids = [...state.selectedIds];
  state.expenses = state.expenses.filter(e=>!state.selectedIds.has(e.id));
  state.income   = state.income.filter(e=>!state.selectedIds.has(e.id));
  saveExpenses(); saveIncome();
  const count = state.selectedIds.size;
  state.selectedIds.clear();
  updateBulkUI();
  toast(`${count} item(s) deleted`,'warn');
  refreshAll();
  // Supabase write-through
  sbSyncBulkDelete(ids);
}

/* ── DASHBOARD ───────────────────────────────────────── */
function refreshDashboard() {
  updateStatCards();
  updateMonthlySummary();
  updateInsights();
  renderRecentList();
  renderTrendChart(state.trendRange);
  renderPieChart();
}

function currentMonthExpenses() {
  const key = monthKey(new Date());
  return state.expenses.filter(e=>e.date.startsWith(key));
}
function currentMonthIncome() {
  const key = monthKey(new Date());
  return state.income.filter(e=>e.date.startsWith(key));
}
function prevMonthExpenses() {
  const d = new Date(); d.setMonth(d.getMonth()-1);
  const key = monthKey(d);
  return state.expenses.filter(e=>e.date.startsWith(key));
}

function updateStatCards() {
  const monthly     = currentMonthExpenses();
  const monthlyInc  = currentMonthIncome();
  const totalSpent  = monthly.reduce((s,e)=>s+e.amount,0);
  const totalIncome = monthlyInc.reduce((s,e)=>s+e.amount,0);
  const totalBudget = Object.values(state.budgets).reduce((s,v)=>s+v,0);
  const remaining   = totalBudget - totalSpent;
  const score       = calcHealthScore(totalSpent, totalBudget);

  $('#stat-total').textContent     = formatMoney(totalSpent);
  $('#stat-income').textContent    = formatMoney(totalIncome);
  $('#stat-remaining').textContent = formatMoney(Math.max(0,remaining));
  $('#stat-count').textContent     = state.expenses.length + state.income.length;

  const scoreEl = $('#stat-health');
  scoreEl.textContent = score>0?score:'—';
  $('#stat-health-label').textContent =
    score>=80?'🟢 Excellent':score>=60?'🟡 Good':score>=40?'🟠 Fair':score>0?'🔴 Needs attention':'Set budgets first';

  // Savings goal stat card
  if (state.savingsGoal > 0 && totalIncome > 0) {
    const saved = totalIncome - totalSpent;
    const pct   = Math.round((saved/state.savingsGoal)*100);
    $('#stat-savings').textContent = `${pct}%`;
    $('#stat-savings-label').textContent = `${formatMoney(Math.max(0,saved))} saved`;
  } else {
    $('#stat-savings').textContent = '—';
    $('#stat-savings-label').textContent = 'Set a goal below';
  }
  // Pre-fill goal input
  if (state.savingsGoal > 0) $('#savings-goal-input').value = state.savingsGoal;
}

function calcHealthScore(spent, budget) {
  if (budget<=0) return 0;
  const r = spent/budget;
  if (r<=0) return 100; if (r<=.5) return 90; if (r<=.7) return 75;
  if (r<=.85) return 60; if (r<=1) return 40;
  return Math.max(0, Math.round(20-(r-1)*20));
}

function updateMonthlySummary() {
  const monthly    = currentMonthExpenses();
  const prevMonthly= prevMonthExpenses();
  const monthlyInc = currentMonthIncome();
  const totalSpent = monthly.reduce((s,e)=>s+e.amount,0);
  const prevSpent  = prevMonthly.reduce((s,e)=>s+e.amount,0);
  const totalInc   = monthlyInc.reduce((s,e)=>s+e.amount,0);

  // vs last month
  const vsEl = $('#summary-vs-last');
  if (prevSpent > 0) {
    const diff = totalSpent - prevSpent;
    const pct  = Math.abs(Math.round((diff/prevSpent)*100));
    vsEl.textContent = (diff>0?'↑ ':'↓ ')+pct+'%';
    vsEl.className   = 'summary-value '+(diff>0?'negative':'positive');
  } else { vsEl.textContent='—'; vsEl.className='summary-value'; }

  // Biggest single expense
  const bigEl = $('#summary-biggest');
  if (monthly.length) {
    const biggest = monthly.reduce((a,b)=>a.amount>b.amount?a:b);
    bigEl.textContent = formatMoney(biggest.amount);
  } else { bigEl.textContent='—'; }
  bigEl.className='summary-value';

  // Savings rate
  const rateEl = $('#summary-savings-rate');
  if (totalInc > 0) {
    const rate = Math.round(((totalInc-totalSpent)/totalInc)*100);
    rateEl.textContent = rate+'%';
    rateEl.className   = 'summary-value '+(rate>=0?'positive':'negative');
  } else { rateEl.textContent='—'; rateEl.className='summary-value'; }

  // Daily average
  const dayEl  = $('#summary-daily-avg');
  const today  = new Date();
  const dayOfMonth = today.getDate();
  dayEl.textContent = monthly.length ? formatMoney(Math.round(totalSpent/dayOfMonth)) : '—';
  dayEl.className = 'summary-value';
}

/* ── INSIGHTS ────────────────────────────────────────── */
function updateInsights() {
  const container = $('#insights-list');
  const chips     = generateInsights();
  if (!chips.length) { container.innerHTML='<span class="insight-chip">Add expenses to get insights</span>'; return; }
  container.innerHTML = chips.map(c=>`<span class="insight-chip">${c}</span>`).join('');
}

function generateInsights() {
  const monthly = currentMonthExpenses();
  const monthlyInc = currentMonthIncome();
  if (!monthly.length && !monthlyInc.length) return [];
  const insights = [];
  const byCategory = {};
  CATEGORIES.forEach(c=>{byCategory[c]=0;});
  monthly.forEach(e=>{byCategory[e.category]=(byCategory[e.category]||0)+e.amount;});

  const topCat = Object.entries(byCategory).sort((a,b)=>b[1]-a[1])[0];
  if (topCat&&topCat[1]>0) insights.push(`${CAT_ICONS[topCat[0]]} Most spending: ${topCat[0]} (${formatMoney(topCat[1])})`);

  CATEGORIES.forEach(cat=>{
    const budget=state.budgets[cat]||0, spent=byCategory[cat]||0;
    if (budget>0&&spent>=budget*.9&&spent<budget) insights.push(`⚠️ Near limit in ${cat}`);
    if (budget>0&&spent>=budget) insights.push(`🔴 Budget exceeded: ${cat}!`);
  });

  if (monthly.length>10) insights.push(`📊 ${monthly.length} transactions this month`);

  const weekendSpend = monthly.filter(e=>{ const d=new Date(e.date);return d.getDay()===0||d.getDay()===6; }).reduce((s,e)=>s+e.amount,0);
  if (weekendSpend>0) insights.push(`📅 Weekend spend: ${formatMoney(weekendSpend)}`);

  const totalInc = monthlyInc.reduce((s,e)=>s+e.amount,0);
  const totalExp = monthly.reduce((s,e)=>s+e.amount,0);
  if (totalInc>0) {
    const rate = Math.round(((totalInc-totalExp)/totalInc)*100);
    insights.push(`💰 Savings rate: ${rate}% this month`);
  }

  // Recurring reminders
  const recurring = state.expenses.filter(e=>e.recurring==='monthly');
  if (recurring.length) insights.push(`🔁 ${recurring.length} recurring expense(s) tracked`);

  return insights.slice(0,6);
}

/* ── EXPENSE LIST RENDERING ──────────────────────────── */
function renderExpenseList() {
  const search  = ($('#search-input').value||'').toLowerCase();
  const catF    = $('#filter-category').value;
  const typeF   = $('#filter-type').value;
  const sortV   = $('#sort-select').value;

  let combined = [
    ...state.expenses.map(e=>({...e,type:'expense'})),
    ...state.income.map(e=>({...e,type:'income'})),
  ];

  if (search) combined = combined.filter(e=>
    e.name.toLowerCase().includes(search) ||
    (e.note||'').toLowerCase().includes(search) ||
    (e.category||'').toLowerCase().includes(search) ||
    (e.tags||[]).some(t=>t.toLowerCase().includes(search)));
  if (catF) combined = combined.filter(e=>e.category===catF);
  if (typeF) combined = combined.filter(e=>e.type===typeF);

  combined.sort((a,b)=>{
    if (sortV==='date-desc')   return new Date(b.date)-new Date(a.date);
    if (sortV==='date-asc')    return new Date(a.date)-new Date(b.date);
    if (sortV==='amount-desc') return b.amount-a.amount;
    if (sortV==='amount-asc')  return a.amount-b.amount;
    return 0;
  });

  const container = $('#expenses-list');
  if (!combined.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">◈</div>
      <p>No transactions found</p>
      <small>Try adjusting your filters</small>
      <button class="btn-primary mt-16" id="empty-add-btn">+ Add Expense</button>
    </div>`;
    const btn = container.querySelector('#empty-add-btn');
    if (btn) btn.addEventListener('click',()=>openAddModal());
    return;
  }

  if (state.groupByDate) {
    renderGrouped(container, combined);
  } else {
    container.innerHTML = combined.map(exp=>expenseItemHTML(exp)).join('');
    bindItemActions(container);
  }
  updateBulkUI();
}

function renderGrouped(container, list) {
  const groups = {};
  list.forEach(exp=>{
    const key = exp.date;
    if (!groups[key]) groups[key]=[];
    groups[key].push(exp);
  });
  const sortedKeys = Object.keys(groups).sort((a,b)=>new Date(b)-new Date(a));
  const today = todayStr();
  const yesterday = dateStr(new Date(Date.now()-86400000));
  let html = '';
  sortedKeys.forEach(key=>{
    const items = groups[key];
    const total = items.filter(e=>e.type==='expense').reduce((s,e)=>s+e.amount,0);
    let label = formatDate(key);
    if (key===today) label='Today';
    else if (key===yesterday) label='Yesterday';
    html += `<div class="date-group">
      <div class="date-group-label">${label}<span class="date-group-total">${formatMoney(total)}</span></div>
      ${items.map(exp=>expenseItemHTML(exp)).join('')}
    </div>`;
  });
  container.innerHTML = html;
  bindItemActions(container);
}

function bindItemActions(container) {
  container.querySelectorAll('.edit-btn').forEach(btn=>btn.addEventListener('click',()=>openEditModal(btn.dataset.id)));
  container.querySelectorAll('.delete-btn').forEach(btn=>btn.addEventListener('click',()=>triggerDelete(btn.dataset.id)));
  container.querySelectorAll('.expense-cb').forEach(cb=>{
    cb.checked = state.selectedIds.has(cb.dataset.id);
    cb.addEventListener('change',()=>{
      if (cb.checked) state.selectedIds.add(cb.dataset.id);
      else state.selectedIds.delete(cb.dataset.id);
      updateBulkUI();
    });
  });
}

function expenseItemHTML(exp) {
  const isIncome = exp.type==='income';
  const icon     = isIncome?'💰':(CAT_ICONS[exp.category]||'📦');
  const iconCls  = isIncome?'icon-Other':`icon-${exp.category}`;
  const amtColor = isIncome?`color:var(--emerald-500)`:'';
  const amtPrefix= isIncome?'+':'';
  const incomeClass = isIncome?'income-item':'';
  const tagsHTML = (exp.tags||[]).length
    ? `<span class="expense-tags">${exp.tags.map(t=>`<span class="tag-chip">${escapeHTML(t)}</span>`).join('')}</span>`
    : '';
  const recurHTML = exp.recurring
    ? `<span class="recurring-badge">🔁 ${exp.recurring}</span>` : '';
  const checked  = state.selectedIds.has(exp.id)?'checked':'';

  return `<div class="expense-item ${incomeClass}" data-id="${exp.id}">
    <input type="checkbox" class="expense-cb" data-id="${exp.id}" ${checked} />
    <div class="expense-cat-icon ${iconCls}">${icon}</div>
    <div class="expense-info">
      <div class="expense-name">${escapeHTML(exp.name)}</div>
      <div class="expense-meta">
        ${!isIncome?`<span class="expense-cat cat-${exp.category}">${exp.category}</span>`:'<span class="expense-cat cat-Other">Income</span>'}
        <span class="expense-date">${formatDate(exp.date)}</span>
        ${exp.note?`<span class="expense-note">${escapeHTML(exp.note)}</span>`:''}
        ${tagsHTML}${recurHTML}
      </div>
    </div>
    <div class="expense-amount" style="${amtColor}">${amtPrefix}${formatMoney(exp.amount)}</div>
    <div class="expense-actions">
      <button class="action-btn edit-btn" data-id="${exp.id}" title="Edit">✎</button>
      <button class="action-btn delete-btn" data-id="${exp.id}" title="Delete">✕</button>
    </div>
  </div>`;
}

/* ── RECENT LIST ─────────────────────────────────────── */
function renderRecentList() {
  const all = [
    ...state.expenses.map(e=>({...e,type:'expense'})),
    ...state.income.map(e=>({...e,type:'income'})),
  ].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);

  const container = $('#recent-list');
  if (!all.length) {
    container.innerHTML=`<div class="empty-state"><div class="empty-icon">◎</div><p>No transactions yet</p><small>Add your first expense to get started</small></div>`;
    return;
  }
  container.innerHTML = all.map(e=>expenseItemHTML(e)).join('');
  bindItemActions(container);
}

/* ── INCOME PAGE ─────────────────────────────────────── */
function renderIncomePage() {
  const monthly    = currentMonthIncome();
  const monthlyExp = currentMonthExpenses();
  const totalInc   = monthly.reduce((s,e)=>s+e.amount,0);
  const totalExp   = monthlyExp.reduce((s,e)=>s+e.amount,0);
  const net        = totalInc - totalExp;
  const rate       = totalInc>0?Math.round(((totalInc-totalExp)/totalInc)*100):0;

  const el = id => document.getElementById(id);
  if (el('income-stat-month')) el('income-stat-month').textContent = formatMoney(totalInc);
  if (el('income-stat-net'))   { el('income-stat-net').textContent = formatMoney(net); el('income-stat-net').style.color = net>=0?'#d1fae5':'#fee2e2'; }
  if (el('income-stat-rate'))  el('income-stat-rate').textContent  = totalInc>0?rate+'%':'—';

  const sorted = [...state.income].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const container = $('#income-list');
  if (!container) return;
  if (!sorted.length) {
    container.innerHTML=`<div class="empty-state"><div class="empty-icon">↑</div><p>No income recorded yet</p><small>Add your salary, freelance or other income</small></div>`;
    return;
  }
  container.innerHTML = sorted.map(e=>expenseItemHTML({...e,type:'income'})).join('');
  bindItemActions(container);
}

/* ── BUDGET ──────────────────────────────────────────── */
function renderBudget() {
  const monthly = currentMonthExpenses();
  const grid    = $('#budget-grid');
  grid.innerHTML = CATEGORIES.map(cat=>{
    const spent   = monthly.filter(e=>e.category===cat).reduce((s,e)=>s+e.amount,0);
    const budget  = state.budgets[cat]||0;
    const pct     = budget>0?Math.min(100,(spent/budget)*100):0;
    const exceeded= budget>0&&spent>budget;
    return `<div class="budget-card">
      <div class="budget-card-header">
        <div class="budget-cat-icon icon-${cat}">${CAT_ICONS[cat]}</div>
        <div><div class="budget-cat-name">${cat}</div><div class="budget-cat-spent">Spent: ${formatMoney(spent)}</div></div>
      </div>
      <div class="budget-input-row">
        <input type="number" class="budget-input" data-cat="${cat}" placeholder="Set budget..." value="${budget||''}" min="0" step="100"/>
        <button class="budget-save-btn" data-cat="${cat}">Save</button>
      </div>
      <div class="budget-progress-wrap">
        <div class="budget-progress-bar">
          <div class="budget-progress-fill ${exceeded?'warning':''}" style="width:${pct}%"></div>
        </div>
        <div class="budget-progress-labels">
          <span>${formatMoney(spent)} spent</span>
          <span>${budget?formatMoney(budget):'No budget'}</span>
        </div>
      </div>
      ${exceeded?`<div class="budget-warning">⚠ Over budget by ${formatMoney(spent-budget)}</div>`:
        budget>0&&pct>=90?`<div class="budget-warning" style="color:#d97706">⚠ Near limit (${Math.round(pct)}%)</div>`:''}
    </div>`;
  }).join('');

  grid.querySelectorAll('.budget-save-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const cat   = btn.dataset.cat;
      const input = grid.querySelector(`.budget-input[data-cat="${cat}"]`);
      const val   = parseFloat(input.value)||0;
      state.budgets[cat]=val;
      saveBudgets();
      toast(`Budget for ${cat} saved!`);
      renderBudget();
      updateStatCards();
      // Supabase write-through
      sbSyncBudget(cat, val);
    });
  });
}

/* ── CHARTS HELPERS ──────────────────────────────────── */
function getChartColors() {
  const dark = document.documentElement.getAttribute('data-theme')==='dark';
  return { text:dark?'#8ba3c7':'#64748b', grid:dark?'rgba(59,130,246,.1)':'rgba(37,99,235,.07)' };
}
function destroyChart(key) {
  if (state.chartInstances[key]) { state.chartInstances[key].destroy(); delete state.chartInstances[key]; }
}
function tooltipStyle() {
  const dark = document.documentElement.getAttribute('data-theme')==='dark';
  return {
    backgroundColor: dark?'#0f1b35':'#ffffff', titleColor:dark?'#e8f0fe':'#0f1b35',
    bodyColor:dark?'#8ba3c7':'#64748b', borderColor:dark?'rgba(59,130,246,.2)':'rgba(37,99,235,.15)',
    borderWidth:1, padding:12, cornerRadius:10, boxPadding:6,
  };
}

/* ── TREND CHART ─────────────────────────────────────── */
function renderTrendChart(days) {
  destroyChart('trend');
  const ctx    = $('#trend-chart').getContext('2d');
  const labels = [], data = [];
  const now    = new Date();
  for (let i=days-1;i>=0;i--) {
    const d=new Date(now); d.setDate(now.getDate()-i);
    const key=dateStr(d);
    labels.push(i===0?'Today':`${d.getDate()}/${d.getMonth()+1}`);
    data.push(state.expenses.filter(e=>e.date===key).reduce((s,e)=>s+e.amount,0));
  }
  const cc=getChartColors();
  const gradient=ctx.createLinearGradient(0,0,0,200);
  gradient.addColorStop(0,'rgba(79,70,229,.35)');
  gradient.addColorStop(1,'rgba(79,70,229,.02)');
  state.chartInstances.trend = new Chart(ctx,{
    type:'line',
    data:{ labels, datasets:[{ label:'Spent', data, borderColor:'#4f46e5', backgroundColor:gradient, borderWidth:2.5,
      pointBackgroundColor:'#4f46e5', pointRadius:4, pointHoverRadius:6, tension:0.4, fill:true }] },
    options:{ responsive:true,
      plugins:{ legend:{display:false}, tooltip:{...tooltipStyle(), callbacks:{ label:c=>` ${formatMoney(c.raw)}` }} },
      scales:{
        x:{ grid:{color:cc.grid}, ticks:{color:cc.text,font:{size:11}} },
        y:{ grid:{color:cc.grid}, ticks:{color:cc.text,font:{size:11},callback:v=>formatMoney(v)} },
      },
    },
  });
}

/* ── PIE CHART ───────────────────────────────────────── */
function renderPieChart() {
  destroyChart('pie');
  const ctx     = $('#pie-chart').getContext('2d');
  const monthly = currentMonthExpenses();
  const labels=[], data=[], colors=[];
  CATEGORIES.forEach(cat=>{
    const total=monthly.filter(e=>e.category===cat).reduce((s,e)=>s+e.amount,0);
    if (total>0){ labels.push(cat); data.push(total); colors.push(CAT_COLORS[cat]); }
  });
  if (!data.length) { $('#pie-legend').innerHTML='<span style="color:var(--text-muted);font-size:.8rem">No data this month</span>'; return; }
  state.chartInstances.pie = new Chart(ctx,{
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor:colors, borderWidth:0, hoverOffset:8 }] },
    options:{ responsive:true, cutout:'68%',
      plugins:{ legend:{display:false}, tooltip:{...tooltipStyle(), callbacks:{ label:c=>` ${c.label}: ${formatMoney(c.raw)}` }} },
    },
  });
  $('#pie-legend').innerHTML = labels.map((l,i)=>
    `<div class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span><span>${l}</span></div>`).join('');
}

/* ── ANALYTICS CHARTS ────────────────────────────────── */
function renderAnalytics() { renderMonthlyChart(); renderBarChart(); renderDailyChart(); }

function renderMonthlyChart() {
  destroyChart('monthly');
  const ctx=document.getElementById('monthly-chart').getContext('2d');
  const now=new Date(); const months=[], expData=[], incData=[];
  for (let i=5;i>=0;i--) {
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    months.push(d.toLocaleString('default',{month:'short'})+' '+d.getFullYear().toString().slice(2));
    expData.push(state.expenses.filter(e=>e.date.startsWith(key)).reduce((s,e)=>s+e.amount,0));
    incData.push(state.income.filter(e=>e.date.startsWith(key)).reduce((s,e)=>s+e.amount,0));
  }
  const cc=getChartColors();
  state.chartInstances.monthly = new Chart(ctx,{
    type:'bar',
    data:{ labels:months, datasets:[
      { label:'Expenses', data:expData, backgroundColor:'rgba(79,70,229,.7)', borderRadius:6, borderSkipped:false },
      { label:'Income',   data:incData, backgroundColor:'rgba(5,150,105,.7)',  borderRadius:6, borderSkipped:false },
    ]},
    options:{ responsive:true,
      plugins:{ legend:{display:true, labels:{color:cc.text,font:{size:11}}}, tooltip:tooltipStyle() },
      scales:{ x:{grid:{display:false},ticks:{color:cc.text}}, y:{grid:{color:cc.grid},ticks:{color:cc.text,callback:v=>formatMoney(v)}} },
    },
  });
}

function renderBarChart() {
  destroyChart('bar');
  const ctx     = document.getElementById('bar-chart').getContext('2d');
  const monthly = currentMonthExpenses();
  const data    = CATEGORIES.map(cat=>monthly.filter(e=>e.category===cat).reduce((s,e)=>s+e.amount,0));
  const cc      = getChartColors();
  state.chartInstances.bar = new Chart(ctx,{
    type:'bar',
    data:{ labels:CATEGORIES, datasets:[{ label:'Spent', data, backgroundColor:CATEGORIES.map(c=>CAT_COLORS[c]+'cc'), borderRadius:6, borderSkipped:false }] },
    options:{ responsive:true,
      plugins:{ legend:{display:false}, tooltip:tooltipStyle() },
      scales:{ x:{grid:{display:false},ticks:{color:cc.text}}, y:{grid:{color:cc.grid},ticks:{color:cc.text,callback:v=>formatMoney(v)}} },
    },
  });
}

function renderDailyChart() {
  destroyChart('daily');
  const ctx    = document.getElementById('daily-chart').getContext('2d');
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const totals = Array(7).fill(0);
  state.expenses.forEach(e=>{ const d=new Date(e.date); totals[d.getDay()]+=e.amount; });
  const cc = getChartColors();
  state.chartInstances.daily = new Chart(ctx,{
    type:'bar',
    data:{ labels:days, datasets:[{ label:'Spending', data:totals,
      backgroundColor:totals.map((_,i)=>i===0||i===6?'rgba(20,184,166,.7)':'rgba(79,70,229,.5)'),
      borderRadius:6, borderSkipped:false }] },
    options:{ responsive:true,
      plugins:{ legend:{display:false}, tooltip:tooltipStyle() },
      scales:{ x:{grid:{display:false},ticks:{color:cc.text}}, y:{grid:{color:cc.grid},ticks:{color:cc.text,callback:v=>formatMoney(v)}} },
    },
  });
}

function rebuildAllCharts() {
  const active = document.querySelector('.page.active');
  if (!active) return;
  const id = active.id.replace('page-','');
  if (id==='dashboard') refreshDashboard();
  if (id==='analytics') renderAnalytics();
}

/* ── EXPORT JSON ─────────────────────────────────────── */
function exportData() {
  const payload = { exportedAt:new Date().toISOString(), user:state.userName, expenses:state.expenses, income:state.income, budgets:state.budgets };
  const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=`finflow-export-${todayStr()}.json`; a.click();
  URL.revokeObjectURL(url);
  toast('Data exported!');
}

/* ── EXPORT PDF (styled) ─────────────────────────────── */
function exportToPDF() {
  if (!window.jspdf) { toast('PDF library loading...','warn'); return; }
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ unit:'mm', format:'a4' });
  const W    = 210; // page width mm
  const L    = 14;  // left margin
  const R    = W - 14; // right margin

  // ── colour palette ──────────────────────────────────
  const C = {
    brand:    [79,  70,  229],
    brandDark:[55,  48,  163],
    teal:     [13,  148, 136],
    emerald:  [5,   150, 105],
    amber:    [217, 119, 6  ],
    rose:     [244, 63,  94 ],
    violet:   [139, 92,  246],
    white:    [255, 255, 255],
    black:    [15,  23,  42 ],
    dark:     [71,  85,  105],
    muted:    [148, 163, 184],
    bg:       [241, 245, 249],
    border:   [226, 232, 240],
    rowAlt:   [248, 250, 252],
  };

  // ── helpers ──────────────────────────────────────────
  const setFill   = (col) => doc.setFillColor(...col);
  const setStroke = (col) => doc.setDrawColor(...col);
  const setColor  = (col) => doc.setTextColor(...col);
  const setFont   = (style='normal', size=10) => { doc.setFont('helvetica', style); doc.setFontSize(size); };

  function rect(x,y,w,h,fill,radius=0) {
    setFill(fill);
    if (radius>0) doc.roundedRect(x,y,w,h,radius,radius,'F');
    else doc.rect(x,y,w,h,'F');
  }
  function hLine(y, col=C.border) {
    setStroke(col); doc.setLineWidth(0.2);
    doc.line(L, y, R, y);
  }
  function sectionTitle(text, y) {
    setFont('bold', 11); setColor(C.black);
    doc.text(text, L, y);
    hLine(y+2, C.brand);
    return y + 8;
  }

  // ── data ─────────────────────────────────────────────
  const monthly    = currentMonthExpenses();
  const prevM      = prevMonthExpenses();
  const monthlyInc = currentMonthIncome();
  const totalExp   = monthly.reduce((s,e)=>s+e.amount,0);
  const totalInc   = monthlyInc.reduce((s,e)=>s+e.amount,0);
  const prevExp    = prevM.reduce((s,e)=>s+e.amount,0);
  const netBal     = totalInc - totalExp;
  const savRate    = totalInc>0 ? ((netBal/totalInc)*100).toFixed(1) : '—';
  const healthScr  = calcHealthScore(totalExp, Object.values(state.budgets).reduce((s,v)=>s+v,0));
  const now        = new Date();
  const monthLabel = now.toLocaleString('default',{month:'long',year:'numeric'});

  // ── PAGE 1 ────────────────────────────────────────────

  // Header banner
  rect(0, 0, W, 32, C.brand);
  rect(0, 30, W, 4, C.brandDark);
  setFont('bold', 20); setColor(C.white);
  doc.text('FinFlow', L, 13);
  setFont('normal', 9); setColor([199,210,254]);
  doc.text('Financial Report  |  ' + monthLabel, L, 19);
  setFont('normal', 8); setColor([199,210,254]);
  doc.text(`Generated: ${now.toLocaleString()}   |   User: ${state.userName || 'N/A'}`, L, 25);

  // Report ID top-right
  setFont('normal', 7); setColor([199,210,254]);
  doc.text(`Report ID: FF-${Date.now().toString(36).toUpperCase()}`, R, 10, {align:'right'});

  let y = 44;

  // ── Summary cards (2 rows of 3) ─────────────────────
  y = sectionTitle('Financial Overview', y);

  const cards = [
    { label:'Total Expenses', value: pdfMoney(totalExp), color: C.rose,    sub: monthly.length+' transactions' },
    { label:'Total Income',   value: pdfMoney(totalInc), color: C.emerald, sub: monthlyInc.length+' entries' },
    { label:'Net Balance',    value: pdfMoney(netBal),   color: netBal>=0?C.emerald:C.rose, sub: netBal>=0?'Surplus':'Deficit' },
    { label:'Savings Rate',   value: typeof savRate==='string'?savRate:savRate+'%', color: C.teal, sub: 'of income' },
    { label:'Health Score',   value: healthScr>0?String(healthScr)+'/100':'N/A', color: C.brand, sub: healthScr>=80?'Excellent':healthScr>=60?'Good':healthScr>=40?'Fair':'Needs work' },
    { label:'vs Last Month',  value: prevExp>0?(totalExp>prevExp?'+':'-')+Math.abs(Math.round(((totalExp-prevExp)/prevExp)*100))+'%':'N/A', color: prevExp>0&&totalExp>prevExp?C.rose:C.emerald, sub: 'spending change' },
  ];
  const cw = (R-L-10)/3, ch = 18, gap = 5;
  cards.forEach((c,i)=>{
    const cx = L + (i%3)*(cw+gap);
    const cy = y + Math.floor(i/3)*(ch+4);
    rect(cx, cy, cw, ch, C.bg, 2);
    setStroke(C.border); doc.setLineWidth(0.2);
    doc.roundedRect(cx, cy, cw, ch, 2, 2, 'S');
    // left accent bar
    rect(cx, cy, 2.5, ch, c.color, 1);
    setFont('bold', 7); setColor(C.dark);
    doc.text(c.label.toUpperCase(), cx+6, cy+5);
    setFont('bold', 12); setColor(c.color);
    doc.text(c.value, cx+6, cy+12);
    setFont('normal', 7); setColor(C.muted);
    doc.text(c.sub, cx+6, cy+16);
  });
  y += 2*(ch+4) + 8;

  // ── Category Breakdown ───────────────────────────────
  y = sectionTitle('Spending by Category', y);

  const byCat = {};
  monthly.forEach(e=>{ byCat[e.category]=(byCat[e.category]||0)+e.amount; });
  const catEntries = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const catColors  = { Food:C.amber, Transport:C.brand, Shopping:C.violet, Bills:C.amber, Health:C.teal, Other:C.dark };
  const BAR_MAX    = R - L - 70;

  catEntries.forEach(([cat,amt])=>{
    if (y > 260) { doc.addPage(); addPageHeader(doc, W, C, state.userName); y = 24; }
    const pct   = totalExp>0 ? amt/totalExp : 0;
    const barW  = pct * BAR_MAX;
    const budget= state.budgets[cat] || 0;
    const over  = budget>0 && amt>budget;
    const col   = catColors[cat] || C.dark;

    setFont('normal', 8); setColor(C.dark);
    doc.text(cat, L, y+3.5);
    // bar track
    rect(L+28, y, BAR_MAX, 5, C.border, 1);
    // bar fill
    rect(L+28, y, Math.max(barW,1), 5, over?C.rose:col, 1);
    // amount
    setFont('bold', 8); setColor(C.black);
    doc.text(pdfMoney(amt), L+28+BAR_MAX+3, y+4);
    // pct
    setFont('normal', 7); setColor(C.muted);
    doc.text(`(${Math.round(pct*100)}%)`, L+28+BAR_MAX+22, y+4);
    // budget line marker
    if (budget>0) {
      const budgetX = L+28 + Math.min((budget/totalExp)*BAR_MAX, BAR_MAX);
      setStroke(over?C.rose:C.muted); doc.setLineWidth(0.5);
      doc.line(budgetX, y-0.5, budgetX, y+5.5);
    }
    y += 8;
  });

  if (!catEntries.length) { setFont('normal',9); setColor(C.muted); doc.text('No expense data this month.',L,y); y+=8; }
  y += 4;

  // ── PAGE 2: Transactions ─────────────────────────────
  doc.addPage();
  addPageHeader(doc, W, C, state.userName);
  y = 24;

  // ── Expense Table ────────────────────────────────────
  y = sectionTitle('Expense Transactions', y);

  const expSorted = [...state.expenses].sort((a,b)=>new Date(b.date)-new Date(a.date));
  y = drawTransactionTable(doc, expSorted, y, W, L, R, C, 'expense');

  // ── Income Table ─────────────────────────────────────
  if (y > 220) { doc.addPage(); addPageHeader(doc, W, C, state.userName); y = 24; }
  else y += 8;

  y = sectionTitle('Income Records', y);
  const incSorted = [...state.income].sort((a,b)=>new Date(b.date)-new Date(a.date));
  y = drawTransactionTable(doc, incSorted, y, W, L, R, C, 'income');

  // ── Budget Summary ───────────────────────────────────
  if (y > 210) { doc.addPage(); addPageHeader(doc, W, C, state.userName); y = 24; }
  else y += 8;
  y = sectionTitle('Budget vs Actual', y);
  y = drawBudgetTable(doc, monthly, y, W, L, R, C);

  // ── Footer on all pages ──────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i=1; i<=totalPages; i++) {
    doc.setPage(i);
    rect(0, 287, W, 10, C.brand);
    setFont('normal', 7); setColor(C.white);
    doc.text('FinFlow — Enterprise Finance Platform', L, 293);
    doc.text(`Page ${i} of ${totalPages}`, R, 293, {align:'right'});
  }

  doc.save(`FinFlow-Report-${todayStr()}.pdf`);
  toast('PDF report downloaded!');
}

/* helper: mini header for continuation pages */
function addPageHeader(doc, W, C, userName) {
  doc.setFillColor(...C.brand);
  doc.rect(0, 0, W, 16, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(...C.white);
  doc.text('FinFlow — Financial Report', 14, 10);
  doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(199,210,254);
  doc.text(`User: ${userName || 'N/A'}  |  ${new Date().toLocaleDateString()}`, W-14, 10, {align:'right'});
}

/* helper: draw a styled transaction table */
function drawTransactionTable(doc, list, startY, W, L, R, C, type) {
  let y = startY;
  const ROW_H = 7;
  const cols  = { date:L, name:L+26, cat:L+100, note:L+132, amt:R };

  // Table header
  doc.setFillColor(...C.brand);
  doc.rect(L, y, R-L, ROW_H, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(...C.white);
  doc.text('DATE',       cols.date+2, y+4.5);
  doc.text('DESCRIPTION',cols.name,   y+4.5);
  doc.text('CATEGORY',   cols.cat,    y+4.5);
  doc.text('NOTE',       cols.note,   y+4.5);
  doc.text('AMOUNT',     cols.amt,    y+4.5, {align:'right'});
  y += ROW_H;

  if (!list.length) {
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...C.muted);
    doc.text('No records found.', L+2, y+5);
    return y + 10;
  }

  // Rows
  list.forEach((e,i) => {
    if (y > 270) {
      doc.addPage();
      addPageHeader(doc, W, C, '');
      y = 24;
      // re-draw header
      doc.setFillColor(...C.brand);
      doc.rect(L, y, R-L, ROW_H, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(...C.white);
      doc.text('DATE', cols.date+2, y+4.5);
      doc.text('DESCRIPTION', cols.name, y+4.5);
      doc.text('CATEGORY', cols.cat, y+4.5);
      doc.text('NOTE', cols.note, y+4.5);
      doc.text('AMOUNT', cols.amt, y+4.5, {align:'right'});
      y += ROW_H;
    }

    const isAlt = i%2===1;
    doc.setFillColor(...(isAlt ? C.rowAlt : C.white));
    doc.rect(L, y, R-L, ROW_H, 'F');

    // border line
    doc.setDrawColor(...C.border); doc.setLineWidth(0.1);
    doc.line(L, y+ROW_H, R, y+ROW_H);

    doc.setFont('helvetica','normal'); doc.setFontSize(7.5);

    // Date
    doc.setTextColor(...C.dark);
    doc.text(formatDate(e.date)||'—', cols.date+2, y+4.5);

    // Name
    doc.setTextColor(...C.black);
    doc.setFont('helvetica','bold');
    const nameStr = (e.name||'').slice(0,30);
    doc.text(nameStr, cols.name, y+4.5);

    // Category badge background
    const catColMap = {Food:[249,115,22],Transport:[79,70,229],Shopping:[139,92,246],Bills:[217,119,6],Health:[20,184,166],Other:[100,116,139],Income:[5,150,105]};
    const catCol = catColMap[e.category] || catColMap.Other;
    doc.setFillColor(catCol[0],catCol[1],catCol[2],0.15);
    doc.roundedRect(cols.cat-1, y+0.8, 26, 5, 1,1,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(...catCol);
    doc.text((e.category||'Other').toUpperCase(), cols.cat+12, y+4.2, {align:'center'});

    // Note
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...C.muted);
    doc.text((e.note||'').slice(0,20), cols.note, y+4.5);

    // Amount
    const amtColor = type==='income' ? C.emerald : C.rose;
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...amtColor);
    doc.text((type==='income'?'+ ':'')+pdfMoney(e.amount), cols.amt, y+4.5, {align:'right'});

    y += ROW_H;
  });

  // Totals row
  const total = list.reduce((s,e)=>s+e.amount,0);
  doc.setFillColor(...(type==='income'?C.emerald:C.brand));
  doc.rect(L, y, R-L, ROW_H+1, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...C.white);
  doc.text(`Total ${type==='income'?'Income':'Expenses'} (${list.length} records)`, L+2, y+5.5);
  doc.text(pdfMoney(total), R, y+5.5, {align:'right'});
  y += ROW_H + 1;

  return y;
}

/* helper: budget vs actual table */
function drawBudgetTable(doc, monthly, startY, W, L, R, C) {
  let y = startY;
  const ROW_H = 7;

  // header
  doc.setFillColor(...C.teal);
  doc.rect(L, y, R-L, ROW_H, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(...C.white);
  doc.text('CATEGORY', L+2,    y+4.5);
  doc.text('BUDGET',   L+60,   y+4.5);
  doc.text('SPENT',    L+90,   y+4.5);
  doc.text('REMAINING',L+120,  y+4.5);
  doc.text('USAGE %',  R,      y+4.5, {align:'right'});
  y += ROW_H;

  const CATEGORIES_ALL = ['Food','Transport','Shopping','Bills','Health','Other'];
  CATEGORIES_ALL.forEach((cat,i)=>{
    const budget = state.budgets[cat]||0;
    const spent  = monthly.filter(e=>e.category===cat).reduce((s,e)=>s+e.amount,0);
    const rem    = budget - spent;
    const pct    = budget>0 ? Math.round((spent/budget)*100) : 0;
    const over   = budget>0 && spent>budget;

    doc.setFillColor(...(i%2===0?C.white:C.rowAlt));
    doc.rect(L, y, R-L, ROW_H, 'F');
    doc.setDrawColor(...C.border); doc.setLineWidth(0.1);
    doc.line(L, y+ROW_H, R, y+ROW_H);

    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...C.black);
    doc.text(cat, L+2, y+4.5);

    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...C.dark);
    doc.text(budget>0?pdfMoney(budget):'—', L+60, y+4.5);
    doc.text(pdfMoney(spent), L+90, y+4.5);

    doc.setTextColor(...(over?C.rose:rem>=0?C.emerald:C.dark));
    doc.setFont('helvetica','bold');
    doc.text(budget>0?pdfMoney(Math.abs(rem)):'—', L+120, y+4.5);

    // usage bar
    if (budget>0) {
      const barMax=28, barW=Math.min((spent/budget)*barMax,barMax);
      doc.setFillColor(...C.border); doc.rect(R-32,y+1.5,barMax,3.5,'F');
      doc.setFillColor(...(over?C.rose:pct>=85?C.amber:C.emerald));
      doc.rect(R-32,y+1.5,barW,3.5,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...(over?C.rose:C.dark));
      doc.text(pct+'%', R, y+4.5, {align:'right'});
    } else {
      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...C.muted);
      doc.text('No budget', R, y+4.5, {align:'right'});
    }
    y += ROW_H;
  });

  // totals
  const totalBudget = Object.values(state.budgets).reduce((s,v)=>s+v,0);
  const totalSpent  = monthly.reduce((s,e)=>s+e.amount,0);
  doc.setFillColor(...C.brand);
  doc.rect(L, y, R-L, ROW_H+1, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...C.white);
  doc.text('TOTAL', L+2, y+5.5);
  doc.text(pdfMoney(totalBudget), L+60, y+5.5);
  doc.text(pdfMoney(totalSpent),  L+90, y+5.5);
  doc.text(pdfMoney(totalBudget-totalSpent), L+120, y+5.5);
  doc.text(totalBudget>0?Math.round((totalSpent/totalBudget)*100)+'%':'—', R, y+5.5, {align:'right'});
  y += ROW_H+1;

  return y;
}

/* ── CSV IMPORT ──────────────────────────────────────── */
function handleCSVImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const lines = e.target.result.split('\n').filter(l=>l.trim());
    if (!lines.length) return toast('Empty CSV file','error');
    let imported = 0;
    // Skip header row if present
    const start = isNaN(parseFloat(lines[0].split(',')[1])) ? 1 : 0;
    for (let i=start;i<lines.length;i++) {
      const cols = lines[i].split(',').map(c=>c.trim().replace(/^"|"$/g,''));
      if (cols.length < 3) continue;
      const name   = cols[0]||'Imported';
      const amount = parseFloat(cols[1]);
      const date   = cols[2];
      const category = CATEGORIES.includes(cols[3])?cols[3]:'Other';
      const note   = cols[4]||'';
      if (!amount||!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      state.expenses.push({ id:uid(), name, amount, date, category, note, tags:[], recurring:'', type:'expense', createdAt:Date.now() });
      imported++;
    }
    if (imported===0) return toast('No valid rows found. Format: Name,Amount,YYYY-MM-DD,Category,Note','error');
    saveExpenses();
    refreshAll();
    toast(`Imported ${imported} expense(s)!`);
  };
  reader.readAsText(file);
}

/* ── REFRESH ALL ─────────────────────────────────────── */
function refreshAll() {
  const active = document.querySelector('.page.active');
  const id     = active ? active.id.replace('page-','') : 'dashboard';
  if (id==='dashboard') refreshDashboard();
  if (id==='expenses')  renderExpenseList();
  if (id==='budget')    renderBudget();
  if (id==='analytics') renderAnalytics();
  if (id==='income')    renderIncomePage();
  if (id==='recurring') renderRecurringPage();
  if (id==='report')    renderReportPage();
  updateStatCards();
  checkBudgetAlerts();
}

/* ── KEYBOARD SHORTCUTS ──────────────────────────────── */
function bindKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    // Don't fire if typing in an input
    const tag = document.activeElement.tagName;
    if (tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') {
      if (e.key==='Escape') { document.activeElement.blur(); closeAllModals(); }
      return;
    }
    if (e.ctrlKey||e.metaKey||e.altKey) return;
    switch(e.key) {
      case 'n': case 'N': openAddModal(); break;
      case 't': case 'T': {
        const isDark = document.documentElement.getAttribute('data-theme')==='dark';
        applyTheme(!isDark); break;
      }
      case '/': {
        e.preventDefault();
        navigateTo('expenses');
        setTimeout(()=>{ const si=$('#search-input'); if(si){si.focus();si.select();} },100);
        break;
      }
      case '?': openModal('#shortcuts-modal'); break;
      case 'Escape': closeAllModals(); break;
      case '1': navigateTo('dashboard'); break;
      case '2': navigateTo('expenses');  break;
      case '3': navigateTo('income');    break;
      case '4': navigateTo('budget');    break;
      case '5': navigateTo('analytics'); break;
      case '6': navigateTo('recurring'); break;
      case '7': navigateTo('report');    break;
    }
  });
}

function closeAllModals() {
  ['#expense-modal','#delete-modal','#shortcuts-modal','#ocr-modal','#voice-modal'].forEach(id=>closeModal(id));
}

/* ── BIND ALL EVENTS ─────────────────────────────────── */
function bindEvents() {
  $('#onboarding-submit').addEventListener('click',()=>{
    const name=$('#onboarding-name').value.trim();
    if (!name) return;
    applyUserName(name); refreshDashboard();
  });
  $('#onboarding-name').addEventListener('keydown',e=>{ if(e.key==='Enter') $('#onboarding-submit').click(); });

  /* Nav items */
  $$('.nav-item').forEach(el=>el.addEventListener('click',e=>{ e.preventDefault(); navigateTo(el.dataset.section); }));

  /* Data-nav links (View all, etc.) */
  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-nav]');
    if (btn){ e.preventDefault(); navigateTo(btn.dataset.nav); }
  });

  /* Hamburger / sidebar */
  $('#hamburger').addEventListener('click', openSidebar);
  $('#sidebar-close').addEventListener('click', closeSidebar);
  $('#sidebar-overlay').addEventListener('click', closeSidebar);

  /* Theme */
  const savedTheme = store.get(STORAGE_KEYS.THEME,'light');
  applyTheme(savedTheme==='dark');
  $('#dark-mode-toggle').addEventListener('click',()=>{
    applyTheme(document.documentElement.getAttribute('data-theme')!=='dark');
  });

  /* Accent swatches */
  applyAccent(state.accent);
  $$('.accent-swatch').forEach(s=>s.addEventListener('click',()=>applyAccent(s.dataset.accent)));

  /* Currency selector */
  $('#currency-select').value = state.currency;
  $('#currency-select').addEventListener('change',e=>applyCurrency(e.target.value));

  /* Open add modal buttons */
  $('#open-add-modal').addEventListener('click',()=>openAddModal());
  const expAddBtn=$('#open-add-modal-expenses');
  if (expAddBtn) expAddBtn.addEventListener('click',()=>openAddModal());
  const incAddBtn=$('#open-add-income-btn');
  if (incAddBtn) incAddBtn.addEventListener('click',()=>openAddModal('income'));

  /* Modal close buttons */
  $('#close-modal').addEventListener('click',()=>closeModal('#expense-modal'));
  $('#modal-cancel').addEventListener('click',()=>closeModal('#expense-modal'));
  $('#close-delete-modal').addEventListener('click',()=>closeModal('#delete-modal'));
  $('#cancel-delete').addEventListener('click',()=>closeModal('#delete-modal'));
  $('#close-shortcuts-modal').addEventListener('click',()=>closeModal('#shortcuts-modal'));

  /* Close modal on backdrop click */
  ['#expense-modal','#delete-modal','#shortcuts-modal'].forEach(id=>{
    $(id).addEventListener('click',e=>{ if(e.target===e.currentTarget) closeModal(id); });
  });

  /* Type toggle */
  $$('.type-btn').forEach(btn=>btn.addEventListener('click',()=>setTypeToggle(btn.dataset.type)));

  /* Category picker */
  $$('.cat-btn').forEach(btn=>btn.addEventListener('click',()=>selectCategory(btn.dataset.cat)));

  /* Smart category suggestion */
  $('#expense-name').addEventListener('input',e=>{
    const val=e.target.value;
    const sug=suggestCategory(val);
    const chip=$('#suggestion-chip');
    if (sug&&!$('#expense-category').value&&$('#expense-type').value==='expense') {
      chip.textContent=`💡 Suggest: ${sug} — tap to apply`;
      chip.classList.remove('hidden');
      chip.onclick=()=>{ selectCategory(sug); chip.classList.add('hidden'); };
    } else { chip.classList.add('hidden'); }
  });

  /* Amount formatter */
  $('#expense-amount').addEventListener('input',e=>{
    const val=parseFloat(e.target.value);
    const el=$('#amount-formatted');
    if (val&&val>0) el.textContent=formatMoney(val);
    else el.textContent='';
  });

  /* Save / confirm */
  $('#modal-submit').addEventListener('click', saveTransaction);
  $('#confirm-delete').addEventListener('click', confirmDelete);

  /* Expense filters */
  $('#search-input').addEventListener('input', renderExpenseList);
  $('#filter-category').addEventListener('change', renderExpenseList);
  $('#filter-type').addEventListener('change', renderExpenseList);
  $('#sort-select').addEventListener('change', renderExpenseList);

  /* Group by date toggle */
  const groupBtn=$('#group-by-date-btn');
  if (groupBtn) groupBtn.addEventListener('click',()=>{
    state.groupByDate=!state.groupByDate;
    groupBtn.style.background = state.groupByDate?'var(--brand-500)':'';
    groupBtn.style.color      = state.groupByDate?'#fff':'';
    renderExpenseList();
  });

  /* Select all checkbox */
  const selectAllCb=$('#select-all-cb');
  if (selectAllCb) selectAllCb.addEventListener('change',()=>{
    const all=[...state.expenses,...state.income].map(e=>e.id);
    if (selectAllCb.checked) all.forEach(id=>state.selectedIds.add(id));
    else state.selectedIds.clear();
    updateBulkUI();
    renderExpenseList();
  });

  /* Bulk delete */
  const bulkBtn=$('#bulk-delete-btn');
  if (bulkBtn) bulkBtn.addEventListener('click',bulkDeleteSelected);

  /* Trend chart tabs */
  $$('.chart-tab').forEach(tab=>tab.addEventListener('click',()=>{
    $$('.chart-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    state.trendRange=parseInt(tab.dataset.range);
    renderTrendChart(state.trendRange);
  }));

  /* Export */
  $('#export-btn').addEventListener('click', exportData);
  $('#export-pdf-btn').addEventListener('click', exportToPDF);

  /* CSV Import */
  $('#import-csv-btn').addEventListener('click',()=>$('#csv-file-input').click());
  $('#csv-file-input').addEventListener('change',e=>{ handleCSVImport(e.target.files[0]); e.target.value=''; });

  /* Savings goal */
  const goalSaveBtn=$('#savings-goal-save');
  if (goalSaveBtn) goalSaveBtn.addEventListener('click',()=>{
    const val=parseFloat($('#savings-goal-input').value)||0;
    state.savingsGoal=val;
    store.set(STORAGE_KEYS.SAVINGS_GOAL, val);
    toast(`Savings goal set to ${formatMoney(val)}!`);
    updateStatCards();
    updateMonthlySummary();
    sbSyncProfile({ savings_goal: val });
  });
  const goalInput=$('#savings-goal-input');
  if (goalInput) goalInput.addEventListener('keydown',e=>{ if(e.key==='Enter') goalSaveBtn.click(); });

  /* Undo delete */
  const undoBtn=$('#undo-delete-btn');
  if (undoBtn) undoBtn.addEventListener('click', undoDelete);

  /* Keyboard shortcuts */
  bindKeyboardShortcuts();

  /* Budget alert dismiss */
  const alertDismiss=$('#budget-alert-dismiss');
  if(alertDismiss) alertDismiss.addEventListener('click',()=>$('#budget-alert-banner').classList.add('hidden'));

  /* CSV Export */
  const csvExportBtn=$('#export-csv-btn');
  if(csvExportBtn) csvExportBtn.addEventListener('click',exportCSV);

  /* OCR */
  $('#ocr-btn').addEventListener('click',()=>{ resetOCRModal(); openModal('#ocr-modal'); });
  $('#close-ocr-modal').addEventListener('click',()=>closeModal('#ocr-modal'));
  $('#ocr-cancel').addEventListener('click',()=>closeModal('#ocr-modal'));
  $('#ocr-modal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeModal('#ocr-modal'); });
  initOCR();

  /* Voice */
  $('#voice-btn').addEventListener('click',()=>openModal('#voice-modal'));
  $('#close-voice-modal').addEventListener('click',()=>closeModal('#voice-modal'));
  $('#voice-cancel').addEventListener('click',()=>closeModal('#voice-modal'));
  $('#voice-modal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeModal('#voice-modal'); });
  initVoice();
}

/* ── INIT ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  bindEvents();
  $('#topbar-greeting-text').textContent = getGreeting();
  initUser();
  if (state.userName) { refreshDashboard(); checkBudgetAlerts(); }
});

/* ── BUDGET ALERTS ───────────────────────────────────── */
function checkBudgetAlerts() {
  const monthly = currentMonthExpenses();
  const alerts  = [];
  CATEGORIES.forEach(cat => {
    const budget = state.budgets[cat] || 0;
    const spent  = monthly.filter(e=>e.category===cat).reduce((s,e)=>s+e.amount,0);
    if (budget > 0) {
      const pct = (spent / budget) * 100;
      if (spent >= budget)  alerts.push({ cat, pct, type:'exceeded' });
      else if (pct >= 85)   alerts.push({ cat, pct, type:'warning' });
    }
  });
  const banner = $('#budget-alert-banner');
  if (!alerts.length) { banner.classList.add('hidden'); return; }
  const exceeded = alerts.filter(a=>a.type==='exceeded');
  let msg = exceeded.length
    ? `🔴 Budget exceeded: ${exceeded.map(a=>a.cat).join(', ')}`
    : `⚠️ Near budget limit: ${alerts.map(a=>a.cat+' ('+Math.round(a.pct)+'%)').join(', ')}`;
  $('#budget-alert-text').textContent = msg;
  banner.className = 'budget-alert-banner' + (exceeded.length ? '' : ' warning-level');
}

/* ── CSV EXPORT ──────────────────────────────────────── */
function exportCSV() {
  const all = [
    ...state.expenses.map(e=>({...e,type:'expense'})),
    ...state.income.map(e=>({...e,type:'income'})),
  ].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const header = 'Name,Amount,Date,Category,Type,Note,Tags,Recurring\n';
  const rows = all.map(e =>
    [e.name, e.amount, e.date, e.category||'', e.type, e.note||'', (e.tags||[]).join(';'), e.recurring||'']
    .map(v=>`"${String(v).replace(/"/g,'""')}"`)
    .join(',')
  ).join('\n');
  const blob = new Blob([header+rows],{type:'text/csv'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=`finflow-${todayStr()}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast('CSV exported!');
}

/* ── RECURRING DETECTION ─────────────────────────────── */
function detectRecurring() {
  const nameGroups = {};
  state.expenses.forEach(e => {
    const key = e.name.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,12);
    if (!nameGroups[key]) nameGroups[key] = [];
    nameGroups[key].push(e);
  });
  const detected = [];
  Object.values(nameGroups).forEach(group => {
    if (group.length < 2) return;
    group.sort((a,b)=>new Date(a.date)-new Date(b.date));
    const avgAmt = group.reduce((s,e)=>s+e.amount,0)/group.length;
    const consistent = group.every(e=>Math.abs(e.amount-avgAmt)/avgAmt<0.25);
    if (!consistent && group.length<3) return;
    const gaps=[];
    for(let i=1;i<group.length;i++) gaps.push((new Date(group[i].date)-new Date(group[i-1].date))/86400000);
    const avgGap=gaps.reduce((s,g)=>s+g,0)/gaps.length;
    let freq=null;
    if(avgGap>=25&&avgGap<=35) freq='monthly';
    else if(avgGap>=6&&avgGap<=8) freq='weekly';
    else if(avgGap>=1&&avgGap<=2) freq='daily';
    else if(avgGap>=88&&avgGap<=95) freq='quarterly';
    if(freq) detected.push({ name:group[0].name, amount:avgAmt, category:group[0].category,
      count:group.length, freq, lastDate:group[group.length-1].date, ids:group.map(e=>e.id) });
  });
  state.expenses.filter(e=>e.recurring).forEach(e=>{
    if(!detected.find(d=>d.ids&&d.ids.includes(e.id)))
      detected.push({name:e.name,amount:e.amount,category:e.category,count:1,freq:e.recurring,lastDate:e.date,ids:[e.id],manual:true});
  });
  return detected;
}

function renderRecurringPage() {
  const detected = detectRecurring();
  const totalMonthly = detected.filter(d=>d.freq==='monthly').reduce((s,d)=>s+d.amount,0);
  const statsEl = $('#recurring-stats');
  if(statsEl) statsEl.innerHTML=`
    <div class="recurring-stat-card"><div class="recurring-stat-label">Recurring Detected</div><div class="recurring-stat-value">${detected.length}</div><div class="recurring-stat-sub">patterns found</div></div>
    <div class="recurring-stat-card"><div class="recurring-stat-label">Monthly Committed</div><div class="recurring-stat-value">${formatMoney(totalMonthly)}</div><div class="recurring-stat-sub">auto-recurring</div></div>
    <div class="recurring-stat-card"><div class="recurring-stat-label">Annual Committed</div><div class="recurring-stat-value">${formatMoney(totalMonthly*12)}</div><div class="recurring-stat-sub">projected</div></div>`;
  const badge=$('#recurring-count-badge'); if(badge) badge.textContent=detected.length+' found';
  const runBtn=$('#run-detection-btn'); if(runBtn) runBtn.onclick=()=>{renderRecurringPage();toast(`Found ${detected.length} recurring pattern(s)`);};
  const container=$('#recurring-list'); if(!container) return;
  if(!detected.length){container.innerHTML=`<div class="empty-state"><div class="empty-icon">🔄</div><p>No recurring patterns detected</p><small>Add more expenses or mark them as recurring</small></div>`;return;}
  container.innerHTML=detected.map(d=>`
    <div class="recurring-item">
      <div class="expense-cat-icon icon-${d.category}">${CAT_ICONS[d.category]||'📦'}</div>
      <div class="recurring-info">
        <div class="recurring-name">${escapeHTML(d.name)}</div>
        <div class="recurring-meta">${d.count} occurrence(s) · last: ${formatDate(d.lastDate)}${d.manual?' · marked manually':''}</div>
      </div>
      <span class="recurring-freq">🔁 ${d.freq}</span>
      <div class="expense-amount">${formatMoney(d.amount)}</div>
    </div>`).join('');
}

/* ── AI REPORT ───────────────────────────────────────── */
function generateFinancialReport() {
  const monthly=currentMonthExpenses(), prevMonthly=prevMonthExpenses(), monthlyInc=currentMonthIncome();
  const totalExp=monthly.reduce((s,e)=>s+e.amount,0), totalInc=monthlyInc.reduce((s,e)=>s+e.amount,0);
  const prevExp=prevMonthly.reduce((s,e)=>s+e.amount,0), netBalance=totalInc-totalExp;
  const savingsRate=totalInc>0?((netBalance/totalInc)*100):0;
  const totalBudget=Object.values(state.budgets).reduce((s,v)=>s+v,0);
  const byCat={};CATEGORIES.forEach(c=>{byCat[c]=0;});monthly.forEach(e=>{byCat[e.category]=(byCat[e.category]||0)+e.amount;});
  const sortedCats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]).filter(([,v])=>v>0);
  const healthScore=calcHealthScore(totalExp,totalBudget);
  let grade='A',gradeClass='grade-A',gradeReason='Excellent budget discipline';
  if(healthScore>=80){grade='A';gradeClass='grade-A';gradeReason='Excellent budget discipline';}
  else if(healthScore>=60){grade='B';gradeClass='grade-B';gradeReason='Good spending control';}
  else if(healthScore>=40){grade='C';gradeClass='grade-C';gradeReason='Moderate overspending';}
  else{grade='D';gradeClass='grade-D';gradeReason='Significant budget overrun';}
  if(savingsRate<0){grade='D';gradeClass='grade-D';gradeReason='Spending exceeds income';}
  const recs=generateRecommendations(byCat,totalExp,totalInc,prevExp,savingsRate);
  const momChange=prevExp>0?((totalExp-prevExp)/prevExp*100).toFixed(1):null;
  const momLabel=momChange!==null?(momChange>=0?`↑ ${momChange}% vs last month`:`↓ ${Math.abs(momChange)}% vs last month`):'No previous data';
  const momColor=momChange>0?'var(--rose-500)':'var(--emerald-500)';
  const now=new Date();
  const container=$('#report-container'); if(!container) return;
  container.innerHTML=`
    <div class="report-card">
      <div class="report-card-title">📊 Monthly Financial Report — ${now.toLocaleString('default',{month:'long'})} ${now.getFullYear()}</div>
      <div class="report-section"><h4>Financial Grade</h4>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div class="report-grade ${gradeClass}">Grade ${grade}</div>
          <div><div style="font-size:.875rem;font-weight:600;color:var(--text)">${gradeReason}</div>
          <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px">Health Score: ${healthScore||'N/A'} / 100</div></div>
        </div>
      </div>
      <div class="report-section"><h4>Summary</h4>
        <div class="report-summary-grid">
          <div class="report-summary-item"><div class="rsv">${formatMoney(totalExp)}</div><div class="rsl">Total Spent</div></div>
          <div class="report-summary-item"><div class="rsv">${formatMoney(totalInc)}</div><div class="rsl">Total Income</div></div>
          <div class="report-summary-item"><div class="rsv" style="color:${netBalance>=0?'var(--emerald-500)':'var(--rose-500)'}">${formatMoney(netBalance)}</div><div class="rsl">Net Balance</div></div>
          <div class="report-summary-item"><div class="rsv">${savingsRate.toFixed(1)}%</div><div class="rsl">Savings Rate</div></div>
          <div class="report-summary-item"><div class="rsv" style="color:${momColor};font-size:.85rem">${momLabel}</div><div class="rsl">Month-over-Month</div></div>
          <div class="report-summary-item"><div class="rsv">${monthly.length}</div><div class="rsl">Transactions</div></div>
        </div>
      </div>
      <div class="report-section"><h4>Spending by Category</h4>
        ${sortedCats.map(([cat,amt])=>{
          const pct=totalExp>0?Math.round((amt/totalExp)*100):0;
          return `<div class="report-bar-row">
            <span class="report-bar-label">${CAT_ICONS[cat]||''} ${cat}</span>
            <div class="report-bar-track"><div class="report-bar-fill" style="width:${pct}%;background:${CAT_COLORS[cat]||'#64748b'}"></div></div>
            <span class="report-bar-val">${formatMoney(amt)} <span style="color:var(--text-muted);font-weight:400">(${pct}%)</span></span>
          </div>`;}).join('')||'<p style="color:var(--text-muted);font-size:.825rem">No expenses this month</p>'}
      </div>
      <div class="report-section"><h4>💡 AI Recommendations</h4>
        ${recs.map(r=>`<div class="recommendation-item">
          <div class="rec-icon ${r.level==='high'?'rec-high':r.level==='medium'?'rec-medium':'rec-low'}">${r.icon}</div>
          <div class="rec-text"><strong>${r.title}</strong>${r.body}</div>
        </div>`).join('')}
      </div>
      <div class="report-generated-at">Generated by FinFlow AI · ${new Date().toLocaleString()}</div>
    </div>`;
}

function generateRecommendations(byCat,totalExp,totalInc,prevExp,savingsRate) {
  const recs=[];
  if(totalInc>0){
    if(savingsRate<0) recs.push({icon:'🚨',title:'Spending Exceeds Income',body:` You spent ${formatMoney(Math.abs(totalInc-(totalExp)))} more than you earned. Review non-essentials immediately.`,level:'high'});
    else if(savingsRate<10) recs.push({icon:'⚠️',title:'Low Savings Rate',body:` Only ${savingsRate.toFixed(1)}% saved. Target at least 20% for financial health.`,level:'high'});
    else if(savingsRate<20) recs.push({icon:'📈',title:'Improve Your Savings',body:` ${savingsRate.toFixed(1)}% is okay — try reaching 20-30% for long-term security.`,level:'medium'});
    else recs.push({icon:'✅',title:'Great Savings Rate',body:` Excellent ${savingsRate.toFixed(1)}%! Consider investing the surplus.`,level:'low'});
  }
  if(byCat.Food&&totalExp>0&&(byCat.Food/totalExp)>0.35) recs.push({icon:'🍔',title:'High Food Spending',body:` Food is ${((byCat.Food/totalExp)*100).toFixed(0)}% of expenses. Meal prepping can cut this by 20-30%.`,level:'medium'});
  if(byCat.Shopping&&totalExp>0&&(byCat.Shopping/totalExp)>0.3) recs.push({icon:'🛍',title:'Shopping Overspend',body:` Shopping is ${((byCat.Shopping/totalExp)*100).toFixed(0)}% of your budget. Try the 24-hour rule before purchases.`,level:'medium'});
  if(prevExp>0&&totalExp>prevExp*1.3) recs.push({icon:'📊',title:'Spending Spike Detected',body:` This month is ${Math.round(((totalExp-prevExp)/prevExp)*100)}% higher than last month. Review what changed.`,level:'high'});
  CATEGORIES.forEach(cat=>{
    const budget=state.budgets[cat]||0;
    if(budget>0&&byCat[cat]>budget) recs.push({icon:'🔴',title:`${cat} Budget Exceeded`,body:` Over budget by ${formatMoney(byCat[cat]-budget)}. Adjust budget or reduce ${cat} spending.`,level:'high'});
  });
  const recurring=state.expenses.filter(e=>e.recurring==='monthly');
  if(recurring.length) recs.push({icon:'🔄',title:`${recurring.length} Monthly Subscriptions`,body:` Total recurring: ${formatMoney(recurring.reduce((s,e)=>s+e.amount,0))}/month. Review if all are needed.`,level:'low'});
  if(!recs.length) recs.push({icon:'🎉',title:'Finances Looking Great!',body:' No major issues detected. Consider increasing investments.',level:'low'});
  return recs.slice(0,6);
}

function renderReportPage() {
  const btn1=$('#generate-report-btn'), btn2=$('#generate-report-btn-2');
  if(btn1) btn1.onclick=()=>{generateFinancialReport();toast('Report generated!');};
  if(btn2) btn2.onclick=()=>{generateFinancialReport();toast('Report generated!');};
}

/* ── OCR RECEIPT SCANNER ─────────────────────────────── */
function resetOCRModal() {
  const ids=['#ocr-drop-zone','#ocr-progress','#ocr-results'];
  ids.forEach(id=>{ const el=$(id); if(el){ el.classList.remove('hidden'); if(id!=='#ocr-drop-zone') el.classList.add('hidden'); }});
  const preview=$('#ocr-preview'); if(preview) preview.classList.add('hidden');
  const addBtn=$('#ocr-add-btn'); if(addBtn) addBtn.classList.add('hidden');
  const fill=$('#ocr-progress-fill'); if(fill) fill.style.width='0%';
  const fi=$('#ocr-file-input'); if(fi) fi.value='';
}
function initOCR() {
  const browseBtn=$('#ocr-browse-btn'),dropZone=$('#ocr-drop-zone'),fileInput=$('#ocr-file-input');
  const progress=$('#ocr-progress'),progressFill=$('#ocr-progress-fill'),statusText=$('#ocr-status-text');
  const preview=$('#ocr-preview'),previewImg=$('#ocr-img'),results=$('#ocr-results');
  const addBtn=$('#ocr-add-btn'),rawText=$('#ocr-raw-text');
  if(!browseBtn) return;
  browseBtn.addEventListener('click',()=>fileInput.click());
  dropZone.addEventListener('dragover',e=>{e.preventDefault();dropZone.classList.add('dragover');});
  dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop',e=>{e.preventDefault();dropZone.classList.remove('dragover');processOCRFile(e.dataTransfer.files[0]);});
  fileInput.addEventListener('change',e=>processOCRFile(e.target.files[0]));
  addBtn.addEventListener('click',()=>{
    const name=$('#ocr-name').value.trim()||'Receipt';
    const amount=parseFloat($('#ocr-amount').value);
    const date=$('#ocr-date').value||todayStr();
    if(!amount||amount<=0) return toast('Please enter a valid amount','error');
    const cat=suggestCategory(name)||'Other';
    state.expenses.push({id:uid(),name,amount,date,category:cat,note:'Scanned receipt',tags:['receipt'],recurring:'',type:'expense',createdAt:Date.now()});
    saveExpenses(); closeModal('#ocr-modal'); refreshAll(); toast('Receipt expense added!');
  });
  async function processOCRFile(file) {
    if(!file) return;
    if(!file.type.startsWith('image/')) return toast('Please upload an image','error');
    previewImg.src=URL.createObjectURL(file);
    preview.classList.remove('hidden'); dropZone.classList.add('hidden');
    progress.classList.remove('hidden'); results.classList.add('hidden'); addBtn.classList.add('hidden');
    try {
      const result = await Tesseract.recognize(file,'eng',{
        logger:m=>{ if(m.status==='recognizing text'){const p=Math.round(m.progress*100);progressFill.style.width=p+'%';statusText.textContent=`Recognizing... ${p}%`;}}
      });
      progress.classList.add('hidden');
      const text=result.data.text;
      rawText.textContent=text.slice(0,300);
      const amtMatches=text.match(/\d{1,6}(?:[.,]\d{2})?/g)||[];
      let bestAmt=0;
      amtMatches.forEach(m=>{const n=parseFloat(m.replace(',','.'));if(n>bestAmt&&n<1000000)bestAmt=n;});
      const dateMatch=text.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/);
      let parsedDate=todayStr();
      if(dateMatch){const pts=dateMatch[0].split(/[\/\-]/);if(pts.length===3){const y=pts[2].length===2?'20'+pts[2]:pts[2];parsedDate=`${y}-${pts[1].padStart(2,'0')}-${pts[0].padStart(2,'0')}`;}}
      const lines=text.split('\n').map(l=>l.trim()).filter(l=>l.length>2&&isNaN(parseFloat(l)));
      $('#ocr-name').value=lines[0]?.slice(0,40)||'Receipt';
      $('#ocr-amount').value=bestAmt||'';
      $('#ocr-date').value=parsedDate;
      results.classList.remove('hidden'); addBtn.classList.remove('hidden');
    } catch(err) { progress.classList.add('hidden'); toast('OCR failed. Try a clearer image.','error'); }
  }
}

/* ── VOICE ENTRY ─────────────────────────────────────── */
let voiceParsedData={};
function initVoice() {
  const orb=$('#voice-orb'),status=$('#voice-status'),transcript=$('#voice-transcript');
  const parsed=$('#voice-parsed'),addBtn=$('#voice-add-btn');
  if(!orb) return;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){if(status)status.textContent='❌ Voice not supported. Try Chrome.';return;}
  const recognition=new SR();
  recognition.continuous=false; recognition.interimResults=true; recognition.lang='en-IN';
  orb.addEventListener('click',()=>{
    if(orb.classList.contains('listening')){recognition.stop();}
    else{transcript.textContent='';parsed.classList.add('hidden');addBtn.classList.add('hidden');voiceParsedData={};recognition.start();}
  });
  recognition.onstart=()=>{orb.classList.add('listening');orb.textContent='⏹';status.textContent='🎤 Listening...';};
  recognition.onresult=e=>{
    const t=Array.from(e.results).map(r=>r[0].transcript).join('');
    transcript.textContent=`"${t}"`;
    if(e.results[e.results.length-1].isFinal) parseVoiceInput(t,parsed,addBtn);
  };
  recognition.onend=()=>{orb.classList.remove('listening');orb.textContent='🎤';status.textContent='Tap to record again';};
  recognition.onerror=e=>{orb.classList.remove('listening');orb.textContent='🎤';status.textContent='❌ '+(e.error==='not-allowed'?'Mic denied':e.error);};
  addBtn.addEventListener('click',()=>{
    if(!voiceParsedData.amount) return toast('Could not detect amount','error');
    state.expenses.push({id:uid(),name:voiceParsedData.name||'Voice Entry',amount:voiceParsedData.amount,date:todayStr(),
      category:voiceParsedData.category||'Other',note:'Added by voice',tags:['voice'],recurring:'',type:'expense',createdAt:Date.now()});
    saveExpenses(); closeModal('#voice-modal'); refreshAll(); toast('Voice expense added!');
  });
}
function parseVoiceInput(text,parsedEl,addBtn) {
  const lower=text.toLowerCase();
  const amtMatch=lower.match(/(\d{1,6}(?:\.\d{1,2})?)\s*(?:rupees?|rs\.?|inr)?/);
  const amount=amtMatch?parseFloat(amtMatch[1]):0;
  const category=suggestCategory(lower)||'Other';
  const stopWords=['spent','on','for','paid','rupees','rs','inr','the','a','an','i','my','bought'];
  const words=lower.split(/\s+/).filter(w=>!stopWords.includes(w)&&isNaN(parseFloat(w))&&w.length>1);
  const rawName=words.slice(0,4).join(' ')||'Voice Entry';
  const name=rawName.charAt(0).toUpperCase()+rawName.slice(1);
  voiceParsedData={name,amount,category};
  $('#vp-name').textContent=name;
  $('#vp-amount').textContent=amount>0?formatMoney(amount):'Not detected';
  $('#vp-category').textContent=category;
  parsedEl.classList.remove('hidden');
  if(amount>0) addBtn.classList.remove('hidden');
  else addBtn.classList.add('hidden');
}
