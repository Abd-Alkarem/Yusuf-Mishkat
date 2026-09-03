const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const DB_PATH = path.join(STORAGE_DIR, 'data.db');
const SEED_DB_PATH = path.join(__dirname, '..', 'data.db');
let db;

function getDb() {
  if (!db) {
    if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
    
    // Auto-seed database from repo into empty volume
    if (!fs.existsSync(DB_PATH) && fs.existsSync(SEED_DB_PATH)) {
      fs.copyFileSync(SEED_DB_PATH, DB_PATH);
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      cover_image TEXT DEFAULT '',
      pdf_file TEXT DEFAULT '',
      visible INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      downloads INTEGER DEFAULT 0,
      table_of_contents TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      excerpt TEXT DEFAULT '',
      content TEXT DEFAULT '',
      cover_image TEXT DEFAULT '',
      section_id INTEGER DEFAULT NULL,
      views INTEGER DEFAULT 0,
      tags TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT 'layers',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asker_name TEXT DEFAULT '',
      question TEXT NOT NULL,
      answer TEXT DEFAULT '',
      published INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT '',
      email TEXT DEFAULT '',
      message TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audio_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT DEFAULT '',
      description TEXT DEFAULT '',
      audio_file TEXT DEFAULT '',
      cover_image TEXT DEFAULT '',
      visible INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS benefits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      tags TEXT DEFAULT "",
      visible INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audio_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      audio_file TEXT,
      pdf_file TEXT,
      cover_image TEXT,
      tags TEXT DEFAULT "",
      visible INTEGER DEFAULT 1,
      views INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE,
      keys_p256dh TEXT NOT NULL,
      keys_auth TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Run migrations for new columns if they don't exist
  try { db.exec('ALTER TABLE books ADD COLUMN views INTEGER DEFAULT 0'); } catch(e) {}
  try { db.exec('ALTER TABLE books ADD COLUMN downloads INTEGER DEFAULT 0'); } catch(e) {}
  try { db.exec('ALTER TABLE books ADD COLUMN table_of_contents TEXT DEFAULT ""'); } catch(e) {}
  try { db.exec('ALTER TABLE articles ADD COLUMN views INTEGER DEFAULT 0'); } catch(e) {}
  try { db.exec('ALTER TABLE articles ADD COLUMN tags TEXT DEFAULT ""'); } catch(e) {}
  try { db.exec('ALTER TABLE articles ADD COLUMN audio_file TEXT DEFAULT ""'); } catch(e) {}
  try { db.exec('ALTER TABLE articles ADD COLUMN pdf_file TEXT DEFAULT ""'); } catch(e) {}
  try { db.exec('ALTER TABLE articles ADD COLUMN footnotes TEXT DEFAULT ""'); } catch(e) {}
  try { db.exec('ALTER TABLE audio_books ADD COLUMN pdf_file TEXT DEFAULT ""'); } catch(e) {}
  try { db.exec('ALTER TABLE audio_books ADD COLUMN tags TEXT DEFAULT ""'); } catch(e) {}
  try { db.exec('ALTER TABLE books ADD COLUMN tags TEXT DEFAULT ""'); } catch(e) {}

  // Seed default admin if not exists
  const adminExists = db.prepare('SELECT id FROM admin LIMIT 1').get();
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO admin (id, username, password_hash) VALUES (1, ?, ?)').run('admin', hash);
  }

  const defaults = {
    site_name: 'اسم الموقع',
    site_description: 'موقعٌ علميٌّ فكريّ',
    profile_image: '',
    site_logo_image: '',
    biography_content: '',
    contact_email: '',
    social_youtube: '',
    social_twitter: '',
    social_instagram: '',
    social_telegram: ''
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaults)) {
    insertSetting.run(key, value);
  }
}

module.exports = { getDb };
