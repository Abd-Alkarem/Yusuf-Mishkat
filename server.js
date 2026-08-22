const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const escapeHTML = require('escape-html');
const { getDb } = require('./lib/db');
const { requireAuth, loadSettings } = require('./lib/auth');
const { render, renderWithLayout } = require('./lib/template');

const app = express();
app.set('trust proxy', 1);
const PORT = 3000;

// Ensure uploads dir
const UPLOADS = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Middleware
app.use(helmet({ contentSecurityPolicy: false })); // Basic secure headers, CSP disabled for inline scripts/styles
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS));

// Secure Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'mosawy-cms-static-secure-secret-2026',
  resave: false, saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }
}));
app.use(loadSettings);

// Rate Limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'تم حظر محاولات تسجيل الدخول مؤقتاً بسبب محاولات متكررة. يرجى المحاولة بعد 15 دقيقة.'
});
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 messages per hour
  message: 'تم تجاوز الحد المسموح من الرسائل. يرجى المحاولة لاحقاً.'
});

// ==================== HELPERS ====================
function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = {};
  rows.forEach(r => s[r.key] = r.value);
  return s;
}

function publicLayout(body, settings, activeNav = '', extraHtml = '') {
  const profileCircleContent = settings.profile_image
    ? `<img src="/uploads/${settings.profile_image}" alt="">`
    : `<span>${settings.site_name ? settings.site_name.charAt(0) : 'م'}</span>`;

  const navItems = [
    { href: '/', label: 'الرئيسية', key: 'home' },
    { href: '/sections', label: 'الأقسام', key: 'sections' },
    { href: '/articles', label: 'الأبحاث والدراسات', key: 'articles' },
    { href: '/books', label: 'المؤلّفات', key: 'books' },
    { href: '/audio-books', label: 'الكتب الصوتية', key: 'audio' },
    { href: '/biography', label: 'عقيدتي ومنهجي', key: 'biography' },
    { href: '/contact', label: 'تواصل', key: 'contact' },
  ];

  const desktopNav = navItems.map(n =>
    `<li><a class="nav-link ${activeNav === n.key ? 'active' : ''}" href="${n.href}" data-pjax>${n.label}</a></li>`
  ).join('');

  const mobileNav = navItems.map(n =>
    `<li><a class="${activeNav === n.key ? 'active' : ''}" href="${n.href}" data-pjax>${n.label}</a></li>`
  ).join('');

  const socials = [];
  if (settings.social_youtube) socials.push(`<li><a href="${settings.social_youtube}" target="_blank" rel="noopener">يوتيوب</a></li>`);
  if (settings.social_twitter) socials.push(`<li><a href="${settings.social_twitter}" target="_blank" rel="noopener">إكس / تويتر</a></li>`);
  if (settings.social_instagram) socials.push(`<li><a href="${settings.social_instagram}" target="_blank" rel="noopener">إنستغرام</a></li>`);
  if (settings.social_telegram) socials.push(`<li><a href="${settings.social_telegram}" target="_blank" rel="noopener">تيليغرام</a></li>`);
  if (settings.contact_email) socials.push(`<li><a href="mailto:${settings.contact_email}">${settings.contact_email}</a></li>`);

  const logoHtml = settings.site_logo_image ? `
    <img src="/uploads/${settings.site_logo_image}" class="logo-light" alt="${settings.site_name || 'اسم الموقع'}" style="height:60px; max-width:50vw; object-fit:contain">
    ${settings.site_logo_dark ? `<img src="/uploads/${settings.site_logo_dark}" class="logo-dark" alt="${settings.site_name || 'اسم الموقع'}" style="height:60px; max-width:50vw; object-fit:contain">` : ''}
  ` : `<span class="logo-text font-display" style="max-width:60vw; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:inline-block; font-size:clamp(1rem, 4vw, 1.25rem);">${settings.site_name || 'اسم الموقع'}</span>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${settings.site_name || 'الموقع'} — ${settings.site_description || ''}</title>
<meta name="description" content="${settings.site_description || ''}">
<link rel="stylesheet" href="/css/fonts.css"><link rel="stylesheet" href="/css/main.css">
<script src="/js/app.js" defer></script>
<style>
  .logo-dark { display: none !important; }
  html.dark .logo-light { display: none !important; }
  html.dark .logo-dark { display: block !important; }
</style>
</head>
<body>
${extraHtml}
<header class="site-header">
  <nav class="container-x">
    <a class="logo" href="/" data-pjax>
      <span class="logo-circle">${profileCircleContent}</span>
      ${logoHtml}
    </a>
    <ul class="nav-links">${desktopNav}</ul>
    <div class="flex items-center gap-2">
      <button type="button" class="nav-btn" onclick="toggleTheme()" aria-label="تبديل المظهر">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
      </button>
      <button type="button" class="nav-btn" onclick="toggleMobileMenu()" aria-label="القائمة" style="display:none" id="menu-toggle-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
    </div>
  </nav>
  <div class="mobile-menu" id="mobile-menu"><ul>${mobileNav}</ul></div>
</header>
<style>@media(max-width:1023px){#menu-toggle-btn{display:grid!important}}</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/vanilla-tilt/1.8.1/vanilla-tilt.min.js"></script>

<main id="main">
<div class="page-transition">
${body}
</div>
</main>

<footer class="site-footer">
  <div class="container-x py-14">
    <div style="display:grid;gap:2.5rem;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
      <div>
        <div class="flex items-center gap-3 mb-4">
          <span class="logo-circle" style="width:2.5rem;height:2.5rem;font-size:1.1rem;border:1px solid color-mix(in srgb,var(--bronze) 40%,transparent);border-radius:9999px;display:grid;place-items:center;color:var(--bronze);font-weight:700;overflow:hidden">${profileCircleContent}</span>
          ${settings.site_logo_image ? `<img src="/uploads/${settings.site_logo_image}" alt="${settings.site_name || 'اسم الموقع'}" style="height:60px; max-width:240px; object-fit:contain">` : `<span class="font-display text-xl" style="color:var(--charcoal)">${settings.site_name || 'اسم الموقع'}</span>`}
        </div>
        <p style="color:var(--muted);font-size:.95rem;line-height:1.625;max-width:24rem">${settings.site_description || ''}</p>
      </div>
      <nav>
        <h2 style="font-size:.875rem;font-weight:600;color:var(--charcoal);margin-bottom:1rem">روابط سريعة</h2>
        <ul style="display:grid;grid-template-columns:1fr 1fr;gap:.625rem;font-size:.95rem">
          ${navItems.map(n => `<li><a href="${n.href}" style="color:var(--muted);transition:color .2s" onmouseover="this.style.color='var(--bronze)'" onmouseout="this.style.color='var(--muted)'">${n.label}</a></li>`).join('')}
        </ul>
      </nav>
      ${socials.length ? `<div>
        <h2 style="font-size:.875rem;font-weight:600;color:var(--charcoal);margin-bottom:1rem">تواصل</h2>
        <ul style="display:flex;flex-direction:column;gap:.625rem;font-size:.95rem">
          ${socials.map(s => s.replace('<a ', '<a style="color:var(--muted);transition:color .2s" onmouseover="this.style.color=\'var(--bronze)\'" onmouseout="this.style.color=\'var(--muted)\'" ')).join('')}
        </ul>
      </div>` : ''}
    </div>
    <div style="margin-top:3rem;padding-top:1.5rem;border-top:1px solid var(--line);text-align:center;font-size:.875rem;color:var(--muted)">
      <p>© ${new Date().getFullYear()} ${settings.site_name || ''}. جميع الحقوق محفوظة.</p>
    </div>
  </div>
</footer>
<button id="back-to-top" class="back-to-top" type="button" aria-label="أعلى الصفحة">↑</button>
</body></html>`;
}

function adminLayout(body, title, activeNav = '') {
  const navItems = [
    { href: '/admin', label: 'لوحة التحكم', key: 'dashboard', icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
    { href: '/admin/settings', label: 'إعدادات الموقع', key: 'settings', icon: '<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>' },
    { href: '/admin/books', label: 'المؤلّفات', key: 'books', icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' },
    { href: '/admin/audio-books', label: 'الكتب الصوتية', key: 'audio_books', icon: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3v4z"/><path d="M3 19a2 2 0 0 0 2 2h1v-6H3v4z"/>' },
    { href: '/admin/articles', label: 'الأبحاث والدراسات', key: 'articles', icon: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>' },
    { href: '/admin/sections', label: 'الأقسام', key: 'sections', icon: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>' },
    { href: '/admin/biography', label: 'عقيدتي ومنهجي', key: 'biography', icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' },
    { href: '/admin/messages', label: 'الرسائل', key: 'messages', icon: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>' },
  ];

  const sideNav = navItems.map(n =>
    `<a class="nav-item ${activeNav === n.key ? 'active' : ''}" href="${n.href}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${n.icon}</svg>
      ${n.label}
    </a>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — لوحة التحكم</title>
<link rel="stylesheet" href="/css/fonts.css"><link rel="stylesheet" href="/css/main.css">
<script src="https://cdn.jsdelivr.net/npm/tinymce@6.8.2/tinymce.min.js" referrerpolicy="origin"></script>
<script src="/js/tinymce-setup.js"></script>
<script src="/js/app.js" defer></script>
</head>
<body>
<div class="admin-mobile-header">
  <div class="sidebar-logo">
    <div class="sidebar-logo-icon">م</div>
    <span class="sidebar-logo-text">لوحة التحكم</span>
  </div>
  <button type="button" class="nav-btn" onclick="toggleAdminSidebar()" aria-label="القائمة">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
  </button>
</div>
<div class="admin-overlay" id="admin-overlay" onclick="toggleAdminSidebar()"></div>
<div class="admin-layout">
  <aside class="admin-sidebar">
    <div class="sidebar-logo">
      <div class="sidebar-logo-icon">م</div>
      <span class="sidebar-logo-text">لوحة التحكم</span>
    </div>
    <nav class="nav-section">
      <div class="nav-section-title">القائمة</div>
      ${sideNav}
    </nav>
    <div style="margin-top:auto;padding-top:1rem;border-top:1px solid var(--line)">
      <a class="nav-item" href="/" target="_blank">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        عرض الموقع
      </a>
      <button class="nav-item" onclick="toggleTheme()" style="width:100%; text-align:right; cursor:pointer; background:none; border:none; font:inherit;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
        الوضع الليلي / النهاري
      </button>
      <a class="nav-item" href="/admin/logout" style="color:var(--danger)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        تسجيل الخروج
      </a>
    </div>
  </aside>
  <div class="admin-main">${body}</div>
</div>
<script>
  function toggleAdminSidebar() {
    document.querySelector('.admin-sidebar').classList.toggle('open');
    document.getElementById('admin-overlay').classList.toggle('open');
  }
</script>

</body></html>`;
}

// ==================== AUTH ROUTES ====================
app.get('/admin/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  const error = req.query.error ? '<div class="alert alert-error">اسم المستخدم أو كلمة المرور غير صحيحة</div>' : '';
  res.send(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>تسجيل الدخول</title>
<link rel="stylesheet" href="/css/fonts.css"><link rel="stylesheet" href="/css/main.css">
<script src="/js/app.js" defer></script>
</head><body>
<div class="login-page">
<div class="login-card">
  <div style="text-align:center;margin-bottom:1.5rem">
    <div style="width:4rem;height:4rem;margin:0 auto 1rem;border-radius:1rem;background:var(--bronze);color:white;display:grid;place-items:center;font-size:1.5rem;font-weight:700">م</div>
  </div>
  <h1 class="font-display">تسجيل الدخول</h1>
  <p class="subtitle">أدخل بياناتك للوصول إلى لوحة التحكم</p>
  ${error}
  <form method="POST" action="/admin/login">
    <div class="form-group">
      <label class="form-label">اسم المستخدم</label>
      <input type="text" name="username" class="form-input" required autofocus>
    </div>
    <div class="form-group">
      <label class="form-label">كلمة المرور</label>
      <input type="password" name="password" class="form-input" required>
    </div>
    <button type="submit" class="btn btn-primary w-full justify-center mt-4" style="padding:1rem">دخول</button>
  </form>
</div>
</div></body></html>`);
});

app.post('/admin/login', loginLimiter, (req, res) => {
  const db = getDb();
  const admin = db.prepare('SELECT * FROM admin WHERE username = ?').get(req.body.username);
  if (admin && bcrypt.compareSync(req.body.password, admin.password_hash)) {
    req.session.adminId = admin.id;
    return res.redirect('/admin');
  }
  res.redirect('/admin/login?error=1');
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ==================== ADMIN ROUTES ====================
app.get('/admin', requireAuth, (req, res) => {
  const db = getDb();
  const s = getSettings(db);
  const stats = {
    books: db.prepare('SELECT COUNT(*) as c FROM books').get().c,
    audioBooks: db.prepare('SELECT COUNT(*) as c FROM audio_books').get().c,
    articles: db.prepare('SELECT COUNT(*) as c FROM articles').get().c,
    messages: db.prepare('SELECT COUNT(*) as c FROM messages WHERE read = 0').get().c,
  };
  res.send(adminLayout(`
    <div class="admin-topbar"><h1 class="font-display">لوحة التحكم</h1></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:1.5rem;margin-bottom:2rem">
      <div style="background:linear-gradient(135deg, var(--charcoal), #0f172a); color:white; border-radius:1rem; padding:2rem; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); position:relative; overflow:hidden">
        <svg style="position:absolute;left:-10px;bottom:-10px;width:120px;height:120px;opacity:0.05;color:white" viewBox="0 0 24 24" fill="currentColor"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        <div style="font-size:3.5rem; font-weight:800; font-family:var(--font-display); line-height:1; margin-bottom:0.5rem">${stats.books}</div>
        <div style="font-size:1.1rem; font-weight:500; opacity:0.9">المؤلّفات</div>
      </div>
      <div style="background:linear-gradient(135deg, var(--bronze), #9a3412); color:white; border-radius:1rem; padding:2rem; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); position:relative; overflow:hidden">
        <svg style="position:absolute;left:-10px;bottom:-10px;width:120px;height:120px;opacity:0.05;color:white" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3v4z"/><path d="M3 19a2 2 0 0 0 2 2h1v-6H3v4z"/></svg>
        <div style="font-size:3.5rem; font-weight:800; font-family:var(--font-display); line-height:1; margin-bottom:0.5rem">${stats.audioBooks}</div>
        <div style="font-size:1.1rem; font-weight:500; opacity:0.9">الكتب الصوتية</div>
      </div>
      <div style="background:linear-gradient(135deg, #1a8a5b, #064e3b); color:white; border-radius:1rem; padding:2rem; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); position:relative; overflow:hidden">
        <svg style="position:absolute;left:-10px;bottom:-10px;width:120px;height:120px;opacity:0.05;color:white" viewBox="0 0 24 24" fill="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/></svg>
        <div style="font-size:3.5rem; font-weight:800; font-family:var(--font-display); line-height:1; margin-bottom:0.5rem">${stats.articles}</div>
        <div style="font-size:1.1rem; font-weight:500; opacity:0.9">الأبحاث والدراسات</div>
      </div>
      <div style="background:linear-gradient(135deg, #0284c7, #075985); color:white; border-radius:1rem; padding:2rem; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); position:relative; overflow:hidden">
        <svg style="position:absolute;left:-10px;bottom:-10px;width:120px;height:120px;opacity:0.05;color:white" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/></svg>
        <div style="font-size:3.5rem; font-weight:800; font-family:var(--font-display); line-height:1; margin-bottom:0.5rem">${stats.messages}</div>
        <div style="font-size:1.1rem; font-weight:500; opacity:0.9">الرسائل الجديدة</div>
      </div>
    </div>
    <div class="card p-8">
      <h3 class="font-display text-2xl mb-4" style="color:var(--charcoal)">مرحباً بك في لوحة تحكم موقعك</h3>
      <p style="color:var(--muted); font-size:1.1rem; line-height:1.8">هذه الواجهة توفر لك تحكماً كاملاً بمحتوى الموقع. يمكنك إضافة وتعديل المؤلّفات، الأبحاث، والكتب الصوتية من خلال القائمة الجانبية. كما يمكنك مراجعة الرسائل الواردة وتحديث إعدادات الموقع بكل سهولة.</p>
    </div>
  `, 'لوحة التحكم', 'dashboard'));
});

// ---- SETTINGS ----
app.get('/admin/settings', requireAuth, (req, res) => {
  const db = getDb();
  const s = getSettings(db);
  const msg = req.query.saved ? '<div class="alert alert-success" data-auto-dismiss>تم حفظ الإعدادات بنجاح</div>' : '';
  res.send(adminLayout(`
    <div class="admin-topbar"><h1 class="font-display">إعدادات الموقع</h1></div>
    ${msg}
    <form method="POST" action="/admin/settings" enctype="multipart/form-data" style="max-width:42rem">
      <div class="card p-6 mb-6">
        <h3 class="font-display text-lg mb-4" style="color:var(--charcoal)">المعلومات الأساسية</h3>
        <div class="form-group">
          <label class="form-label">اسم الموقع</label>
          <input type="text" name="site_name" class="form-input" value="${s.site_name || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">وصف الموقع</label>
          <textarea name="site_description" class="form-textarea" rows="3">${s.site_description || ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">الكلمات المفتاحية في الواجهة (مفصولة بفاصلة)</label>
          <textarea name="hero_tags" class="form-textarea" rows="2" placeholder="المكتبة الصوتية, المؤلّفات, مقالات ودراسات...">${s.hero_tags || 'المكتبة الصوتية, المؤلّفات, مقالات ودراسات, أسئلة وردود, الأقسام'}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">صورة الملف الشخصي</label>
          ${s.profile_image ? `<div class="mb-3"><img src="/uploads/${s.profile_image}" style="width:80px;height:80px;border-radius:9999px;object-fit:cover;border:2px solid var(--line)"></div>` : ''}
          <div class="form-file-wrapper">
            <input type="file" name="profile_image" accept="image/*" onchange="this.nextElementSibling.innerText = this.files[0].name">
            <p style="color:var(--muted);font-size:.9rem">اضغط لرفع صورة</p>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">صورة شعار الموقع (نص الشعار)</label>
          ${s.site_logo_image ? `<div class="mb-3"><img src="/uploads/${s.site_logo_image}" style="height:40px;background:var(--sand);padding:4px;border-radius:4px"></div>` : ''}
          <div class="form-file-wrapper">
            <input type="file" name="site_logo_image" accept="image/*" onchange="this.nextElementSibling.innerText = this.files[0].name">
            <p style="color:var(--muted);font-size:.9rem">اضغط لرفع صورة الشعار</p>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">صورة شعار الموقع (الوضع الداكن)</label>
          ${s.site_logo_dark ? `<div class="mb-3"><img src="/uploads/${s.site_logo_dark}" style="height:40px;background:var(--charcoal);padding:4px;border-radius:4px"></div>` : ''}
          <div class="form-file-wrapper">
            <input type="file" name="site_logo_dark" accept="image/*" onchange="this.nextElementSibling.innerText = this.files[0].name">
            <p style="color:var(--muted);font-size:.9rem">اضغط لرفع صورة الشعار للوضع الداكن</p>
          </div>
        </div>
      </div>
      <div class="card p-6 mb-6">
        <h3 class="font-display text-lg mb-4" style="color:var(--charcoal)">وسائل التواصل</h3>
        <div class="form-group"><label class="form-label">البريد الإلكتروني</label><input type="email" name="contact_email" class="form-input" value="${s.contact_email || ''}" dir="ltr"></div>
        <div class="form-group"><label class="form-label">يوتيوب</label><input type="url" name="social_youtube" class="form-input" value="${s.social_youtube || ''}" dir="ltr" placeholder="https://youtube.com/..."></div>
        <div class="form-group"><label class="form-label">تويتر / إكس</label><input type="url" name="social_twitter" class="form-input" value="${s.social_twitter || ''}" dir="ltr" placeholder="https://twitter.com/..."></div>
        <div class="form-group"><label class="form-label">إنستغرام</label><input type="url" name="social_instagram" class="form-input" value="${s.social_instagram || ''}" dir="ltr" placeholder="https://instagram.com/..."></div>
        <div class="form-group"><label class="form-label">تيليغرام</label><input type="url" name="social_telegram" class="form-input" value="${s.social_telegram || ''}" dir="ltr" placeholder="https://t.me/..."></div>
      </div>
      <div class="card p-6 mb-6">
        <h3 class="font-display text-lg mb-4" style="color:var(--charcoal)">تغيير كلمة المرور</h3>
        <div class="form-group"><label class="form-label">كلمة المرور الجديدة (اتركها فارغة إن لم ترد التغيير)</label><input type="password" name="new_password" class="form-input"></div>
      </div>
      <div class="card p-6 mb-6 bg-bronze-light">
        <h3 class="font-display text-lg mb-4" style="color:var(--charcoal)">نسخة احتياطية (Backup)</h3>
        <p style="color:var(--muted); margin-bottom: 1rem;">حمل نسخة كاملة من قاعدة البيانات وجميع الملفات المرفوعة بضغطة زر واحدة.</p>
        <a href="/admin/backup" class="btn btn-primary" style="background-color: var(--charcoal); color: white; border-color: var(--charcoal);">تحميل النسخة الاحتياطية (ZIP)</a>
      </div>
      <button type="submit" class="btn btn-primary">حفظ الإعدادات</button>
    </form>
  `, 'الإعدادات', 'settings'));
});

app.post('/admin/settings', requireAuth, upload.fields([{ name: 'profile_image', maxCount: 1 }, { name: 'site_logo_image', maxCount: 1 }, { name: 'site_logo_dark', maxCount: 1 }]), (req, res) => {
  const db = getDb();
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?');
  const fields = ['site_name', 'site_description', 'hero_tags', 'contact_email', 'social_youtube', 'social_twitter', 'social_instagram', 'social_telegram'];
  for (const f of fields) { upsert.run(f, req.body[f] || '', req.body[f] || ''); }
  if (req.files?.profile_image?.[0]) { upsert.run('profile_image', req.files.profile_image[0].filename, req.files.profile_image[0].filename); }
  if (req.files?.site_logo_image?.[0]) { upsert.run('site_logo_image', req.files.site_logo_image[0].filename, req.files.site_logo_image[0].filename); }
  if (req.files?.site_logo_dark?.[0]) { upsert.run('site_logo_dark', req.files.site_logo_dark[0].filename, req.files.site_logo_dark[0].filename); }
  if (req.body.new_password && req.body.new_password.length >= 4) {
    const hash = bcrypt.hashSync(req.body.new_password, 10);
    db.prepare('UPDATE admin SET password_hash = ? WHERE id = 1').run(hash);
  }
  res.redirect('/admin/settings?saved=1');
});

app.get('/admin/backup', requireAuth, (req, res) => {
  try {
    const zip = new AdmZip();
    if (fs.existsSync(path.join(__dirname, 'data.db'))) {
      zip.addLocalFile(path.join(__dirname, 'data.db'));
    }
    if (fs.existsSync(path.join(__dirname, 'uploads'))) {
      zip.addLocalFolder(path.join(__dirname, 'uploads'), 'uploads');
    }
    const buffer = zip.toBuffer();
    const fileName = 'mosawy-backup-' + new Date().toISOString().split('T')[0] + '.zip';
    res.set('Content-Disposition', `attachment; filename="${fileName}"`);
    res.set('Content-Type', 'application/zip');
    res.send(buffer);
  } catch (err) {
    res.status(500).send({error: err.message});
  }
});

// ---- BOOKS ----
app.get('/admin/books', requireAuth, (req, res) => {
  const db = getDb();
  const books = db.prepare('SELECT * FROM books ORDER BY created_at DESC').all();
  const msg = req.query.saved ? '<div class="alert alert-success" data-auto-dismiss>تم الحفظ بنجاح</div>' : req.query.deleted ? '<div class="alert alert-success" data-auto-dismiss>تم الحذف</div>' : '';
  const rows = books.map(b => `
    <tr>
      <td>${b.cover_image ? `<img src="/uploads/${b.cover_image}" style="width:40px;height:53px;border-radius:4px;object-fit:cover">` : '<div style="width:40px;height:53px;border-radius:4px;background:var(--beige)"></div>'}</td>
      <td><strong style="color:var(--charcoal)">${b.title}</strong><br><span style="font-size:0.8rem;color:var(--muted)">👁 ${b.views} &nbsp; ⬇️ ${b.downloads}</span></td>
      <td>${b.visible ? '<span class="badge badge-success">ظاهر</span>' : '<span class="badge badge-danger">مخفي</span>'}</td>
      <td class="actions">
        <a href="/admin/books/${b.id}/edit" class="btn btn-outline btn-xs">تعديل</a>
        <form method="POST" action="/admin/books/${b.id}/toggle" style="display:inline"><button class="btn btn-outline btn-xs">${b.visible ? 'إخفاء' : 'إظهار'}</button></form>
        <form method="POST" action="/admin/books/${b.id}/delete" style="display:inline" onsubmit="return confirm('هل أنت متأكد من الحذف؟')"><button class="btn btn-danger btn-xs">حذف</button></form>
      </td>
    </tr>`).join('');

  res.send(adminLayout(`
    <div class="admin-topbar"><h1 class="font-display">المؤلّفات</h1><a href="/admin/books/new" class="btn btn-primary btn-sm">+ إضافة كتاب</a></div>
    ${msg}
    ${books.length ? `<div class="admin-table-container" style="overflow-x:auto"><table class="admin-table"><thead><tr><th>الغلاف</th><th>العنوان</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>${rows}</tbody></table></div>` :
      `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg><h3>لا توجد كتب بعد</h3><p>أضف أول كتاب من الزر أعلاه</p></div>`}
  `, 'المؤلّفات', 'books'));
});

app.get('/admin/books/new', requireAuth, (req, res) => {
  res.send(adminLayout(bookForm(), 'إضافة كتاب', 'books'));
});

app.get('/admin/books/:id/edit', requireAuth, (req, res) => {
  const db = getDb();
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
  if (!book) return res.redirect('/admin/books');
  res.send(adminLayout(bookForm(book), 'تعديل كتاب', 'books'));
});

function bookForm(book = null) {
  return `
    <div class="admin-topbar"><h1 class="font-display">${book ? 'تعديل كتاب' : 'إضافة كتاب جديد'}</h1></div>
    <form method="POST" action="/admin/books${book ? '/' + book.id : ''}" enctype="multipart/form-data" style="max-width:42rem">
      <div class="card p-6 mb-6">
        <div class="form-group"><label class="form-label">عنوان الكتاب</label><input type="text" name="title" class="form-input" required value="${book ? book.title : ''}"></div>
        <div class="form-group"><label class="form-label">اسم المؤلف</label><input type="text" name="author" class="form-input" value="${book ? book.author || '' : ''}" placeholder="اسم المؤلف"></div>
        <div class="form-group"><label class="form-label">وصف مختصر</label><textarea name="description" class="form-textarea" rows="4">${book ? book.description : ''}</textarea></div>
        <div class="form-group">
          <label class="form-label">صورة الغلاف</label>
          ${book && book.cover_image ? `<div class="mb-3"><img src="/uploads/${book.cover_image}" style="width:100px;border-radius:8px"></div>` : ''}
          <div class="form-file-wrapper"><input type="file" name="cover_image" accept="image/*" onchange="this.nextElementSibling.innerText = this.files[0].name"><p style="color:var(--muted);font-size:.9rem">اضغط لرفع صورة الغلاف</p></div>
        </div>
        <div class="form-group">
          <label class="form-label">ملف PDF</label>
          ${book && book.pdf_file ? `<p class="mb-2" style="color:var(--bronze);font-size:.85rem">✓ يوجد ملف مرفوع</p>` : ''}
          <div class="form-file-wrapper"><input type="file" name="pdf_file" accept=".pdf" onchange="this.nextElementSibling.innerText = this.files[0].name"><p style="color:var(--muted);font-size:.9rem">اضغط لرفع ملف PDF</p></div>
        </div>
      </div>
      <div class="card p-6 mb-6">
        <label class="form-label mb-3">فهرس الكتاب</label>
        <textarea name="table_of_contents" id="editor-container" style="min-height:300px;width:100%">${book ? book.table_of_contents : ''}</textarea>
      </div>
      <div class="flex gap-3"><button type="submit" class="btn btn-primary">حفظ</button><a href="/admin/books" class="btn btn-outline">إلغاء</a></div>
    </form>
    <script>
    document.addEventListener('DOMContentLoaded', function() {
      tinymce.init({
        selector: '#editor-container',
        directionality: 'rtl',
        language: 'ar',
        plugins: 'lists link image code table wordcount superscript',
        menubar: 'file edit view insert format tools table',
        mobile: { menubar: true },
        toolbar: 'undo redo | blocks | bold italic underline superscript | alignleft aligncenter alignright alignjustify | bullist numlist | link image | islamic',
        toolbar_mode: 'sliding',
        height: 400,
        content_style: 'body { font-family: "DecoType Naskh Variants", "Traditional Arabic", "Amiri", "notoNaskhArabic", serif; font-size: 1.125rem; line-height: 1.8; color: #2a2620; text-align: right; direction: rtl; } p { margin-bottom: 1rem; }',
        setup: window.mosawyTinymceSetup
      });
    });
    </script>`;
}

app.post('/admin/books', requireAuth, upload.fields([{ name: 'cover_image', maxCount: 1 }, { name: 'pdf_file', maxCount: 1 }]), (req, res) => {
  const db = getDb();
  const cover = req.files?.cover_image?.[0]?.filename || '';
  const pdf = req.files?.pdf_file?.[0]?.filename || '';
  db.prepare('INSERT INTO books (title, author, description, cover_image, pdf_file, table_of_contents) VALUES (?, ?, ?, ?, ?, ?)').run(req.body.title, req.body.author || '', req.body.description || '', cover, pdf, req.body.table_of_contents || '');
  res.redirect('/admin/books?saved=1');
});

app.get('/admin/books/:id', requireAuth, (req, res) => res.redirect('/admin/books/' + req.params.id + '/edit'));

app.post('/admin/books/:id', requireAuth, upload.fields([{ name: 'cover_image', maxCount: 1 }, { name: 'pdf_file', maxCount: 1 }]), (req, res) => {
  const db = getDb();
  let sql = "UPDATE books SET title = ?, author = ?, description = ?, table_of_contents = ?, updated_at = datetime('now')";
  const params = [req.body.title, req.body.author || '', req.body.description || '', req.body.table_of_contents || ''];
  if (req.files?.cover_image?.[0]) { sql += ', cover_image = ?'; params.push(req.files.cover_image[0].filename); }
  if (req.files?.pdf_file?.[0]) { sql += ', pdf_file = ?'; params.push(req.files.pdf_file[0].filename); }
  sql += ' WHERE id = ?'; params.push(req.params.id);
  db.prepare(sql).run(...params);
  res.redirect('/admin/books?saved=1');
});

app.post('/admin/books/:id/toggle', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE books SET visible = CASE WHEN visible = 1 THEN 0 ELSE 1 END WHERE id = ?').run(req.params.id);
  res.redirect('/admin/books');
});

app.post('/admin/books/:id/delete', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM books WHERE id = ?').run(req.params.id);
  res.redirect('/admin/books?deleted=1');
});

// ---- ARTICLES ----
app.get('/admin/articles', requireAuth, (req, res) => {
  const db = getDb();
  const articles = db.prepare('SELECT a.*, s.name as section_name FROM articles a LEFT JOIN sections s ON a.section_id = s.id ORDER BY a.created_at DESC').all();
  const msg = req.query.saved ? '<div class="alert alert-success" data-auto-dismiss>تم الحفظ</div>' : req.query.deleted ? '<div class="alert alert-success" data-auto-dismiss>تم الحذف</div>' : '';
  const rows = articles.map(a => `
    <tr>
      <td><strong style="color:var(--charcoal)">${a.title}</strong></td>
      <td>${a.section_name || '—'}</td>
      <td style="font-size:.8rem;color:var(--muted)" class="hide-mobile">${a.created_at ? a.created_at.split('T')[0] : ''}</td>
      <td class="actions">
        <a href="/admin/articles/${a.id}/edit" class="btn btn-outline btn-xs">تعديل</a>
        <form method="POST" action="/admin/articles/${a.id}/delete" style="display:inline" onsubmit="return confirm('هل أنت متأكد من الحذف؟')"><button class="btn btn-danger btn-xs">حذف</button></form>
      </td>
    </tr>`).join('');

  res.send(adminLayout(`
    <div class="admin-topbar"><h1 class="font-display">المقالات</h1><a href="/admin/articles/new" class="btn btn-primary btn-sm">+ مقال جديد</a></div>
    ${msg}
    ${articles.length ? `<div class="admin-table-container" style="overflow-x:auto"><table class="admin-table"><thead><tr><th>العنوان</th><th>القسم</th><th class="hide-mobile">التاريخ</th><th>إجراءات</th></tr></thead><tbody>${rows}</tbody></table></div>` :
      `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><h3>لا توجد مقالات بعد</h3><p>أنشئ أول مقال من الزر أعلاه</p></div>`}
  `, 'المقالات', 'articles'));
});

app.get('/admin/articles/new', requireAuth, (req, res) => {
  const db = getDb();
  const sections = db.prepare('SELECT * FROM sections ORDER BY name').all();
  res.send(adminLayout(articleForm(null, sections), 'مقال جديد', 'articles'));
});

app.get('/admin/articles/:id/edit', requireAuth, (req, res) => {
  const db = getDb();
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  const sections = db.prepare('SELECT * FROM sections ORDER BY name').all();
  if (!article) return res.redirect('/admin/articles');
  res.send(adminLayout(articleForm(article, sections), 'تعديل مقال', 'articles'));
});

function articleForm(article = null, sections = []) {
  const sectionOpts = sections.map(s =>
    `<option value="${s.id}" ${article && article.section_id === s.id ? 'selected' : ''}>${s.name}</option>`
  ).join('');
  const content = article && article.content ? article.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
  const footnotesContent = article && article.footnotes ? article.footnotes.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';

  return `
    <div class="admin-topbar"><h1 class="font-display">${article ? 'تعديل مقال' : 'مقال جديد'}</h1></div>
    <form method="POST" action="/admin/articles${article ? '/' + article.id : ''}" enctype="multipart/form-data" id="article-form" style="max-width:56rem">
      <div class="card p-6 mb-6">
        <div class="form-group"><label class="form-label">عنوان المقال</label><input type="text" name="title" class="form-input" required value="${article ? article.title : ''}"></div>
        <div class="form-group"><label class="form-label">مقتطف / وصف مختصر</label><textarea name="excerpt" class="form-textarea" rows="2">${article ? article.excerpt || '' : ''}</textarea></div>
        <div class="form-group"><label class="form-label">الوسوم (مفصولة بفاصلة)</label><input type="text" name="tags" class="form-input" placeholder="عقيدة, فقه, سيرة" value="${article ? article.tags || '' : ''}"></div>
        <div class="form-group">
          <label class="form-label" style="display:flex;justify-content:space-between">القسم <a href="/admin/sections" target="_blank" style="font-size:0.8rem;color:var(--bronze);font-weight:normal">إدارة الأقسام (إضافة قسم جديد)</a></label>
          <select name="section_id" class="form-select"><option value="">بدون قسم</option>${sectionOpts}</select>
        </div>
        <div class="form-group">
          <label class="form-label">صورة الغلاف</label>
          ${article && article.cover_image ? `<div class="mb-3"><img src="/uploads/${article.cover_image}" style="width:200px;border-radius:8px"></div>` : ''}
          <div class="form-file-wrapper"><input type="file" name="cover_image" accept="image/*" onchange="this.nextElementSibling.innerText = this.files[0].name"><p style="color:var(--muted);font-size:.9rem">اضغط لرفع صورة الغلاف</p></div>
        </div>
        <div class="form-group">
          <label class="form-label">تسجيل صوتي (اختياري)</label>
          ${article && article.audio_file ? `<div class="mb-2"><audio controls src="/uploads/${article.audio_file}" style="height:36px;max-width:300px"></audio></div>` : ''}
          <div class="form-file-wrapper"><input type="file" name="audio_file" accept="audio/*" onchange="this.nextElementSibling.innerText = this.files[0].name"><p style="color:var(--muted);font-size:.9rem">اضغط لرفع ملف صوتي (MP3, WAV)</p></div>
        </div>
        <div class="form-group">
          <label class="form-label">ملف للتحميل (PDF) (اختياري)</label>
          ${article && article.pdf_file ? `<div class="mb-2"><a href="/uploads/${article.pdf_file}" target="_blank" class="btn btn-outline btn-sm">عرض الملف الحالي</a></div>` : ''}
          <div class="form-file-wrapper"><input type="file" name="pdf_file" accept="application/pdf" onchange="this.nextElementSibling.innerText = this.files[0].name"><p style="color:var(--muted);font-size:.9rem">اضغط لرفع نسخة PDF للمقال</p></div>
        </div>
      </div>
      <div class="card p-6 mb-6">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <label class="form-label mb-0">محتوى المقال</label>
          <div class="flex gap-2">
            <a href="/uploads/ithraa_template_v3.dotx" class="btn btn-outline btn-sm" download>⬇ قالب الوورد المعتمد</a>
            <button type="button" class="btn btn-outline btn-sm" id="btn-page-break">+ إضافة صفحة جديدة</button>
          </div>
        </div>
        <textarea name="content" id="editor-container" style="min-height:400px;width:100%">${content}</textarea>
      </div>
      <div class="card p-6 mb-6">
        <label class="form-label">الحواشي السفلية (اختياري)</label>
        <p style="color:var(--muted);font-size:.9rem;margin-bottom:1rem">اكتب كل حاشية في سطر جديد، مثلاً: 1- تخريج الحديث...</p>
        <textarea name="footnotes" id="footnotes-editor" style="min-height:200px;width:100%">${footnotesContent}</textarea>
      </div>
      <div class="flex gap-3"><button type="submit" class="btn btn-primary">حفظ المقال</button><a href="/admin/articles" class="btn btn-outline">إلغاء</a></div>
    </form>
    <script>
    document.addEventListener('DOMContentLoaded', function() {
      tinymce.init({
        selector: '#editor-container',
        directionality: 'rtl',
        language: 'ar',
        plugins: 'lists link image code table wordcount pagebreak superscript',
        menubar: 'file edit view insert format tools table',
        mobile: { menubar: true },
        toolbar: 'undo redo | blocks | bold italic underline superscript forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist | link image | pagebreak | islamic',
        toolbar_mode: 'sliding',
        height: 600,
        pagebreak_split_block: true,
        pagebreak_separator: '[PAGE]',
        image_advtab: true,
        image_title: true,
        automatic_uploads: true,
        images_upload_handler: function (blobInfo, progress) {
          return new Promise(function(resolve, reject) {
            var xhr, formData;
            xhr = new XMLHttpRequest();
            xhr.withCredentials = false;
            xhr.open('POST', '/admin/upload-image');
            xhr.onload = function() {
              if (xhr.status < 200 || xhr.status >= 300) { reject('HTTP Error: ' + xhr.status); return; }
              var json = JSON.parse(xhr.responseText);
              if (!json || typeof json.url != 'string') { reject('Invalid JSON: ' + xhr.responseText); return; }
              resolve(json.url);
            };
            xhr.onerror = function () { reject('Image upload failed. Code: ' + xhr.status); };
            formData = new FormData();
            formData.append('image', blobInfo.blob(), blobInfo.filename());
            xhr.send(formData);
          });
        },
        content_style: '@font-face { font-family: "KFGQPC Arabic Symbols 01"; src: url("/fonts/KFGQPC-Symbols1.woff2") format("woff2"), url("/fonts/KFGQPC-Symbols1.woff") format("woff"); } .islamic-sym { font-family: "KFGQPC Arabic Symbols 01", serif; font-size: 1.4em; vertical-align: middle; line-height: 1; } body { font-family: "DecoType Naskh Variants", "Traditional Arabic", "Amiri", "notoNaskhArabic", serif; font-size: 1.125rem; line-height: 1.8; color: #2a2620; text-align: right; direction: rtl; } p { margin-bottom: 1rem; }',
        setup: window.mosawyTinymceSetup
      });
      // Footnotes editor
      tinymce.init({
        selector: '#footnotes-editor',
        directionality: 'rtl',
        language: 'ar',
        plugins: 'lists link image code table wordcount pagebreak superscript',
        toolbar: 'undo redo | blocks | bold italic underline superscript forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist | link image | pagebreak | islamic',
        menubar: 'file edit view insert format tools table',
        mobile: { menubar: true },
        toolbar_mode: 'sliding',
        height: 200,
        content_style: '@font-face { font-family: "KFGQPC Arabic Symbols 01"; src: url("/fonts/KFGQPC-Symbols1.woff2") format("woff2"), url("/fonts/KFGQPC-Symbols1.woff") format("woff"); } .islamic-sym { font-family: "KFGQPC Arabic Symbols 01", serif; font-size: 1.4em; vertical-align: middle; line-height: 1; } body { font-family: "DecoType Naskh Variants", "Traditional Arabic", "Amiri", "notoNaskhArabic", serif; font-size: 1rem; line-height: 1.8; color: #2a2620; text-align: right; direction: rtl; }',
        setup: window.mosawyTinymceSetup
      });
      document.getElementById('btn-page-break').addEventListener('click', function() {
        tinymce.activeEditor.execCommand('mcePageBreak');
      });
    });
    </script>`;
}

// Upload image for Quill editor
app.post('/admin/upload-image', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: '/uploads/' + req.file.filename });
});

app.post('/admin/articles', requireAuth, upload.fields([{ name: 'cover_image', maxCount: 1 }, { name: 'audio_file', maxCount: 1 }, { name: 'pdf_file', maxCount: 1 }]), (req, res) => {
  const db = getDb();
  const cover = req.files?.cover_image?.[0]?.filename || '';
  const audio = req.files?.audio_file?.[0]?.filename || '';
  const pdf = req.files?.pdf_file?.[0]?.filename || '';
  db.prepare('INSERT INTO articles (title, excerpt, content, cover_image, audio_file, pdf_file, section_id, tags, footnotes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    req.body.title, req.body.excerpt || '', req.body.content || '', cover, audio, pdf, req.body.section_id || null, req.body.tags || '', req.body.footnotes || ''
  );
  res.redirect('/admin/articles?saved=1');
});

app.get('/admin/articles/:id', requireAuth, (req, res) => res.redirect('/admin/articles/' + req.params.id + '/edit'));

app.post('/admin/articles/:id', requireAuth, upload.fields([{ name: 'cover_image', maxCount: 1 }, { name: 'audio_file', maxCount: 1 }, { name: 'pdf_file', maxCount: 1 }]), (req, res) => {
  const db = getDb();
  let sql = "UPDATE articles SET title = ?, excerpt = ?, content = ?, section_id = ?, tags = ?, footnotes = ?, updated_at = datetime('now')";
  const params = [req.body.title, req.body.excerpt || '', req.body.content || '', req.body.section_id || null, req.body.tags || '', req.body.footnotes || ''];
  if (req.files?.cover_image?.[0]) { sql += ', cover_image = ?'; params.push(req.files.cover_image[0].filename); }
  if (req.files?.audio_file?.[0]) { sql += ', audio_file = ?'; params.push(req.files.audio_file[0].filename); }
  if (req.files?.pdf_file?.[0]) { sql += ', pdf_file = ?'; params.push(req.files.pdf_file[0].filename); }
  sql += ' WHERE id = ?'; params.push(req.params.id);
  db.prepare(sql).run(...params);
  res.redirect('/admin/articles?saved=1');
});

app.post('/admin/articles/:id/delete', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
  res.redirect('/admin/articles?deleted=1');
});

// ---- SECTIONS ----
app.get('/admin/sections', requireAuth, (req, res) => {
  const db = getDb();
  const sections = db.prepare('SELECT s.*, (SELECT COUNT(*) FROM articles WHERE section_id = s.id) as article_count FROM sections s ORDER BY sort_order').all();
  const msg = req.query.saved ? '<div class="alert alert-success" data-auto-dismiss>تم الحفظ</div>' : req.query.deleted ? '<div class="alert alert-success" data-auto-dismiss>تم الحذف</div>' : '';

  res.send(adminLayout(`
    <div class="admin-topbar"><h1 class="font-display">إدارة الأقسام</h1></div>
    ${msg}
    
    <div class="card p-6 mb-8" style="max-width:56rem; height: max-content;">
      <h3 class="font-display text-lg mb-4" style="color:var(--charcoal)">إضافة قسم جديد</h3>
      <form method="POST" action="/admin/sections" class="flex items-start gap-4 flex-wrap">
        <div class="form-group flex-1 mb-0 min-w-[200px]" style="min-width:200px"><input type="text" name="name" class="form-input" required placeholder="اسم القسم"></div>
        <div class="form-group flex-1 mb-0 min-w-[300px]" style="min-width:300px"><input type="text" name="description" class="form-input" placeholder="وصف مختصر للقسم"></div>
        <button type="submit" class="btn btn-primary" style="height:46px;padding:0 2rem">إضافة القسم</button>
      </form>
    </div>

    <h3 class="font-display text-lg mb-4 mt-8" style="color:var(--charcoal)">الأقسام الحالية</h3>
    ${sections.length ? `
    <div class="admin-table-container">
      <table class="admin-table">
        <thead><tr><th>اسم القسم</th><th>الوصف</th><th>المقالات</th><th>إجراءات</th></tr></thead>
        <tbody>
          ${sections.map(s => `
          <tr>
            <td class="font-bold">${s.name}</td>
            <td style="color:var(--muted)">${s.description || '-'}</td>
            <td><span class="badge" style="background:var(--sand);color:var(--charcoal);padding:.25rem .75rem;border-radius:1rem">${s.article_count}</span></td>
            <td><form method="POST" action="/admin/sections/${s.id}/delete" onsubmit="return confirm('هل أنت متأكد من الحذف؟')"><button class="btn btn-danger btn-xs">حذف</button></form></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '<div class="empty-state">لا توجد أقسام بعد</div>'}
  `, 'الأقسام', 'sections'));
});

app.post('/admin/sections', requireAuth, (req, res) => {
  getDb().prepare('INSERT INTO sections (name, description) VALUES (?, ?)').run(req.body.name, req.body.description || '');
  res.redirect('/admin/sections?saved=1');
});

app.post('/admin/sections/:id/delete', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM sections WHERE id = ?').run(req.params.id);
  res.redirect('/admin/sections?deleted=1');
});

// ---- AUDIO BOOKS ----
app.get('/admin/audio-books', requireAuth, (req, res) => {
  const db = getDb();
  const books = db.prepare('SELECT * FROM audio_books ORDER BY created_at DESC').all();
  const msg = req.query.saved ? '<div class="alert alert-success" data-auto-dismiss>تم الحفظ</div>' : req.query.deleted ? '<div class="alert alert-success" data-auto-dismiss>تم الحذف</div>' : '';

  const rows = books.map(b => `
    <tr>
      <td>${b.cover_image ? `<img src="/uploads/${b.cover_image}" style="width:40px;height:40px;object-fit:cover;border-radius:4px">` : ''}</td>
      <td class="font-bold">${b.title}</td>
      <td>${b.visible ? '<span class="badge badge-success">ظاهر</span>' : '<span class="badge badge-warning">مخفي</span>'}</td>
      <td>
        <div class="flex gap-2">
          <a href="/admin/audio-books/${b.id}/edit" class="btn btn-outline btn-xs">تعديل</a>
          <form method="POST" action="/admin/audio-books/${b.id}/delete" onsubmit="return confirm('هل أنت متأكد من الحذف؟')" style="display:inline"><button type="submit" class="btn btn-outline btn-xs" style="color:var(--danger);border-color:var(--danger)">حذف</button></form>
        </div>
      </td>
    </tr>`).join('');

  res.send(adminLayout(`
    <div class="admin-topbar"><h1 class="font-display">الكتب الصوتية</h1><a href="/admin/audio-books/new" class="btn btn-primary btn-sm">+ إضافة كتاب صوتي</a></div>
    ${msg}
    ${books.length ? `<div class="admin-table-container" style="overflow-x:auto"><table class="admin-table"><thead><tr><th>الغلاف</th><th>العنوان</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>${rows}</tbody></table></div>` :
      `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3v4z"/><path d="M3 19a2 2 0 0 0 2 2h1v-6H3v4z"/></svg><h3>لا توجد كتب صوتية بعد</h3><p>أضف أول كتاب صوتي من الزر أعلاه</p></div>`}
  `, 'الكتب الصوتية', 'audio_books'));
});

app.get('/admin/audio-books/new', requireAuth, (req, res) => {
  res.send(adminLayout(audioBookForm(), 'إضافة كتاب صوتي', 'audio_books'));
});

app.get('/admin/audio-books/:id/edit', requireAuth, (req, res) => {
  const db = getDb();
  const book = db.prepare('SELECT * FROM audio_books WHERE id = ?').get(req.params.id);
  if (!book) return res.redirect('/admin/audio-books');
  res.send(adminLayout(audioBookForm(book), 'تعديل كتاب صوتي', 'audio_books'));
});

function audioBookForm(book = null) {
  return `
    <div class="admin-topbar"><h1 class="font-display">${book ? 'تعديل كتاب صوتي' : 'إضافة كتاب صوتي جديد'}</h1></div>
    <form method="POST" action="/admin/audio-books${book ? '/' + book.id : ''}" enctype="multipart/form-data" style="max-width:42rem">
      <div class="card p-6 mb-6">
        <div class="form-group"><label class="form-label">عنوان الكتاب</label><input type="text" name="title" class="form-input" required value="${book ? book.title : ''}"></div>
        <div class="form-group"><label class="form-label">اسم المؤلف</label><input type="text" name="author" class="form-input" value="${book ? book.author || '' : ''}" placeholder="اسم المؤلف"></div>
        <div class="form-group"><label class="form-label">وصف مختصر</label><textarea name="description" class="form-textarea" rows="4">${book ? book.description : ''}</textarea></div>

        <div class="form-group">
          <label class="form-label">ملف الصوت (MP3, WAV)</label>
          ${book && book.audio_file ? `<p class="mb-2" style="color:var(--bronze);font-size:.85rem">✓ يوجد ملف مرفوع</p>` : ''}
          <div class="form-file-wrapper"><input type="file" name="audio_file" accept="audio/*" onchange="this.nextElementSibling.innerText = this.files[0].name"><p style="color:var(--muted);font-size:.9rem">اضغط لرفع ملف الصوت</p></div>
        </div>
        <div class="form-group">
          <label class="form-label flex items-center gap-2" style="cursor:pointer">
            <label class="toggle"><input type="checkbox" name="visible" value="1" ${!book || book.visible ? 'checked' : ''}><span class="toggle-slider"></span></label>
            <span style="font-size:.875rem">ظاهر في الموقع</span>
          </label>
        </div>
      </div>
      <div class="flex gap-3"><button type="submit" class="btn btn-primary">حفظ</button><a href="/admin/audio-books" class="btn btn-outline">إلغاء</a></div>
    </form>`;
}

app.post('/admin/audio-books', requireAuth, upload.fields([{ name: 'cover_image', maxCount: 1 }, { name: 'audio_file', maxCount: 1 }]), (req, res) => {
  const db = getDb();
  const cover = req.files?.cover_image?.[0]?.filename || '';
  const audio = req.files?.audio_file?.[0]?.filename || '';
  db.prepare('INSERT INTO audio_books (title, author, description, cover_image, audio_file, visible) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.body.title, req.body.author || '', req.body.description || '', cover, audio, req.body.visible ? 1 : 0
  );
  res.redirect('/admin/audio-books?saved=1');
});

app.post('/admin/audio-books/:id', requireAuth, upload.fields([{ name: 'cover_image', maxCount: 1 }, { name: 'audio_file', maxCount: 1 }]), (req, res) => {
  const db = getDb();
  let sql = "UPDATE audio_books SET title = ?, author = ?, description = ?, visible = ?, updated_at = datetime('now')";
  const params = [req.body.title, req.body.author || '', req.body.description || '', req.body.visible ? 1 : 0];
  if (req.files?.cover_image?.[0]) { sql += ', cover_image = ?'; params.push(req.files.cover_image[0].filename); }
  if (req.files?.audio_file?.[0]) { sql += ', audio_file = ?'; params.push(req.files.audio_file[0].filename); }
  sql += ' WHERE id = ?'; params.push(req.params.id);
  db.prepare(sql).run(...params);
  res.redirect('/admin/audio-books?saved=1');
});

app.post('/admin/audio-books/:id/delete', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM audio_books WHERE id = ?').run(req.params.id);
  res.redirect('/admin/audio-books?deleted=1');
});

// ---- BIOGRAPHY ----
app.get('/admin/biography', requireAuth, (req, res) => {
  const db = getDb();
  const s = getSettings(db);
  const msg = req.query.saved ? '<div class="alert alert-success" data-auto-dismiss>تم الحفظ</div>' : '';
  const content = (s.biography_content || '').replace(/'/g, "\\'").replace(/\n/g, '\\n');

  res.send(adminLayout(`
    <div class="admin-topbar"><h1 class="font-display">السيرة الذاتية</h1></div>
    ${msg}
    <form method="POST" action="/admin/biography" id="bio-form" style="max-width:56rem">
      <div class="card p-6 mb-6">
        <textarea name="content" id="bio-editor" style="min-height:400px;width:100%">${s.biography_content || ''}</textarea>
      </div>
      <button type="submit" class="btn btn-primary">حفظ السيرة الذاتية</button>
    </form>
    <script>
    document.addEventListener('DOMContentLoaded', function() {
      tinymce.init({
        selector: '#bio-editor',
        directionality: 'rtl',
        language: 'ar',
        plugins: 'lists link image code table wordcount pagebreak superscript',
        menubar: 'file edit view insert format tools table',
        mobile: { menubar: true },
        toolbar: 'undo redo | blocks | bold italic underline superscript forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist | link image | pagebreak | islamic',
        toolbar_mode: 'sliding',
        height: 600,
        pagebreak_split_block: true,
        pagebreak_separator: '[PAGE]',
        image_advtab: true,
        image_title: true,
        automatic_uploads: true,
        images_upload_handler: function (blobInfo, progress) {
          return new Promise(function(resolve, reject) {
            var xhr, formData;
            xhr = new XMLHttpRequest();
            xhr.withCredentials = false;
            xhr.open('POST', '/admin/upload-image');
            xhr.onload = function() {
              if (xhr.status < 200 || xhr.status >= 300) { reject('HTTP Error: ' + xhr.status); return; }
              var json = JSON.parse(xhr.responseText);
              if (!json || typeof json.url != 'string') { reject('Invalid JSON: ' + xhr.responseText); return; }
              resolve(json.url);
            };
            xhr.onerror = function () { reject('Image upload failed. Code: ' + xhr.status); };
            formData = new FormData();
            formData.append('image', blobInfo.blob(), blobInfo.filename());
            xhr.send(formData);
          });
        },
        content_style: '@font-face { font-family: "KFGQPC Arabic Symbols 01"; src: url("/fonts/KFGQPC-Symbols1.woff2") format("woff2"), url("/fonts/KFGQPC-Symbols1.woff") format("woff"); } .islamic-sym { font-family: "KFGQPC Arabic Symbols 01", serif; font-size: 1.4em; vertical-align: middle; line-height: 1; } body { font-family: "DecoType Naskh Variants", "Traditional Arabic", "Amiri", "notoNaskhArabic", serif; font-size: 1.125rem; line-height: 1.8; color: #2a2620; text-align: right; direction: rtl; } p { margin-bottom: 1rem; }',
        setup: window.mosawyTinymceSetup
      });
    });
    </script>
  `, 'السيرة الذاتية', 'biography'));
});

app.post('/admin/biography', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run('biography_content', req.body.content || '', req.body.content || '');
  res.redirect('/admin/biography?saved=1');
});

// ---- MESSAGES ----
app.get('/admin/messages', requireAuth, (req, res) => {
  const db = getDb();
  const messages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all();
  const msg = req.query.deleted ? '<div class="alert alert-success" data-auto-dismiss>تم الحذف</div>' : '';

  const rows = messages.map(m => `
    <tr style="cursor:pointer; ${!m.read ? 'background:color-mix(in srgb, var(--bronze) 10%, transparent)' : ''}" onclick="window.location='/admin/messages/${m.id}'">
      <td class="${!m.read ? 'font-bold' : ''}">${escapeHTML(m.name || 'بدون اسم')}</td>
      <td style="color:var(--muted)" class="hide-mobile">${escapeHTML(m.email || '-')}</td>
      <td style="color:var(--muted)">${m.message.length > 50 ? escapeHTML(m.message.substring(0, 50)) + '...' : escapeHTML(m.message)}</td>
      <td style="color:var(--muted)" class="hide-mobile">${m.created_at ? m.created_at.split('T')[0] : ''}</td>
      <td>
        <div class="flex gap-2">
          <a href="/admin/messages/${m.id}" class="btn btn-outline btn-xs" onclick="event.stopPropagation()">عرض</a>
          <form method="POST" action="/admin/messages/${m.id}/delete" onsubmit="event.stopPropagation(); return confirm('هل أنت متأكد من الحذف؟')"><button class="btn btn-danger btn-xs">حذف</button></form>
        </div>
      </td>
    </tr>`).join('');

  res.send(adminLayout(`
    <div class="admin-topbar">
      <h1 class="font-display">الرسائل</h1>
      <input type="text" id="search-msgs" class="form-input" style="max-width:300px" placeholder="ابحث بالاسم أو البريد..." onkeyup="filterMsgs()">
    </div>
    ${msg}
    ${messages.length ? `
    <div class="admin-table-container" style="overflow-x:auto">
      <table class="admin-table" id="msg-table">
        <thead><tr><th>الاسم</th><th class="hide-mobile">البريد</th><th>الرسالة</th><th class="hide-mobile">التاريخ</th><th>إجراءات</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <script>
      function filterMsgs() {
        const q = document.getElementById('search-msgs').value.toLowerCase();
        const rows = document.querySelectorAll('#msg-table tbody tr');
        rows.forEach(r => {
          const text = r.innerText.toLowerCase();
          r.style.display = text.includes(q) ? '' : 'none';
        });
      }
    </script>
    ` : `<div class="empty-state"><h3>لا توجد رسائل</h3><p>ستظهر الرسائل هنا عندما يرسلها الزوار</p></div>`}
  `, 'الرسائل', 'messages'));
});

app.get('/admin/messages/:id', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE messages SET read = 1 WHERE id = ?').run(req.params.id);
  const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!m) return res.redirect('/admin/messages');

  res.send(adminLayout(`
    <div class="admin-topbar">
      <div class="flex items-center gap-4">
        <h1 class="font-display mb-0">رسالة من: ${escapeHTML(m.name || 'بدون اسم')}</h1>
      </div>
      <div class="flex gap-2">
        <a href="/admin/messages" class="btn btn-outline btn-sm">← عودة للرسائل</a>
        ${m.email ? `<a href="mailto:${m.email}" class="btn btn-primary btn-sm">الرد عبر البريد</a>` : ''}
        <form method="POST" action="/admin/messages/${m.id}/delete" onsubmit="return confirm('هل أنت متأكد من الحذف؟')"><button class="btn btn-danger btn-sm">حذف</button></form>
      </div>
    </div>
    <div class="card p-8 mb-6" style="max-width:56rem; border-top: 4px solid var(--bronze); height: max-content;">
      <div class="flex justify-between items-start mb-6 pb-6" style="border-bottom:1px solid var(--line); flex-wrap:wrap; gap: 1rem;">
        <div>
          <p style="color:var(--muted);font-size:.9rem;margin-bottom:.25rem">المرسل</p>
          <strong class="text-lg" style="color:var(--charcoal)">${escapeHTML(m.name || 'بدون اسم')}</strong>
        </div>
        ${m.email ? `<div><p style="color:var(--muted);font-size:.9rem;margin-bottom:.25rem">البريد الإلكتروني</p><strong class="text-lg" style="color:var(--charcoal)">${escapeHTML(m.email)}</strong></div>` : ''}
        <div>
          <p style="color:var(--muted);font-size:.9rem;margin-bottom:.25rem">تاريخ الإرسال</p>
          <strong class="text-lg" style="color:var(--charcoal)">${m.created_at ? new Date(m.created_at).toLocaleString('ar-EG') : ''}</strong>
        </div>
      </div>
      <div>
        <p style="color:var(--muted);font-size:.9rem;margin-bottom:1rem">نص الرسالة:</p>
        <div style="color:var(--ink);font-size:1.15rem;line-height:2;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;background:var(--sand);padding:2rem;border-radius:.75rem; border: 1px solid var(--line); height: max-content;">${escapeHTML(m.message)}</div>
      </div>
    </div>
  `, 'قراءة الرسالة', 'messages'));
});

app.post('/admin/messages/:id/delete', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  res.redirect('/admin/messages?deleted=1');
});

// ==================== PUBLIC ROUTES ====================

// HOME
app.get('/', (req, res) => {
  const db = getDb();
  const s = getSettings(db);
  const books = db.prepare('SELECT * FROM books WHERE visible = 1 ORDER BY created_at DESC LIMIT 20').all();

  // For sections horizontal lists
  const sections = db.prepare('SELECT * FROM sections ORDER BY name').all();
  const sectionsWithArticles = sections.map(sec => {
    sec.articleCount = db.prepare('SELECT COUNT(*) as c FROM articles WHERE section_id = ?').get(sec.id).c;
    return sec;
  }).filter(sec => sec.articleCount > 0);

  const ornamentSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" opacity="0"/><path d="M12 3c.6 0 1.2.1 1.8.2C12.6 4.4 12 6.1 12 8c0 3.3 2.7 6 6 6 .8 0 1.5-.2 2.2-.4-.3 4.1-3.7 7.4-7.9 7.4-4.4 0-8-3.6-8-8 0-4.2 3.3-7.6 7.4-7.9.1 0 .2-.1.3-.1z" opacity="0"/><circle cx="12" cy="12" r="2" opacity="0"/><path d="M3 3 L8 3 Q3 3 3 8" stroke="currentColor" fill="none" stroke-width="1.5"/></svg>';

  const bookCoversContent = books.map(b => `
    <a href="/books/${b.id}" style="flex-shrink:0;width:120px" class="book-cover" data-tilt data-tilt-max="10" data-tilt-glare="true" data-tilt-max-glare="0.3">
      ${b.cover_image ? `<img src="/uploads/${b.cover_image}" alt="${b.title}" style="width:100%;height:160px;object-fit:cover;border-radius:6px">` : `<div style="height:160px;width:100%;display:flex;align-items:center;justify-content:center;padding:8px;text-align:center;font-size:.85rem;color:var(--charcoal);background:var(--paper);border-radius:6px;border:1px solid var(--line)">${b.title}</div>`}
    </a>`).join('');
  const bookCovers = `<div class="marquee-content js-marquee-content" style="display:flex;gap:1rem;flex-shrink:0;">${bookCoversContent}</div>`;
  const bookCoversDuplicated = Array(15).fill(bookCovers).join('');

  const bookCount = books.length || 1;
  const bookDuration = bookCount * 20 * 1.5; // ~1.5s per item

  // Build sections card display
  const sectionsCardsContent = sectionsWithArticles.map(sec => `
    <a href="/sections/${sec.id}" class="section-card" style="padding:1.5rem 0.5rem; min-width: 130px;" data-tilt data-tilt-max="6" data-tilt-glare="true" data-tilt-max-glare="0.15">
      <span class="section-ornament-tl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M4.9 19.1L19.1 4.9"/></svg></span>
      <span class="section-ornament-tr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M4.9 19.1L19.1 4.9"/></svg></span>
      <span class="section-ornament-bl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M4.9 19.1L19.1 4.9"/></svg></span>
      <span class="section-ornament-br"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M4.9 19.1L19.1 4.9"/></svg></span>
      <div class="section-card-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
      </div>
      <div class="section-card-name">${sec.name}</div>
      <div class="section-card-count">${sec.articleCount} بحث</div>
    </a>`).join('');

  const sectionCards = `<div class="marquee-content js-marquee-content" style="display:flex;gap:1rem;flex-shrink:0;">${sectionsCardsContent}</div>`;
  const sectionCardsDuplicated = Array(15).fill(sectionCards).join('');

  const heroTags = (s.hero_tags || 'المكتبة الصوتية, المؤلّفات, الأبحاث والدراسات, الأقسام').split(',').map(tag => tag.trim()).filter(Boolean).map(tag =>
    `<a href="/search?q=${encodeURIComponent(tag)}" style="background:var(--bg);border:1px solid var(--line);color:var(--charcoal);padding:0.35rem 1rem;border-radius:2rem;font-size:0.85rem;text-decoration:none;transition:all 0.2s" onmouseover="this.style.borderColor='var(--bronze)';this.style.color='var(--bronze)'" onmouseout="this.style.borderColor='var(--line)';this.style.color='var(--charcoal)'">${tag}</a>`
  ).join('');

  res.send(publicLayout(`
    <section class="hero">
      <div class="hero-bg" aria-hidden="true"></div>
      <div class="container-x" style="padding-block:2rem">
        <div style="text-align:center;max-width:42rem;margin:0 auto">
          ${s.profile_image ? `<div class="hero-rise floating-element" style="width:120px;height:120px;margin:0 auto 1.5rem;border-radius:50%;overflow:hidden;border:3px solid color-mix(in srgb,var(--bronze) 40%,transparent);box-shadow:0 6px 16px rgba(28,26,23,.14),0 24px 60px rgba(28,26,23,.2)"><img src="/uploads/${s.profile_image}" style="width:100%;height:100%;object-fit:cover"></div>` : ''}
          <div class="title-mask mt-4">
            ${s.site_logo_image ? `<img src="/uploads/${s.site_logo_image}" style="height:140px;max-width:95%;margin:0 auto;object-fit:contain" alt="${s.site_name}">` : `<h1 class="title-mask-inner font-display" style="font-size:clamp(1.75rem,5vw,3rem);color:var(--charcoal)">${s.site_name || 'اسم الموقع'}</h1>`}
          </div>
          <p class="hero-rise mt-3" style="animation-delay:200ms;color:var(--muted);font-size:1.05rem;line-height:1.7">${s.site_description || ''}</p>
          
          <div class="hero-drop mt-6" style="animation-delay:300ms;position:relative;max-width:100%; width: 32rem; margin:2rem auto 0; padding: 0 1rem;">
            <form action="/search" method="GET" style="display:flex;align-items:center;background:var(--paper);border:1px solid var(--line);border-radius:2rem;padding:0.5rem 1rem;box-shadow:0 4px 20px rgba(0,0,0,0.05); width: 100%; box-sizing: border-box;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--muted); flex-shrink: 0;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" name="q" placeholder="ابحث في الموقع..." style="border:none;background:transparent;flex-grow:1;padding:0.5rem 1rem;outline:none;font-size:1rem;color:var(--charcoal); min-width: 0;" required>
              <button type="submit" style="display:flex;align-items:center;gap:0.25rem;background:var(--sand);border:1px solid var(--line);padding:0.25rem 0.5rem;border-radius:0.5rem;font-size:0.75rem;color:var(--muted);font-family:sans-serif;cursor:pointer; flex-shrink: 0;">
                بحث
              </button>
            </form>
          </div>

          <div class="hero-drop mt-6" style="animation-delay:400ms;display:flex;flex-wrap:wrap;justify-content:center;gap:0.5rem;margin-top:1.5rem">
            ${heroTags}
          </div>
        </div>
      </div>
    </section>

    ${books.length ? `
    <section class="reveal" style="background:color-mix(in srgb,var(--sand) 55%,transparent);border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:2rem">
      <div class="container-x section-y-sm">
        <div class="flex items-center justify-between mb-4">
          <div><p style="font-size:.875rem;font-weight:600;color:var(--bronze);margin-bottom:.625rem">المكتبة</p><h2 class="font-display text-3xl" style="color:var(--charcoal)">من مؤلفاتنا</h2></div>
          <a href="/books" style="font-size:.95rem;font-weight:500;color:var(--charcoal)">عرض الكل ←</a>
        </div>
        <div class="marquee-wrap js-marquee" dir="ltr">
          <div class="marquee-track" style="align-items:flex-end; gap: 1rem;">${bookCoversDuplicated}</div>
        </div>
      </div>
    </section>` : ''}

    ${sectionsWithArticles.length ? `
    <section class="reveal" style="background:color-mix(in srgb,var(--sand) 55%,transparent);border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:2rem">
      <div class="container-x section-y-sm">
        <div class="flex items-center justify-between mb-4">
          <div><p style="font-size:.875rem;font-weight:600;color:var(--bronze);margin-bottom:.625rem">تصفح</p><h2 class="font-display text-3xl" style="color:var(--charcoal)">الأقسام</h2></div>
          <a href="/sections" style="font-size:.95rem;font-weight:500;color:var(--charcoal)">عرض الكل ←</a>
        </div>
        <div class="marquee-wrap js-marquee" dir="ltr">
          <div class="marquee-track" style="align-items:center; gap: 1rem;">${sectionCardsDuplicated}</div>
        </div>
      </div>
    </section>` : ''}

    ${!books.length && !sectionsWithArticles.length ? `
    <section class="container-x" style="padding:6rem 0;text-align:center">
      <h2 class="font-display text-2xl" style="color:var(--charcoal);margin-bottom:1rem">مرحباً بكم</h2>
      <p style="color:var(--muted);max-width:28rem;margin:0 auto">${s.site_description || 'الموقع قيد الإعداد. تابعونا قريباً.'}</p>
    </section>` : ''}
  `, s, 'home'));
});

// BOOKS
app.get('/books', (req, res) => {
  const db = getDb();
  const s = getSettings(db);
  const books = db.prepare('SELECT * FROM books WHERE visible = 1 ORDER BY created_at DESC').all();
  const grid = books.map(b => `
    <div class="reveal" style="min-width: 0;">
      <a href="/books/${b.id}" style="text-decoration:none;display:block;min-width:0;">
        <div class="book-cover" style="width:100%" data-tilt data-tilt-max="10" data-tilt-glare="true" data-tilt-max-glare="0.3">${b.cover_image ? `<img src="/uploads/${b.cover_image}" alt="${b.title}">` : `<div style="height:100%;display:flex;align-items:center;justify-content:center;padding:1rem;text-align:center;color:var(--charcoal);font-weight:600">${b.title}</div>`}</div>
        <h3 style="margin-top:.75rem;font-weight:600;font-size:.9rem;color:var(--charcoal);text-align:center;word-break:break-word;overflow-wrap:anywhere;white-space:normal;">${b.title}</h3>
      </a>
    </div>`).join('');

  res.send(publicLayout(`
    <section class="page-header"><div class="page-header-bg"></div><div class="container-x page-header-content">
      <p class="animate-fade-up" style="font-size:.875rem;font-weight:600;color:var(--bronze)">المكتبة</p>
      <div class="title-mask mt-3"><h1 class="title-mask-inner font-display" style="font-size:clamp(2rem,5vw,3rem);color:var(--charcoal)">المؤلّفات</h1></div>
      <span class="rule-grow mt-4 block" style="height:1px;width:7rem;background:linear-gradient(to left,color-mix(in srgb,var(--bronze) 70%,transparent),transparent)"></span>
    </div></section>
    <div class="container-x py-14">
      ${books.length ? `<div class="grid-4">${grid}</div>` : '<div class="empty-state"><h3>لا توجد مؤلفات بعد</h3></div>'}
    </div>
  `, s, 'books'));
});

app.get('/books/:id', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE books SET views = views + 1 WHERE id = ?').run(req.params.id);
  const s = getSettings(db);
  const book = db.prepare('SELECT * FROM books WHERE id = ? AND visible = 1').get(req.params.id);
  if (!book) return res.status(404).send(publicLayout('<div class="container-x py-14 text-center"><h1 class="font-display text-3xl" style="color:var(--charcoal)">الكتاب غير موجود</h1></div>', s));

  res.send(publicLayout(`
    <section class="page-header"><div class="page-header-bg"></div><div class="container-x page-header-content">
      <div style="display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;color:var(--muted);margin-bottom:1rem">
        <a href="/" style="text-decoration:none;color:inherit">العودة للصفحة الرئيسية ←</a>
        <span>&nbsp;/&nbsp;</span>
        <a href="/books" style="text-decoration:none;color:inherit">المؤلّفات</a>
      </div>
      <h1 class="font-display" style="font-size:clamp(1.8rem,4vw,2.5rem);color:var(--charcoal);margin-bottom:0.5rem;word-break:break-word;overflow-wrap:anywhere;">${book.title}</h1>
      ${book.description ? `<p style="font-size:1.1rem;color:var(--muted);margin-bottom:1rem">${book.description}</p>` : ''}
      ${book.author ? `<p style="color:var(--bronze);font-weight:600">${book.author}</p>` : ''}
      
      <div style="display:flex;align-items:center;gap:1.5rem;margin-top:1.5rem;font-size:0.85rem;color:var(--muted)">
        <span style="display:flex;align-items:center;gap:0.25rem"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg> ${book.views} مشاهدة</span>
        <span style="display:flex;align-items:center;gap:0.25rem"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg> ${book.downloads} تحميل</span>
        <button onclick="navigator.share({title:'${book.title}', url:window.location.href})" class="btn btn-outline btn-xs" style="border-radius:2rem">مشاركة <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg></button>
      </div>

      ${book.pdf_file ? `
      <div style="margin-top:2rem;max-width:300px">
        <a href="/books/${book.id}/download" target="_blank" class="btn btn-primary" style="width:100%;justify-content:center;padding:1rem;border-radius:0.5rem;font-size:1.1rem;background:#1a8a5b;border-color:#1a8a5b">تنزيل الكتاب ⬇️</a>
        <p style="text-align:center;font-size:0.75rem;color:var(--muted);margin-top:0.5rem">ملف PDF - يبدأ التنزيل مباشرة</p>
      </div>` : ''}
    </div></section>
    
    <div class="container-x py-14 book-layout">
      <div style="position:sticky;top:2rem;width:100%;">
        <div class="book-cover" data-tilt data-tilt-max="10" data-tilt-glare="true" data-tilt-max-glare="0.4" style="width:100%;max-width:320px;margin:0 auto">${book.cover_image ? `<img src="/uploads/${book.cover_image}" alt="${book.title}">` : `<div style="height:100%;display:flex;align-items:center;justify-content:center;padding:1rem;text-align:center;color:var(--charcoal);font-weight:600">${book.title}</div>`}</div>
        <div style="text-align:center;margin-top:2rem">
          <p style="font-weight:600;font-size:0.9rem;margin-bottom:0.5rem">تطبيق المكتبة - قريباً (App coming soon)</p>
          <p style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem">سيتوفر قريباً تطبيق المكتبة لقراءة الكتب على هاتفك.</p>
          <div style="display:flex;gap:0.5rem;justify-content:center">
            <div style="opacity:0.7"><img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" height="56" style="height:56px; width:auto;" alt="Google Play"></div>
            <div style="opacity:0.7"><img src="https://upload.wikimedia.org/wikipedia/commons/3/3c/Download_on_the_App_Store_Badge.svg" height="56" style="height:56px; width:auto;" alt="App Store"></div>
          </div>
        </div>
      </div>
      <div style="min-width:0;width:100%;">
        ${book.table_of_contents ? `
        <details style="background:var(--paper);border:1px solid var(--line);border-radius:0.5rem;padding:1rem;margin-bottom:2rem;cursor:pointer">
          <summary style="font-weight:600;font-size:1.1rem;display:flex;justify-content:space-between;align-items:center;list-style:none">
            <span>فهرس الكتاب <span style="font-size:0.8rem;color:var(--muted);font-weight:normal">(اضغط لعرض فهرس الكتاب)</span></span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </summary>
          <div class="prose-ar mt-4" style="padding-top:1rem;border-top:1px solid var(--line)">${book.table_of_contents}</div>
        </details>` : ''}
        
        <h2 class="font-display" style="font-size:1.5rem;color:var(--charcoal);margin-bottom:1.5rem;word-break:break-word;overflow-wrap:anywhere;">الكتاب: ${book.title}</h2>
        <div class="prose-ar" style="font-size:1.1rem;line-height:1.8">
          ${book.author ? `<p><strong>المؤلف:</strong> ${book.author}</p><hr>` : ''}
          <h3>مقدمة الكتاب:</h3>
          ${book.description}
        </div>
      </div>
    </div>
  `, s, 'books'));
});

app.get('/books/:id/download', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE books SET downloads = downloads + 1 WHERE id = ?').run(req.params.id);
  const book = db.prepare('SELECT pdf_file FROM books WHERE id = ? AND visible = 1').get(req.params.id);
  if (book && book.pdf_file) {
    res.redirect('/uploads/' + book.pdf_file);
  } else {
    res.status(404).send('File not found');
  }
});

// AUDIO BOOKS
app.get('/audio-books', (req, res) => {
  const db = getDb();
  const s = getSettings(db);
  const audioBooks = db.prepare('SELECT * FROM audio_books WHERE visible = 1 ORDER BY created_at DESC').all();
  const grid = audioBooks.map(b => `
    <div class="reveal">
      <a href="/audio-books/${b.id}" style="text-decoration:none;display:block" class="audio-card">
        <div class="audio-cover" data-tilt data-tilt-max="10" data-tilt-glare="true" data-tilt-max-glare="0.3"><div class="audio-cover-grooves" style="animation: spin-slow 20s linear infinite;"></div><div class="audio-cover-text"><svg viewBox="0 0 100 100" style="position:absolute; inset:0; width:100%; height:100%;"><path id="curve-grid-${b.id}" d="M 50, 50 m -18, 0 a 18,18 0 1,1 36,0 a 18,18 0 1,1 -36,0" fill="none" /><text fill="var(--gold)" font-size="8.5" font-weight="700" text-anchor="middle" font-family="var(--font-serif)"><textPath href="#curve-grid-${b.id}" startOffset="25%">${b.title}</textPath></text></svg></div><div class="audio-cover-hole"></div></div>
        <h3 style="margin-top:1.25rem;font-weight:600;font-size:1rem;color:var(--charcoal);text-align:center">${b.title}</h3>
      </a>
    </div>`).join('');

  res.send(publicLayout(`
    <section class="page-header"><div class="page-header-bg"></div><div class="container-x page-header-content">
      <p class="animate-fade-up" style="font-size:.875rem;font-weight:600;color:var(--bronze)">الكتب الصوتية</p>
      <div class="title-mask mt-3"><h1 class="title-mask-inner font-display" style="font-size:clamp(2rem,5vw,3rem);color:var(--charcoal)">المكتبة الصوتية</h1></div>
      <span class="rule-grow mt-4 block" style="height:1px;width:7rem;background:linear-gradient(to left,color-mix(in srgb,var(--bronze) 70%,transparent),transparent)"></span>
    </div></section>
    <div class="container-x py-14">${audioBooks.length ? `<div class="grid-4">${grid}</div>` : '<div class="empty-state"><h3>لا توجد كتب صوتية بعد</h3></div>'}</div>
  `, s, 'audio-books'));
});

app.get('/audio-books/:id', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE audio_books SET views = views + 1 WHERE id = ?').run(req.params.id);
  const s = getSettings(db);
  const book = db.prepare('SELECT * FROM audio_books WHERE id = ? AND visible = 1').get(req.params.id);
  if (!book) return res.status(404).send(publicLayout('<div class="container-x py-14 text-center"><h1 class="font-display text-3xl" style="color:var(--charcoal)">الكتاب الصوتي غير موجود</h1></div>', s));

  res.send(publicLayout(`
    <section class="page-header"><div class="page-header-bg"></div><div class="container-x page-header-content">
      <div style="display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;color:var(--muted);margin-bottom:1rem">
        <a href="/" style="text-decoration:none;color:inherit" data-pjax>العودة للصفحة الرئيسية ←</a>
        <span>&nbsp;/&nbsp;</span>
        <a href="/audio-books" style="text-decoration:none;color:inherit" data-pjax>الكتب الصوتية</a>
      </div>
      <div class="mt-4">
        <h1 class="font-display" style="font-size:clamp(1.5rem,4vw,2.5rem);color:var(--charcoal);word-break:break-word;overflow-wrap:anywhere;">${book.title}</h1>
      </div>
      
      <!-- Audio Toolbar -->
      <div style="display:flex;gap:0.5rem;margin-top:2rem">
        <button onclick="navigator.share({title:'${book.title}', url:window.location.href})" class="btn btn-outline btn-xs" style="border-radius:2rem">مشاركة <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg></button>
      </div>

    </div></section>
    
    <div class="container-x py-14 book-layout">
      <div style="position:sticky;top:2rem;width:100%;">
        <div class="audio-cover" data-tilt data-tilt-max="10" data-tilt-glare="true" data-tilt-max-glare="0.4" style="width:100%;max-width:320px;margin:0 auto;"><div class="audio-cover-grooves"></div><div class="audio-cover-text"><svg viewBox="0 0 100 100" style="position:absolute; inset:0; width:100%; height:100%;"><path id="curve-single-${book.id}" d="M 50, 50 m -18, 0 a 18,18 0 1,1 36,0 a 18,18 0 1,1 -36,0" fill="none" /><text fill="var(--gold)" font-size="8.5" font-weight="700" text-anchor="middle" font-family="var(--font-serif)"><textPath href="#curve-single-${book.id}" startOffset="25%">${book.title}</textPath></text></svg></div><div class="audio-cover-hole"></div></div>
      </div>
      <div style="min-width:0;width:100%;">
        ${book.audio_file ? `
        <div style="background:var(--paper);border:1px solid var(--line);border-radius:1rem;padding:1.25rem 1rem;margin-bottom:2rem;text-align:center;width:100%;box-sizing:border-box;overflow:hidden;">
          <h3 style="font-weight:600;margin-bottom:1rem;color:var(--charcoal)">الاستماع للكتاب الصوتي</h3>
          <audio controls src="/uploads/${book.audio_file}" style="width:100%;max-width:100%;height:48px"></audio>
          <div style="display:flex; justify-content:center; gap:0.5rem; margin-top:1rem;">
            <button type="button" onclick="const a = this.parentElement.previousElementSibling; a.currentTime = Math.max(0, a.currentTime - 10)" class="btn btn-outline btn-sm" style="border-radius:2rem;padding:0.25rem 0.75rem;font-size:0.85rem">⏪ 10 ثواني</button>
            <button type="button" onclick="const a = this.parentElement.previousElementSibling; a.currentTime = Math.min(a.duration, a.currentTime + 10)" class="btn btn-outline btn-sm" style="border-radius:2rem;padding:0.25rem 0.75rem;font-size:0.85rem">10 ثواني ⏩</button>
          </div>
        </div>` : ''}

        <h2 class="font-display" style="font-size:1.5rem;color:var(--charcoal);margin-bottom:1.5rem;word-break:break-word;overflow-wrap:anywhere;">الكتاب: ${book.title}</h2>
        <div class="prose-ar" style="font-size:1.1rem;line-height:1.8">
          ${book.author ? `<p><strong>المؤلف:</strong> ${book.author}</p><hr>` : ''}
          ${book.description}
        </div>
      </div>
    </div>
  `, s, 'audio-books'));
});

// SEARCH
app.get('/search', (req, res) => {
  const db = getDb();
  const s = getSettings(db);
  const q = req.query.q || '';
  let books = [];
  let audioBooks = [];
  let articles = [];
  if (q) {
    const term = '%' + q + '%';
    books = db.prepare('SELECT * FROM books WHERE visible = 1 AND (title LIKE ? OR description LIKE ?)').all(term, term);
    audioBooks = db.prepare('SELECT * FROM audio_books WHERE visible = 1 AND (title LIKE ? OR description LIKE ?)').all(term, term);
    articles = db.prepare('SELECT a.*, s.name as section_name FROM articles a LEFT JOIN sections s ON a.section_id = s.id WHERE a.title LIKE ? OR a.excerpt LIKE ? OR a.content LIKE ? OR a.tags LIKE ? OR s.name LIKE ?').all(term, term, term, term, term);
  }

  const bookHtml = books.map(b => `
    <div class="reveal">
      <a href="/books/${b.id}" style="text-decoration:none;display:block">
        <div class="book-cover" data-tilt data-tilt-max="10" data-tilt-glare="true" data-tilt-max-glare="0.3">${b.cover_image ? `<img src="/uploads/${b.cover_image}" alt="${b.title}">` : `<div style="height:100%;display:flex;align-items:center;justify-content:center;padding:1rem;text-align:center;color:var(--charcoal);font-weight:600">${b.title}</div>`}</div>
        <h3 style="margin-top:.75rem;font-weight:600;font-size:.9rem;color:var(--charcoal);text-align:center;word-break:break-word;overflow-wrap:anywhere;">${b.title}</h3>
      </a>
    </div>`).join('');

  const audioBookHtml = audioBooks.map(b => `
    <div class="reveal">
      <a href="/audio-books/${b.id}" style="text-decoration:none;display:block" class="audio-card">
        <div class="audio-cover" data-tilt data-tilt-max="10" data-tilt-glare="true" data-tilt-max-glare="0.3"><div class="audio-cover-grooves" style="animation: spin-slow 20s linear infinite;"></div><div class="audio-cover-text"><svg viewBox="0 0 100 100" style="position:absolute; inset:0; width:100%; height:100%;"><path id="curve-grid-search-${b.id}" d="M 50, 50 m -18, 0 a 18,18 0 1,1 36,0 a 18,18 0 1,1 -36,0" fill="none" /><text fill="var(--gold)" font-size="8.5" font-weight="700" text-anchor="middle" font-family="var(--font-serif)"><textPath href="#curve-grid-search-${b.id}" startOffset="25%">${b.title}</textPath></text></svg></div><div class="audio-cover-hole"></div></div>
        <h3 style="margin-top:1.25rem;font-weight:600;font-size:1rem;color:var(--charcoal);text-align:center">${b.title}</h3>
      </a>
    </div>`).join('');

  const articleHtml = articles.map(a => `
    <div class="reveal">
      <a href="/articles/${a.id}" style="text-decoration:none;display:block" data-tilt data-tilt-max="5" data-tilt-glare="true" data-tilt-max-glare="0.2">
        <div class="article-cover">
          <span class="ornament-tl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3L10 3Q3 3 3 10"/></svg></span>
          <span class="ornament-tr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3L10 3Q3 3 3 10"/></svg></span>
          <span class="ornament-bl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3L10 3Q3 3 3 10"/></svg></span>
          <span class="ornament-br"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3L10 3Q3 3 3 10"/></svg></span>
          <div class="article-cover-title">${a.title}</div>
          ${a.section_name ? `<div class="article-cover-badge">${a.section_name}</div>` : ''}
        </div>
        <h3 class="font-display" style="font-size:1.125rem;color:var(--charcoal);margin-bottom:.5rem;text-align:center;word-break:break-word;overflow-wrap:anywhere;">${a.title}</h3>
      </a>
    </div>`).join('');

  res.send(publicLayout(`
    <section class="page-header"><div class="page-header-bg"></div><div class="container-x page-header-content">
      <p class="animate-fade-up" style="font-size:.875rem;font-weight:600;color:var(--bronze)">نتائج البحث</p>
      <div class="title-mask mt-3"><h1 class="title-mask-inner font-display" style="font-size:clamp(1.5rem,4vw,2.5rem);color:var(--charcoal)">بحث عن: "${q}"</h1></div>
    </div></section>
    <div class="container-x py-14">
      ${!books.length && !audioBooks.length && !articles.length ? '<div class="empty-state"><h3>لم يتم العثور على نتائج</h3></div>' : ''}
      ${books.length ? `
        <h2 class="font-display mb-6" style="font-size:1.5rem;color:var(--charcoal)">المؤلفات (${books.length})</h2>
        <div class="grid-4 mb-14">${bookHtml}</div>
      ` : ''}
      ${audioBooks.length ? `
        <h2 class="font-display mb-6" style="font-size:1.5rem;color:var(--charcoal)">الكتب الصوتية (${audioBooks.length})</h2>
        <div class="grid-4 mb-14">${audioBookHtml}</div>
      ` : ''}
      ${articles.length ? `
        <h2 class="font-display mb-6" style="font-size:1.5rem;color:var(--charcoal)">الأبحاث والدراسات (${articles.length})</h2>
        <div class="grid-5">${articleHtml}</div>
      ` : ''}
    </div>
  `, s, 'search'));
});

// ARTICLES
app.get('/articles', (req, res) => {
  const db = getDb();
  const s = getSettings(db);
  const articles = db.prepare('SELECT a.*, s.name as section_name FROM articles a LEFT JOIN sections s ON a.section_id = s.id ORDER BY a.created_at DESC').all();
  const grid = articles.map(a => `
    <div class="reveal">
      <a href="/articles/${a.id}" style="text-decoration:none;display:block" data-tilt data-tilt-max="5" data-tilt-glare="true" data-tilt-max-glare="0.2">
        <div class="article-cover">
          <span class="ornament-tl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3L10 3Q3 3 3 10"/></svg></span>
          <span class="ornament-tr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3L10 3Q3 3 3 10"/></svg></span>
          <span class="ornament-bl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3L10 3Q3 3 3 10"/></svg></span>
          <span class="ornament-br"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3L10 3Q3 3 3 10"/></svg></span>
          <div class="article-cover-title">${a.title}</div>
          ${a.section_name ? `<div class="article-cover-badge">${a.section_name}</div>` : ''}
        </div>
        <h3 class="font-display" style="font-size:1.125rem;color:var(--charcoal);margin-bottom:.5rem;text-align:center;word-break:break-word;overflow-wrap:anywhere;">${a.title}</h3>
      </a>
    </div>`).join('');

  res.send(publicLayout(`
    <section class="page-header"><div class="page-header-bg"></div><div class="container-x page-header-content">
      <p class="animate-fade-up" style="font-size:.875rem;font-weight:600;color:var(--bronze)">الأبحاث والدراسات</p>
      <div class="title-mask mt-3"><h1 class="title-mask-inner font-display" style="font-size:clamp(2rem,5vw,3rem);color:var(--charcoal)">الأبحاث والدراسات</h1></div>
      <span class="rule-grow mt-4 block" style="height:1px;width:7rem;background:linear-gradient(to left,color-mix(in srgb,var(--bronze) 70%,transparent),transparent)"></span>
    </div></section>
    <div class="container-x py-14">${articles.length ? `<div class="grid-5">${grid}</div>` : '<div class="empty-state"><h3>لا توجد أبحاث بعد</h3></div>'}</div>
  `, s, 'articles'));
});

app.get('/articles/:id', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE articles SET views = views + 1 WHERE id = ?').run(req.params.id);
  const s = getSettings(db);
  const article = db.prepare('SELECT a.*, s.name as section_name FROM articles a LEFT JOIN sections s ON a.section_id = s.id WHERE a.id = ?').get(req.params.id);
  if (!article) return res.status(404).send(publicLayout('<div class="container-x py-14 text-center"><h1 class="font-display text-3xl" style="color:var(--charcoal)">المقال غير موجود</h1></div>', s));

  // Handle pages
  let pages = [];
  if (article.content) {
    pages = article.content.split(/(?:<p>)?\[PAGE\](?:<\/p>)?|<!--\s*PAGE_BREAK\s*-->/g);
  }

  const currentPageIndex = parseInt(req.query.page) || 1;
  const currentPageContent = pages[currentPageIndex - 1] || pages[0] || '';
  const totalPages = pages.length;

  let paginationHtml = '';
  if (totalPages > 1) {
    paginationHtml = '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:3rem;padding-top:2rem;border-top:1px solid var(--line)">';
    if (currentPageIndex < totalPages) {
      paginationHtml += `<a href="/articles/${article.id}?page=${currentPageIndex + 1}" class="btn btn-primary" data-pjax>الصفحة التالية ←</a>`;
    } else {
      paginationHtml += `<div></div>`;
    }
    paginationHtml += `<span style="font-size:0.9rem;color:var(--muted)">صفحة ${currentPageIndex} من ${totalPages}</span>`;
    if (currentPageIndex > 1) {
      paginationHtml += `<a href="/articles/${article.id}?page=${currentPageIndex - 1}" class="btn btn-outline" data-pjax>→ الصفحة السابقة</a>`;
    } else {
      paginationHtml += `<div></div>`;
    }
    paginationHtml += '</div>';
  }

  let extraHtml = '';

  res.send(publicLayout(`
    <section class="page-header"><div class="page-header-bg"></div><div class="container-x page-header-content">
      <div style="display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;color:var(--muted);margin-bottom:1rem">
        <a href="/" style="text-decoration:none;color:inherit" data-pjax>العودة للصفحة الرئيسية ←</a>
        <span>&nbsp;/&nbsp;</span>
        <a href="/articles" style="text-decoration:none;color:inherit" data-pjax>الأبحاث والدراسات</a>
      </div>
      <div class="mt-4">
        <h1 class="font-display" style="font-size:clamp(1.5rem,4vw,2.5rem);color:var(--charcoal);word-break:break-word;overflow-wrap:anywhere;">${article.title}</h1>
        <div style="display:flex;align-items:center;gap:1.5rem;margin-top:1rem;font-size:.85rem;color:var(--muted)">
          <span style="display:flex;align-items:center;gap:0.25rem"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg> ${article.views} قراءة</span>
          <span style="display:flex;align-items:center;gap:0.25rem"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${article.created_at ? article.created_at.split('T')[0] : ''}</span>
          ${article.section_name ? `<span class="badge" style="background:var(--bronze);color:white;border:none">${article.section_name}</span>` : ''}
        </div>
      </div>
    </div></section>
    
    <div class="container-x py-14" style="max-width:860px;margin:0 auto">
      
      <!-- Article Toolbar -->
      <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:2rem;padding-bottom:1rem;border-bottom:1px solid var(--line);align-items:center;">
        <div style="display:flex;align-items:center;gap:2px;background:var(--paper);border:1px solid var(--line);border-radius:0.5rem;padding:0.1rem;margin-left:0.5rem">
          <button onclick="let b=document.getElementById('article-body'); let s=parseFloat(window.getComputedStyle(b).fontSize); b.style.fontSize=(s+2)+'px';" class="btn btn-sm" style="background:transparent;border:none;color:var(--charcoal);padding:0.25rem 0.5rem" title="تكبير الخط">A+</button>
          <div style="width:1px;height:16px;background:var(--line)"></div>
          <button onclick="document.getElementById('article-body').style.fontSize = ''" class="btn btn-sm" style="background:transparent;border:none;color:var(--charcoal);padding:0.25rem 0.5rem" title="الخط الافتراضي">A</button>
          <div style="width:1px;height:16px;background:var(--line)"></div>
          <button onclick="let b=document.getElementById('article-body'); let s=parseFloat(window.getComputedStyle(b).fontSize); b.style.fontSize=(s-2)+'px';" class="btn btn-sm" style="background:transparent;border:none;color:var(--charcoal);padding:0.25rem 0.5rem" title="تصغير الخط">A-</button>
        </div>
        <button onclick="window.print()" class="btn btn-outline btn-sm" title="طباعة / PDF"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>
        <button onclick="navigator.share({title:'${article.title}', url:window.location.href})" class="btn btn-outline btn-sm" title="مشاركة"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg></button>
        ${article.pdf_file ? `<a href="/uploads/${article.pdf_file}" target="_blank" class="btn btn-outline btn-sm" style="color:#1a8a5b;border-color:#1a8a5b"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg> تنزيل PDF</a>` : ''}
      </div>
      
      ${article.audio_file ? `
      <div style="margin-bottom:2rem;background:color-mix(in srgb,var(--sand) 50%,transparent);border:1px solid var(--line);border-radius:1rem;padding:1.5rem;display:flex;flex-direction:column;align-items:center;gap:1rem">
        <div style="font-weight:600;color:var(--charcoal);font-size:1.1rem">🔊 استمع للمقال: ${article.title}</div>
        <audio controls src="/uploads/${article.audio_file}" style="width:100%;max-width:500px;height:40px"></audio>
        <div style="display:flex; justify-content:center; gap:0.5rem; margin-top:0.5rem;">
          <button type="button" onclick="const a = this.parentElement.previousElementSibling; a.currentTime = Math.max(0, a.currentTime - 10)" class="btn btn-outline btn-sm" style="border-radius:2rem;padding:0.25rem 0.75rem;font-size:0.85rem">⏪ 10 ثواني</button>
          <button type="button" onclick="const a = this.parentElement.previousElementSibling; a.currentTime = Math.min(a.duration, a.currentTime + 10)" class="btn btn-outline btn-sm" style="border-radius:2rem;padding:0.25rem 0.75rem;font-size:0.85rem">10 ثواني ⏩</button>
        </div>
      </div>` : ''}

      <div id="article-body" class="prose-ar" style="transition:font-size 0.3s">${currentPageContent}</div>
      ${paginationHtml}
      
      ${article.footnotes ? `
      <div style="margin-top:4rem;padding-top:2rem;border-top:2px solid var(--line);background:var(--sand);padding:2rem;border-radius:1rem;box-shadow:inset 0 2px 4px rgba(0,0,0,0.02)">
        <h4 style="font-family:var(--font-display);font-size:1.1rem;color:var(--charcoal);margin-bottom:1.5rem;display:flex;align-items:center;gap:0.5rem"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> الحواشي والمراجع</h4>
        <div class="prose-ar" style="font-size:0.95rem;color:var(--muted)">${article.footnotes}</div>
      </div>
      ` : ''}
      
      ${article.tags ? `
      <div style="margin-top:3rem;padding-top:2rem;border-top:1px solid var(--line)">
        <h4 style="font-size:0.9rem;color:var(--muted);margin-bottom:1rem">الوسوم:</h4>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
          ${article.tags.split(',').map(tag => `<a href="/search?q=${encodeURIComponent(tag.trim())}" style="background:var(--beige);padding:0.25rem 0.75rem;border-radius:2rem;font-size:0.85rem;color:var(--charcoal);text-decoration:none">#${tag.trim()}</a>`).join('')}
        </div>
      </div>` : ''}
    </div>
  `, s, 'articles', extraHtml));
});

// SECTIONS
app.get('/sections', (req, res) => {
  const db = getDb();
  const s = getSettings(db);
  const sections = db.prepare('SELECT s.*, (SELECT COUNT(*) FROM articles WHERE section_id = s.id) as article_count FROM sections s ORDER BY sort_order').all();
  const grid = sections.map(sec => `
    <div class="reveal" style="height: 100%;">
      <a href="/sections/${sec.id}" class="section-card" style="width: 100%; height: 100%;">
        <div class="section-card-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
        </div>
        <div class="section-card-name">${sec.name}</div>
        <div class="section-card-count">${sec.article_count} بحث</div>
        ${sec.description ? `<p style="margin-top:1rem;color:rgba(220,195,145,0.8);font-size:0.9rem;line-height:1.5;z-index:2;position:relative;">${sec.description}</p>` : ''}
      </a>
    </div>`).join('');

  res.send(publicLayout(`
    <section class="page-header"><div class="page-header-bg"></div><div class="container-x page-header-content">
      <p class="animate-fade-up" style="font-size:.875rem;font-weight:600;color:var(--bronze)">تصفّح</p>
      <div class="title-mask mt-3"><h1 class="title-mask-inner font-display" style="font-size:clamp(2rem,5vw,3rem);color:var(--charcoal)">الأقسام المعرفية</h1></div>
      <span class="rule-grow mt-4 block" style="height:1px;width:7rem;background:linear-gradient(to left,color-mix(in srgb,var(--bronze) 70%,transparent),transparent)"></span>
    </div></section>
    <div class="container-x py-14">${sections.length ? `<div class="grid-3">${grid}</div>` : '<div class="empty-state"><h3>لا توجد أقسام بعد</h3></div>'}</div>
  `, s, 'sections'));
});

app.get('/sections/:id', (req, res) => {
  const db = getDb();
  const s = getSettings(db);
  const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(req.params.id);
  if (!section) return res.status(404).send(publicLayout('<div class="container-x py-14 text-center"><h1>القسم غير موجود</h1></div>', s));
  const articles = db.prepare('SELECT * FROM articles WHERE section_id = ? ORDER BY created_at DESC').all(req.params.id);
  const grid = articles.map(a => `
    <div class="reveal">
      <a href="/articles/${a.id}" style="text-decoration:none;display:block" data-tilt data-tilt-max="5" data-tilt-glare="true" data-tilt-max-glare="0.2">
        <div class="article-cover">
          <span class="ornament-tl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3L10 3Q3 3 3 10"/></svg></span>
          <span class="ornament-tr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3L10 3Q3 3 3 10"/></svg></span>
          <span class="ornament-bl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3L10 3Q3 3 3 10"/></svg></span>
          <span class="ornament-br"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3L10 3Q3 3 3 10"/></svg></span>
          <div class="article-cover-title">${a.title}</div>
          <div class="article-cover-badge">${section.name}</div>
        </div>
      </a>
    </div>`).join('');

  res.send(publicLayout(`
    <section class="page-header"><div class="page-header-bg"></div><div class="container-x page-header-content">
      <a href="/sections" style="font-size:.875rem;font-weight:500;color:var(--muted)">← العودة للأقسام</a>
      <h1 class="font-display mt-4" style="font-size:clamp(2rem,5vw,3rem);color:var(--charcoal)">${section.name}</h1>
      ${section.description ? `<p style="color:var(--muted);margin-top:.5rem">${section.description}</p>` : ''}
    </div></section>
    <div class="container-x py-14">${articles.length ? `<div class="grid-5">${grid}</div>` : '<div class="empty-state"><h3>لا توجد مقالات في هذا القسم</h3></div>'}</div>
  `, s, 'sections'));
});

// Q&A
app.get('/qa', (req, res) => {
  const db = getDb();
  const s = getSettings(db);
  const published = db.prepare('SELECT * FROM questions WHERE published = 1 ORDER BY created_at DESC').all();
  const msg = req.query.sent ? '<div class="alert alert-success" data-auto-dismiss>تم إرسال سؤالك بنجاح. سيتم الرد عليه قريباً إن شاء الله.</div>' : '';

  const grouped = {};
  for (const q of published) {
    const cat = q.category || 'عام';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(q);
  }

  const items = Object.entries(grouped).map(([cat, qs]) => `
    <div class="mb-10 reveal">
      <h2 class="font-display text-xl mb-4" style="color:var(--charcoal);border-bottom:2px solid var(--line);padding-bottom:0.5rem;display:inline-block">${cat}</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:1.5rem">
        ${qs.map(q => `
          <div class="card p-5" style="box-shadow:0 4px 12px rgba(0,0,0,0.03)">
            <div style="font-weight:600;color:var(--charcoal);margin-bottom:0.5rem;font-size:1.05rem;line-height:1.5">${q.question}</div>
            <div style="font-size:0.8rem;color:var(--muted);margin-bottom:1rem">${q.asker_name || 'سائل'} — ${q.created_at ? q.created_at.split('T')[0] : ''}</div>
            ${q.answer ? `<div style="background:color-mix(in srgb,var(--sand) 50%,transparent);padding:1rem;border-radius:0.5rem;color:var(--ink);border-right:3px solid var(--bronze);font-size:0.95rem;line-height:1.7"><strong>الجواب:</strong><br>${q.answer}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  res.send(publicLayout(`
    <section class="page-header"><div class="page-header-bg"></div><div class="container-x page-header-content">
      <p class="animate-fade-up" style="font-size:.875rem;font-weight:600;color:var(--bronze)">سؤال وجواب</p>
      <div class="title-mask mt-3"><h1 class="title-mask-inner font-display" style="font-size:clamp(2rem,5vw,3rem);color:var(--charcoal)">أسئلة وردود</h1></div>
      <span class="rule-grow mt-4 block" style="height:1px;width:7rem;background:linear-gradient(to left,color-mix(in srgb,var(--bronze) 70%,transparent),transparent)"></span>
    </div></section>
    <div class="container-x py-14">
      ${msg}
      <div style="display:grid;grid-template-columns:1fr;gap:3rem">
        
        <!-- Questions Side -->
        <div style="order:2">
          ${published.length ? items : '<div class="empty-state"><h3>لا توجد أسئلة منشورة بعد</h3></div>'}
        </div>

        <!-- Form Side -->
        <div style="order:1">
          <div class="card p-6" style="background:var(--paper);border-color:color-mix(in srgb,var(--bronze) 20%,transparent)">
            <h3 class="font-display text-lg mb-4" style="color:var(--charcoal)">أرسل سؤالك</h3>
            <p style="color:var(--muted);font-size:0.9rem;margin-bottom:1.5rem">نستقبل أسئلتكم واستفساراتكم لنجيب عليها بإذن الله.</p>
            <form method="POST" action="/qa">
              <div class="form-group"><label class="form-label">اسمك (اختياري)</label><input type="text" name="asker_name" class="form-input"></div>
              <div class="form-group"><label class="form-label">سؤالك</label><textarea name="question" class="form-textarea" required rows="4" placeholder="اكتب سؤالك هنا..."></textarea></div>
              <button type="submit" class="btn btn-primary w-full justify-center">إرسال السؤال</button>
            </form>
          </div>
        </div>

      </div>
    </div>
    <style>
      @media (min-width: 992px) {
        .container-x > div > div { grid-template-columns: 2.5fr 1fr !important; }
        .container-x > div > div > div:nth-child(1) { order: 1 !important; }
        .container-x > div > div > div:nth-child(2) { order: 2 !important; position: sticky; top: 2rem; align-self: start; }
      }
    </style>
  `, s, 'qa'));
});

app.post('/qa', (req, res) => {
  getDb().prepare('INSERT INTO questions (asker_name, question) VALUES (?, ?)').run(req.body.asker_name || '', req.body.question);
  res.redirect('/qa?sent=1');
});

// BIOGRAPHY
app.get('/biography', (req, res) => {
  const db = getDb();
  const s = getSettings(db);
  res.send(publicLayout(`
    <section class="page-header"><div class="page-header-bg"></div><div class="container-x page-header-content">
      <p class="animate-fade-up" style="font-size:.875rem;font-weight:600;color:var(--bronze)">تعرّف</p>
      <div class="title-mask mt-3"><h1 class="title-mask-inner font-display" style="font-size:clamp(2rem,5vw,3rem);color:var(--charcoal)">السيرة الذاتية</h1></div>
      <span class="rule-grow mt-4 block" style="height:1px;width:7rem;background:linear-gradient(to left,color-mix(in srgb,var(--bronze) 70%,transparent),transparent)"></span>
    </div></section>
    <div class="container-x py-14" style="max-width:860px;margin:0 auto">
      ${s.profile_image ? `<div style="margin-bottom:2rem;text-align:center"><img src="/uploads/${s.profile_image}" style="width:160px;height:160px;border-radius:50%;object-fit:cover;border:3px solid var(--line);margin:0 auto"></div>` : ''}
      <div class="prose-ar">${s.biography_content || '<p style="text-align:center;color:var(--muted)">لم تتم إضافة السيرة بعد.</p>'}</div>
    </div>
  `, s, 'biography'));
});

// CONTACT
app.get('/contact', (req, res) => {
  const db = getDb();
  const s = getSettings(db);
  const msg = req.query.sent ? '<div class="alert alert-success" data-auto-dismiss>تم إرسال رسالتك بنجاح. شكراً لتواصلكم.</div>' : '';

  res.send(publicLayout(`
    <section class="page-header"><div class="page-header-bg"></div><div class="container-x page-header-content">
      <p class="animate-fade-up" style="font-size:.875rem;font-weight:600;color:var(--bronze)">تواصل</p>
      <div class="title-mask mt-3"><h1 class="title-mask-inner font-display" style="font-size:clamp(2rem,5vw,3rem);color:var(--charcoal)">تواصل معنا</h1></div>
      <span class="rule-grow mt-4 block" style="height:1px;width:7rem;background:linear-gradient(to left,color-mix(in srgb,var(--bronze) 70%,transparent),transparent)"></span>
    </div></section>
    <div class="container-x py-14" style="max-width:42rem;margin:0 auto">
      ${msg}
      <div class="card p-6">
        <form method="POST" action="/contact">
          <div class="form-group"><label class="form-label">الاسم</label><input type="text" name="name" class="form-input" required></div>
          <div class="form-group"><label class="form-label">البريد الإلكتروني</label><input type="email" name="email" class="form-input" dir="ltr"></div>
          <div class="form-group"><label class="form-label">الرسالة</label><textarea name="message" class="form-textarea" required rows="6" placeholder="اكتب رسالتك هنا..."></textarea></div>
          <button type="submit" class="btn btn-primary">إرسال الرسالة</button>
        </form>
      </div>
      ${s.contact_email ? `<p style="margin-top:2rem;text-align:center;color:var(--muted);font-size:.9rem">أو راسلنا مباشرة على: <a href="mailto:${s.contact_email}" style="color:var(--bronze)">${s.contact_email}</a></p>` : ''}
    </div>
  `, s, 'contact'));
});

app.post('/contact', contactLimiter, (req, res) => {
  getDb().prepare('INSERT INTO messages (name, email, message) VALUES (?, ?, ?)').run(req.body.name || '', req.body.email || '', req.body.message);
  res.redirect('/contact?sent=1');
});

// ==================== START ====================
app.listen(PORT, () => {
  console.log(`\n  🟢  CMS running at http://localhost:${PORT}/`);
  console.log(`  🔐  Admin panel at http://localhost:${PORT}/admin/login`);
  console.log(`  📝  Default login: admin / admin123\n`);
});
