const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'hospital.db');

const db = new Database(DB_PATH);

// Sensible defaults for a small-to-medium app
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
