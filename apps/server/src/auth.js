/**
 * JWT authentication utilities.
 * Signs and verifies tokens for steward authentication.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const SECRET_FILE = path.join(DATA_DIR, '.jwt-secret');
const TOKEN_EXPIRY = '24h';

// Get or generate JWT secret
function getSecret() {
  // Check env var first
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  // Check saved secret file
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  }

  // Generate and save a new secret
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const secret = crypto.randomBytes(48).toString('base64');
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  console.log('[auth] Generated new JWT secret');
  return secret;
}

const JWT_SECRET = getSecret();

/**
 * Sign a JWT token for a steward.
 * @param {string} stewardId
 * @param {string} name
 * @param {string} role — MAIN or SUPPORT
 * @returns {string} JWT token
 */
function signToken(stewardId, name, role) {
  return jwt.sign(
    { stewardId, name, role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * Verify a JWT token.
 * @param {string} token
 * @returns {{ stewardId, name, role } | null}
 */
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return {
      stewardId: decoded.stewardId,
      name: decoded.name,
      role: decoded.role,
    };
  } catch {
    return null;
  }
}

module.exports = { signToken, verifyToken };
