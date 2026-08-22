const db = require('better-sqlite3')('data.db');
try { db.exec("ALTER TABLE articles ADD COLUMN audio_file TEXT"); } catch (e) { console.log(e.message); }
try { db.exec("ALTER TABLE settings ADD COLUMN site_logo_dark TEXT"); } catch (e) { console.log(e.message); }
console.log("Migration done.");
