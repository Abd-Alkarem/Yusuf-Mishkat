const Database = require('better-sqlite3');
const db = new Database('data.db');

try {
  // 1. Add pdf_file to articles
  db.prepare('ALTER TABLE articles ADD COLUMN pdf_file TEXT DEFAULT ""').run();
  console.log("Added pdf_file to articles");
} catch (e) {
  console.log("pdf_file already exists in articles or error:", e.message);
}

try {
  // 2. Create audio_books table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS audio_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT,
      description TEXT,
      cover_image TEXT,
      audio_file TEXT,
      visible INTEGER DEFAULT 1,
      views INTEGER DEFAULT 0,
      downloads INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  console.log("Created audio_books table");
} catch (e) {
  console.log("Error creating audio_books:", e.message);
}

try {
  // 3. Drop questions table
  db.prepare('DROP TABLE IF EXISTS questions').run();
  console.log("Dropped questions table");
} catch (e) {
  console.log("Error dropping questions:", e.message);
}

console.log("Database update complete.");
