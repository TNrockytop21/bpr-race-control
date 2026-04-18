/**
 * Steward account database — SQLite via better-sqlite3.
 * Stores steward credentials, roles, and active status.
 * Admin creates accounts via admin-cli.js.
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'stewards.db');
const SALT_ROUNDS = 10;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS stewards (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'SUPPORT',
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    active INTEGER NOT NULL DEFAULT 1
  )
`);

/**
 * Create a new steward account.
 * @returns {{ id, email, name, role }} the created steward (no password)
 */
function createSteward(email, name, password, role = 'SUPPORT') {
  const id = crypto.randomUUID();
  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);

  const stmt = db.prepare(
    'INSERT INTO stewards (id, email, name, passwordHash, role) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(id, email.toLowerCase().trim(), name, passwordHash, role.toUpperCase());

  return { id, email: email.toLowerCase().trim(), name, role: role.toUpperCase() };
}

/**
 * Get steward by email.
 * @returns {object|null} full steward record including passwordHash
 */
function getStewardByEmail(email) {
  return db.prepare('SELECT * FROM stewards WHERE email = ? AND active = 1')
    .get(email.toLowerCase().trim()) || null;
}

/**
 * Get steward by ID.
 */
function getStewardById(id) {
  return db.prepare('SELECT id, email, name, role, createdAt, active FROM stewards WHERE id = ?')
    .get(id) || null;
}

/**
 * Verify email + password. Returns steward info (without hash) or null.
 */
function verifySteward(email, password) {
  const steward = getStewardByEmail(email);
  if (!steward) return null;
  if (!bcrypt.compareSync(password, steward.passwordHash)) return null;
  // Return without password hash
  return { id: steward.id, email: steward.email, name: steward.name, role: steward.role };
}

/**
 * List all stewards.
 */
function listStewards() {
  return db.prepare('SELECT id, email, name, role, createdAt, active FROM stewards ORDER BY createdAt')
    .all();
}

/**
 * Deactivate a steward account (soft delete).
 */
function deactivateSteward(email) {
  const result = db.prepare('UPDATE stewards SET active = 0 WHERE email = ?')
    .run(email.toLowerCase().trim());
  return result.changes > 0;
}

/**
 * Reactivate a steward account.
 */
function activateSteward(email) {
  const result = db.prepare('UPDATE stewards SET active = 1 WHERE email = ?')
    .run(email.toLowerCase().trim());
  return result.changes > 0;
}

/**
 * Update a steward's role.
 */
function updateRole(email, role) {
  const result = db.prepare('UPDATE stewards SET role = ? WHERE email = ?')
    .run(role.toUpperCase(), email.toLowerCase().trim());
  return result.changes > 0;
}

export {
  createSteward,
  getStewardByEmail,
  getStewardById,
  verifySteward,
  listStewards,
  deactivateSteward,
  activateSteward,
  updateRole,
};
