const db = require('better-sqlite3')('data.db');
try { db.exec("ALTER TABLE questions ADD COLUMN category TEXT DEFAULT 'عام'"); } catch (e) { console.log(e.message); }
console.log("Migration done.");
