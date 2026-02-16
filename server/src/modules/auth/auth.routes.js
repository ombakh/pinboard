const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDb } = require('../../db');
const requireAuth = require('../../middlewares/requireAuth');
const {
  clearAuthCookie,
  setAuthCookie,
  signUserToken,
  TOKEN_COOKIE_NAME,
  verifyUserToken
} = require('../../auth/token');

const router = express.Router();
const OM_OVERRIDE_NAME = 'om bakhshi';
const OM_OVERRIDE_EMAIL = 'ombakh28@gmail.com';
const EMAIL_VERIFICATION_TOKEN_BYTES = 32;
const EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS = 24;

function hashEmailVerificationToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function generateEmailVerificationToken() {
  return crypto.randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES).toString('hex');
}

function mapUserForClient(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    isAdmin: Boolean(row.isAdmin),
    isModerator: Boolean(row.isModerator),
    isEmailVerified: Boolean(row.emailVerifiedAt)
  };
}

function loadUserForAuthById(db, userId) {
  return db
    .prepare(
      `SELECT
        id,
        name,
        handle,
        email,
        bio,
        profile_image_url AS profileImageUrl,
        timezone,
        is_admin AS isAdmin,
        is_moderator AS isModerator,
        email_verified_at AS emailVerifiedAt,
        banned_at AS bannedAt,
        ban_reason AS banReason,
        suspended_until AS suspendedUntil,
        suspension_reason AS suspensionReason,
        created_at AS createdAt
       FROM users
       WHERE id = ?`
    )
    .get(userId);
}

function parseSqliteTimestamp(value) {
  if (!value) {
    return null;
  }
  const normalized = String(value).replace(' ', 'T');
  const withTimezone = normalized.endsWith('Z') ? normalized : `${normalized}Z`;
  const date = new Date(withTimezone);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSuspensionActive(suspendedUntil) {
  const untilDate = parseSqliteTimestamp(suspendedUntil);
  return Boolean(untilDate && untilDate.getTime() > Date.now());
}

function normalizeHandle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '');
}

function canUseOmOverride(name, email) {
  return (
    String(email || '').trim().toLowerCase() === OM_OVERRIDE_EMAIL ||
    String(name || '').trim().toLowerCase() === OM_OVERRIDE_NAME
  );
}

function isValidTimeZone(timeZone) {
  if (!timeZone) {
    return false;
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch (_error) {
    return false;
  }
}

router.post('/register', (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const handle = normalizeHandle(req.body.handle);
  const timezoneInput = String(req.body.timezone || '').trim();
  const timezone = timezoneInput || null;

  if (!name || !email || !password || password.length < 8 || !handle) {
    return res
      .status(400)
      .json({ message: 'Name, handle, email, and a password with at least 8 characters are required' });
  }

  const handleIsValid =
    /^[a-z0-9_]{3,20}$/.test(handle) || (handle === 'om' && canUseOmOverride(name, email));
  if (!handleIsValid) {
    return res
      .status(400)
      .json({ message: 'Handle must be 3-20 characters using only letters, numbers, or underscores' });
  }
  if (timezone && !isValidTimeZone(timezone)) {
    return res.status(400).json({ message: 'Invalid timezone' });
  }

  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

    if (existing) {
      return res.status(409).json({ message: 'Email already in use' });
    }
    const existingHandle = db.prepare('SELECT id FROM users WHERE handle = ?').get(handle);
    if (existingHandle) {
      return res.status(409).json({ message: 'Handle already in use' });
    }

    const passwordHash = bcrypt.hashSync(password, 12);
    const insert = db
      .prepare(
        `INSERT INTO users (name, handle, email, password_hash, timezone)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(name, handle, email, passwordHash, timezone);

    const user = db
      .prepare(
        `SELECT
          id,
          name,
          handle,
          email,
          bio,
          profile_image_url AS profileImageUrl,
          timezone,
          is_admin AS isAdmin,
          is_moderator AS isModerator,
          email_verified_at AS emailVerifiedAt,
          banned_at AS bannedAt,
          ban_reason AS banReason,
          suspended_until AS suspendedUntil,
          suspension_reason AS suspensionReason,
          created_at AS createdAt
         FROM users
         WHERE id = ?`
      )
      .get(insert.lastInsertRowid);

    const safeUser = mapUserForClient(user);

    const token = signUserToken(safeUser);
    setAuthCookie(res, token);

    return res.status(201).json({ user: safeUser });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not register user' });
  }
});

router.post('/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.banned_at) {
      return res.status(403).json({ message: `User is banned${user.ban_reason ? `: ${user.ban_reason}` : ''}` });
    }

    if (isSuspensionActive(user.suspended_until)) {
      return res.status(403).json({
        message: `User is suspended until ${user.suspended_until}${user.suspension_reason ? `: ${user.suspension_reason}` : ''}`
      });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      handle: user.handle,
      email: user.email,
      bio: user.bio,
      profileImageUrl: user.profile_image_url,
      timezone: user.timezone,
      isAdmin: Boolean(user.is_admin),
      isModerator: Boolean(user.is_moderator),
      emailVerifiedAt: user.email_verified_at,
      isEmailVerified: Boolean(user.email_verified_at),
      bannedAt: user.banned_at,
      banReason: user.ban_reason,
      suspendedUntil: user.suspended_until,
      suspensionReason: user.suspension_reason,
      createdAt: user.created_at
    };
    const token = signUserToken(safeUser);
    setAuthCookie(res, token);

    return res.json({ user: safeUser });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not login' });
  }
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  return res.status(204).send();
});

router.get('/me', (req, res) => {
  try {
    const token = req.cookies[TOKEN_COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const payload = verifyUserToken(token);
    const db = getDb();
    const user = loadUserForAuthById(db, payload.sub);

    if (!user) {
      clearAuthCookie(res);
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (user.bannedAt) {
      clearAuthCookie(res);
      return res.status(403).json({ message: `User is banned${user.banReason ? `: ${user.banReason}` : ''}` });
    }

    if (isSuspensionActive(user.suspendedUntil)) {
      clearAuthCookie(res);
      return res.status(403).json({
        message: `User is suspended until ${user.suspendedUntil}${user.suspensionReason ? `: ${user.suspensionReason}` : ''}`
      });
    }

    return res.json({ user: mapUserForClient(user) });
  } catch (_error) {
    clearAuthCookie(res);
    return res.status(401).json({ message: 'Unauthorized' });
  }
});

router.post('/email-verification/request', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const current = db
      .prepare(
        `SELECT
          id,
          email_verified_at AS emailVerifiedAt
         FROM users
         WHERE id = ?`
      )
      .get(req.authUser.id);

    if (!current) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (current.emailVerifiedAt) {
      return res.json({
        message: 'Email already verified',
        isEmailVerified: true
      });
    }

    const token = generateEmailVerificationToken();
    const tokenHash = hashEmailVerificationToken(token);
    const transaction = db.transaction(() => {
      db.prepare(
        `UPDATE email_verification_tokens
         SET used_at = CURRENT_TIMESTAMP
         WHERE user_id = ?
           AND used_at IS NULL`
      ).run(req.authUser.id);

      db.prepare(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES (?, ?, datetime('now', ?))`
      ).run(req.authUser.id, tokenHash, `+${EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS} hours`);
    });
    transaction();

    const payload = {
      message: 'Verification email requested',
      isEmailVerified: false
    };

    if (process.env.NODE_ENV !== 'production') {
      payload.devVerificationToken = token;
      payload.devVerificationLink = `/verify-email?token=${token}`;
      payload.expiresInHours = EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS;
    }

    return res.status(201).json(payload);
  } catch (_error) {
    return res.status(500).json({ message: 'Could not request email verification' });
  }
});

router.post('/email-verification/verify', requireAuth, (req, res) => {
  const token = String(req.body.token || '').trim();
  if (!token) {
    return res.status(400).json({ message: 'Verification token is required' });
  }

  try {
    const db = getDb();
    const tokenHash = hashEmailVerificationToken(token);
    const tokenRow = db
      .prepare(
        `SELECT
          id,
          user_id AS userId,
          expires_at AS expiresAt,
          used_at AS usedAt
         FROM email_verification_tokens
         WHERE token_hash = ?
           AND user_id = ?`
      )
      .get(tokenHash, req.authUser.id);

    if (!tokenRow) {
      return res.status(400).json({ message: 'Invalid verification token' });
    }

    if (tokenRow.usedAt) {
      return res.status(400).json({ message: 'Verification token has already been used' });
    }

    const expiresAt = parseSqliteTimestamp(tokenRow.expiresAt);
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ message: 'Verification token has expired' });
    }

    const transaction = db.transaction(() => {
      db.prepare(
        `UPDATE users
         SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP)
         WHERE id = ?`
      ).run(req.authUser.id);

      db.prepare(
        `UPDATE email_verification_tokens
         SET used_at = CURRENT_TIMESTAMP
         WHERE user_id = ?
           AND used_at IS NULL`
      ).run(req.authUser.id);
    });
    transaction();

    const updatedUser = loadUserForAuthById(db, req.authUser.id);

    return res.json({
      message: 'Email verified',
      user: mapUserForClient(updatedUser)
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not verify email' });
  }
});

module.exports = router;
