const { getDb } = require('./db');

function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  return res.redirect('/admin/login');
}

function loadSettings(req, res, next) {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  req.settings = {};
  for (const row of rows) {
    req.settings[row.key] = row.value;
  }
  next();
}

module.exports = { requireAuth, loadSettings };
