/* =====================================================
   FINFLOW — Authentication Module  v2.0
   auth.js  — powered by Supabase
   ===================================================== */
'use strict';

/* ─────────────────────────────────────────────────────
   HANDLE OAUTH REDIRECT
   Supabase puts #access_token=... in the URL after
   Google OAuth. We detect it early before any redirect.
   ───────────────────────────────────────────────────── */
(async function handleOAuthCallback() {
  const hash = window.location.hash;
  if (!hash.includes('access_token') && !hash.includes('error_description')) return;

  // Let Supabase SDK parse the fragment and establish session
  const session = await sbGetSession();
  if (session && session.user) {
    clearGuestMode();
    // Sync profile & data then go to app
    localStorage.setItem('finflow_username', JSON.stringify(
      session.user.user_metadata?.full_name ||
      session.user.user_metadata?.name      ||
      session.user.email.split('@')[0]
    ));
    await syncFromSupabase(session.user.id);
    window.location.replace('index.html');
  } else {
    // OAuth error — show it after DOM loads
    const errMsg = decodeURIComponent((hash.match(/error_description=([^&]+)/) || [])[1] || 'Google sign-in failed');
    window.addEventListener('DOMContentLoaded', () => showToast(errMsg, 'error'));
  }
})();

/* ─────────────────────────────────────────────────────
   REDIRECT IF ALREADY LOGGED IN
   ───────────────────────────────────────────────────── */
(async function checkExistingSession() {
  if (isGuestMode()) {
    window.location.replace('index.html');
    return;
  }
  const session = await sbGetSession();
  if (session) {
    window.location.replace('index.html');
  }
})();

/* ─────────────────────────────────────────────────────
   VALIDATION
   ───────────────────────────────────────────────────── */
const validators = {
  email(v) {
    if (!v.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'Enter a valid email address';
    return null;
  },
  password(v) {
    if (!v) return 'Password is required';
    if (v.length < 8) return 'Password must be at least 8 characters';
    return null;
  },
  newPassword(v) {
    if (!v) return 'Password is required';
    if (v.length < 8) return 'Must be at least 8 characters';
    if (!/[A-Z]/.test(v)) return 'Include at least one uppercase letter';
    if (!/[0-9]/.test(v)) return 'Include at least one number';
    return null;
  },
  name(v) {
    if (!v.trim()) return 'Full name is required';
    if (v.trim().length < 2) return 'Name must be at least 2 characters';
    return null;
  },
};

function showFieldError(inputEl, errorEl, msg) {
  if (!inputEl) return;
  inputEl.classList.toggle('error',   !!msg);
  inputEl.classList.toggle('success', !msg && inputEl.value.length > 0);
  if (errorEl) errorEl.textContent = msg || '';
}

function clearAllErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
  document.querySelectorAll('input').forEach(el => el.classList.remove('error', 'success'));
}

/* ─────────────────────────────────────────────────────
   PASSWORD STRENGTH
   ───────────────────────────────────────────────────── */
function calcStrength(password) {
  if (!password) return { label: 'Enter a password', cls: '' };
  let score = 0;
  if (password.length >= 8)           score++;
  if (password.length >= 12)          score++;
  if (/[A-Z]/.test(password))         score++;
  if (/[0-9]/.test(password))         score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return { label: 'Weak',   cls: 'weak' };
  if (score === 2) return { label: 'Fair',   cls: 'fair' };
  if (score === 3) return { label: 'Good',   cls: 'good' };
  return             { label: 'Strong', cls: 'strong' };
}

/* ─────────────────────────────────────────────────────
   TOAST
   ───────────────────────────────────────────────────── */
function showToast(message, type = 'info') {
  const toast = document.getElementById('auth-toast');
  if (!toast) return;
  toast.className = `auth-toast ${type}`;
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 4000);
}

/* ─────────────────────────────────────────────────────
   BUTTON LOADING STATE HELPERS
   ───────────────────────────────────────────────────── */
function setLoading(formId, loading) {
  const btn    = document.querySelector(`#${formId} .btn-auth`) ||
                 document.getElementById(formId + '-submit');
  const text   = document.querySelector(`#${formId} .btn-text`);
  const loader = document.querySelector(`#${formId} .btn-loader`);
  const arrow  = document.querySelector(`#${formId} .btn-arrow`);
  if (!btn) return;
  btn.disabled = loading;
  if (text)   text.classList.toggle('hidden', loading);
  if (arrow)  arrow.classList.toggle('hidden', loading);
  if (loader) loader.classList.toggle('hidden', !loading);
}

/* ─────────────────────────────────────────────────────
   LAMP EFFECT
   ───────────────────────────────────────────────────── */
function initLamp() {
  const canvas = document.getElementById('lamp-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  let mouseX = window.innerWidth / 2;
  let targetX = mouseX;

  document.addEventListener('mousemove', e => { targetX = e.clientX; });
  // Touch support
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 0) targetX = e.touches[0].clientX;
  }, { passive: true });

  const lamps = [
    { x: 0.5, color: [79,  70,  229], intensity: 1.0 },
    { x: 0.2, color: [13,  148, 136], intensity: 0.5 },
    { x: 0.8, color: [139, 92,  246], intensity: 0.5 },
  ];
  let frame = 0;

  function draw() {
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    mouseX += (targetX - mouseX) * 0.05;

    lamps.forEach((lamp, i) => {
      const cx = i === 0 ? mouseX : lamp.x * canvas.width;
      const [r, g, b] = lamp.color;
      const pulse = 1 + 0.04 * Math.sin(frame * 0.025 + i * 1.5);

      const grad = ctx.createRadialGradient(cx, 0, 0, cx, 0, canvas.height * 0.75);
      grad.addColorStop(0,   `rgba(${r},${g},${b},${0.18 * lamp.intensity * pulse})`);
      grad.addColorStop(0.4, `rgba(${r},${g},${b},${0.07 * lamp.intensity})`);
      grad.addColorStop(0.8, `rgba(${r},${g},${b},${0.02 * lamp.intensity})`);
      grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);

      ctx.save();
      ctx.beginPath();
      const spread = canvas.width * (0.18 + 0.04 * lamp.intensity);
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx - spread, canvas.height);
      ctx.lineTo(cx + spread, canvas.height);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      const halo = ctx.createRadialGradient(cx, 0, 0, cx, 0, 180);
      halo.addColorStop(0,   `rgba(${r},${g},${b},${0.35 * lamp.intensity * pulse})`);
      halo.addColorStop(0.5, `rgba(${r},${g},${b},${0.08 * lamp.intensity})`);
      halo.addColorStop(1,   `rgba(${r},${g},${b},0)`);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, 0, 180, 0, Math.PI * 2);
      ctx.fillStyle = halo;
      ctx.fill();
      ctx.restore();
    });

    const topBand = ctx.createLinearGradient(0, 0, canvas.width, 0);
    topBand.addColorStop(0,   'rgba(79,70,229,0)');
    topBand.addColorStop(0.3, 'rgba(79,70,229,.06)');
    topBand.addColorStop(0.5, 'rgba(129,140,248,.1)');
    topBand.addColorStop(0.7, 'rgba(79,70,229,.06)');
    topBand.addColorStop(1,   'rgba(79,70,229,0)');
    ctx.fillStyle = topBand;
    ctx.fillRect(0, 0, canvas.width, 3);

    requestAnimationFrame(draw);
  }
  draw();
}

/* ─────────────────────────────────────────────────────
   PARTICLES
   ───────────────────────────────────────────────────── */
function initParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  const colors = ['#4f46e5','#818cf8','#14b8a6','#2dd4bf','#8b5cf6'];
  for (let i = 0; i < 28; i++) {
    const p    = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 4 + 1.5;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random()*100}%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      animation-duration:${Math.random()*14+10}s;
      animation-delay:${Math.random()*-15}s;
      box-shadow:0 0 ${size*2}px ${colors[Math.floor(Math.random()*colors.length)]};
    `;
    container.appendChild(p);
  }
}

/* ─────────────────────────────────────────────────────
   TABS
   ───────────────────────────────────────────────────── */
function initTabs() {
  const tabs   = document.querySelectorAll('.auth-tab');
  const slider = document.getElementById('tab-slider');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      slider.classList.toggle('right', which === 'register');
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      const target = document.getElementById('form-' + which);
      if (target) target.classList.add('active');
      clearAllErrors();
    });
  });
}

/* ─────────────────────────────────────────────────────
   GOOGLE SIGN-IN
   ───────────────────────────────────────────────────── */
function initGoogleAuth() {
  const btns = document.querySelectorAll('.google-login-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px"></span> Connecting…';
      try {
        await sbSignInWithGoogle();
        // Page redirects to Google — no further code runs here
      } catch (err) {
        showToast(err.message || 'Google sign-in failed', 'error');
        btn.disabled = false;
        btn.innerHTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" class="google-icon" /> Continue with Google`;
      }
    });
  });
}

/* ─────────────────────────────────────────────────────
   EMAIL / PASSWORD LOGIN FORM
   ───────────────────────────────────────────────────── */
function initLoginForm() {
  const form    = document.getElementById('form-login');
  const emailEl = document.getElementById('login-email');
  const passEl  = document.getElementById('login-password');
  if (!form) return;

  emailEl.addEventListener('blur', () =>
    showFieldError(emailEl, document.getElementById('login-email-error'), validators.email(emailEl.value)));
  passEl.addEventListener('blur', () =>
    showFieldError(passEl, document.getElementById('login-pass-error'), validators.password(passEl.value)));

  document.getElementById('toggle-login-pass').addEventListener('click', () => {
    const show = passEl.type === 'password';
    passEl.type = show ? 'text' : 'password';
    document.getElementById('pass-eye').textContent = show ? '🙈' : '👁';
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearAllErrors();

    const emailErr = validators.email(emailEl.value);
    const passErr  = validators.password(passEl.value);
    showFieldError(emailEl, document.getElementById('login-email-error'), emailErr);
    showFieldError(passEl,  document.getElementById('login-pass-error'),  passErr);
    if (emailErr || passErr) return;

    setLoading('form-login', true);
    try {
      const user = await sbSignIn(emailEl.value.trim(), passEl.value);
      clearGuestMode();
      localStorage.setItem('finflow_username', JSON.stringify(
        user.user_metadata?.full_name || user.email.split('@')[0]
      ));
      await syncFromSupabase(user.id);
      showToast('Signed in! Redirecting…', 'success');
      await delay(600);
      window.location.href = 'index.html';
    } catch (err) {
      const msg = err.message.includes('Invalid login')
        ? 'Incorrect email or password.'
        : err.message;
      showFieldError(passEl, document.getElementById('login-pass-error'), msg);
      showToast(msg, 'error');
      setLoading('form-login', false);
    }
  });
}

/* ─────────────────────────────────────────────────────
   REGISTER FORM
   ───────────────────────────────────────────────────── */
function initRegisterForm() {
  const form      = document.getElementById('form-register');
  const nameEl    = document.getElementById('reg-name');
  const emailEl   = document.getElementById('reg-email');
  const passEl    = document.getElementById('reg-password');
  const confirmEl = document.getElementById('reg-confirm');
  const fillEl    = document.getElementById('strength-fill');
  const labelEl   = document.getElementById('strength-label');
  if (!form) return;

  passEl.addEventListener('input', () => {
    const s = calcStrength(passEl.value);
    fillEl.className    = 'strength-fill ' + s.cls;
    labelEl.textContent = s.label;
  });

  document.getElementById('toggle-reg-pass').addEventListener('click', () => {
    const show = passEl.type === 'password';
    passEl.type = show ? 'text' : 'password';
    document.getElementById('reg-pass-eye').textContent = show ? '🙈' : '👁';
  });

  nameEl.addEventListener('blur',    () => showFieldError(nameEl,    document.getElementById('reg-name-error'),    validators.name(nameEl.value)));
  emailEl.addEventListener('blur',   () => showFieldError(emailEl,   document.getElementById('reg-email-error'),   validators.email(emailEl.value)));
  passEl.addEventListener('blur',    () => showFieldError(passEl,    document.getElementById('reg-pass-error'),    validators.newPassword(passEl.value)));
  confirmEl.addEventListener('blur', () => showFieldError(confirmEl, document.getElementById('reg-confirm-error'),
    passEl.value !== confirmEl.value ? 'Passwords do not match' : null));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearAllErrors();

    const nameErr    = validators.name(nameEl.value);
    const emailErr   = validators.email(emailEl.value);
    const passErr    = validators.newPassword(passEl.value);
    const confirmErr = passEl.value !== confirmEl.value ? 'Passwords do not match' : null;
    const agreeEl    = document.getElementById('agree-terms');

    showFieldError(nameEl,    document.getElementById('reg-name-error'),    nameErr);
    showFieldError(emailEl,   document.getElementById('reg-email-error'),   emailErr);
    showFieldError(passEl,    document.getElementById('reg-pass-error'),    passErr);
    showFieldError(confirmEl, document.getElementById('reg-confirm-error'), confirmErr);
    if (nameErr || emailErr || passErr || confirmErr) return;

    if (!agreeEl.checked) {
      showToast('Please accept the Terms of Service.', 'error');
      return;
    }

    setLoading('form-register', true);
    try {
      await sbSignUp(nameEl.value.trim(), emailEl.value.trim(), passEl.value);
      // Push any existing local data to Supabase
      const user = await sbGetUser();
      if (user) {
        await sbUpsertProfile(user.id, { name: nameEl.value.trim() });
        await pushLocalDataToSupabase(user.id);
        clearGuestMode();
        await syncFromSupabase(user.id);
        showToast('Account created! Welcome to FinFlow 🎉', 'success');
        await delay(700);
        window.location.href = 'index.html';
      } else {
        // Email confirmation required
        showToast('Check your email to confirm your account!', 'info');
        setLoading('form-register', false);
      }
    } catch (err) {
      const msg = err.message.includes('already registered')
        ? 'An account with this email already exists.'
        : err.message;
      showFieldError(emailEl, document.getElementById('reg-email-error'), msg);
      showToast(msg, 'error');
      setLoading('form-register', false);
    }
  });
}

/* ─────────────────────────────────────────────────────
   FORGOT PASSWORD
   ───────────────────────────────────────────────────── */
function initForgotPassword() {
  const forgotLink = document.getElementById('forgot-link');
  const backBtn    = document.getElementById('back-to-login');
  const submitBtn  = document.getElementById('forgot-submit');
  const formForgot = document.getElementById('form-forgot');
  const formLogin  = document.getElementById('form-login');
  if (!forgotLink) return;

  forgotLink.addEventListener('click', e => {
    e.preventDefault();
    formLogin.classList.remove('active');
    formForgot.classList.add('active');
    clearAllErrors();
  });

  backBtn.addEventListener('click', () => {
    formForgot.classList.remove('active');
    formLogin.classList.add('active');
    document.getElementById('reset-success').classList.add('hidden');
    submitBtn.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span class="btn-text">Send Reset Link</span><span class="btn-arrow">→</span>';
    clearAllErrors();
  });

  submitBtn.addEventListener('click', async () => {
    const emailEl  = document.getElementById('forgot-email');
    const emailErr = validators.email(emailEl.value);
    showFieldError(emailEl, document.getElementById('forgot-email-error'), emailErr);
    if (emailErr) return;

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Sending…';
    try {
      await sbResetPassword(emailEl.value.trim());
    } catch (_) { /* show success regardless for security */ }
    document.getElementById('reset-success').classList.remove('hidden');
    submitBtn.classList.add('hidden');
    showToast('Password reset email sent!', 'success');
  });
}

/* ─────────────────────────────────────────────────────
   DEMO & GUEST LOGIN
   ───────────────────────────────────────────────────── */
function initQuickLogin() {
  const demoBtn  = document.getElementById('demo-login');
  const guestBtn = document.getElementById('guest-login');

  if (demoBtn) {
    demoBtn.addEventListener('click', async () => {
      demoBtn.disabled = true;
      demoBtn.textContent = 'Loading…';
      try {
        // Sign in with the demo Supabase account
        await sbSignIn('demo@finflow.app', 'Demo@1234');
        const user = await sbGetUser();
        if (user) {
          clearGuestMode();
          await syncFromSupabase(user.id);
          window.location.href = 'index.html';
        }
      } catch (_) {
        // Fallback: guest mode with demo data pre-loaded
        setGuestMode(true);
        localStorage.setItem('finflow_username', JSON.stringify('Demo User'));
        showToast('Running in demo mode (local only)', 'info');
        await delay(600);
        window.location.href = 'index.html';
      }
    });
  }

  if (guestBtn) {
    guestBtn.addEventListener('click', async () => {
      setGuestMode(true);
      localStorage.setItem('finflow_username', JSON.stringify('Guest'));
      showToast('Entering Guest Mode…', 'info');
      await delay(400);
      window.location.href = 'index.html';
    });
  }
}

/* ─────────────────────────────────────────────────────
   UTILITIES
   ───────────────────────────────────────────────────── */
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ─────────────────────────────────────────────────────
   BOOT
   ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initLamp();
  initParticles();
  initTabs();
  initGoogleAuth();
  initLoginForm();
  initRegisterForm();
  initForgotPassword();
  initQuickLogin();
});
