const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');

const db = require('../db/connection');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { signToken } = require('../utils/jwt');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const router = express.Router();

const ALLOWED_ROLES = ['admin', 'doctor', 'receptionist'];

// Throttle login attempts to slow down credential-stuffing / brute force.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required.'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !user.is_active) {
      throw new ApiError(401, 'Invalid email or password.');
    }

    const passwordMatches = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatches) {
      throw new ApiError(401, 'Invalid email or password.');
    }

    const token = signToken({ sub: user.id, role: user.role });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          fullName: user.full_name,
          email: user.email,
          role: user.role,
          doctorId: user.doctor_id,
        },
      },
    });
  })
);

// Registering new staff accounts is an admin-only action, not public self-service.
router.post(
  '/register',
  authenticate,
  authorize('admin'),
  [
    body('fullName').trim().notEmpty().withMessage('Full name is required.'),
    body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long.'),
    body('role')
      .isIn(ALLOWED_ROLES)
      .withMessage(`Role must be one of: ${ALLOWED_ROLES.join(', ')}.`),
    body('doctorId').optional({ nullable: true }).isInt().withMessage('doctorId must be an integer.'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { fullName, email, password, role, doctorId } = req.body;

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      throw new ApiError(409, 'A user with this email already exists.');
    }

    if (role === 'doctor' && doctorId) {
      const doctor = db.prepare('SELECT id FROM doctors WHERE id = ?').get(doctorId);
      if (!doctor) {
        throw new ApiError(400, 'doctorId does not reference an existing doctor.');
      }
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const info = db
      .prepare(
        'INSERT INTO users (full_name, email, password_hash, role, doctor_id) VALUES (?, ?, ?, ?, ?)'
      )
      .run(fullName, email, passwordHash, role, doctorId || null);

    res.status(201).json({
      success: true,
      data: {
        id: info.lastInsertRowid,
        fullName,
        email,
        role,
        doctorId: doctorId || null,
      },
    });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: req.user });
  })
);

module.exports = router;
