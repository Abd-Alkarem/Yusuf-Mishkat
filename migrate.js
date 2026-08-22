const db = require('better-sqlite3')('data.db');
try { db.exec("ALTER TABLE books ADD COLUMN author TEXT"); } catch (e) { console.log(e.message); }
try { db.exec("ALTER TABLE settings ADD COLUMN hero_tags TEXT"); } catch (e) { console.log(e.message); }
console.log("Migration done.");
