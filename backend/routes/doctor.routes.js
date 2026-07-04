const express = require('express');
const { body, param, query } = require('express-validator');

const db = require('../db/connection');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const router = express.Router();

const DOCTOR_SELECT = `
  SELECT d.*, dep.name AS department_name
  FROM doctors d
  LEFT JOIN departments dep ON dep.id = d.department_id
`;

router.get(
  '/',
  authenticate,
  [
    query('search').optional().isString().trim(),
    query('departmentId').optional().isInt().withMessage('departmentId must be an integer.'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { search, departmentId } = req.query;

    const conditions = [];
    const params = [];

    if (search) {
      conditions.push('(d.full_name LIKE ? OR d.specialization LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (departmentId) {
      conditions.push('d.department_id = ?');
      params.push(departmentId);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const doctors = db
      .prepare(`${DOCTOR_SELECT} ${whereClause} ORDER BY d.full_name`)
      .all(...params);

    res.json({ success: true, data: doctors });
  })
);

router.get(
  '/:id',
  authenticate,
  [param('id').isInt().withMessage('id must be an integer.')],
  validate,
  asyncHandler(async (req, res) => {
    const doctor = db.prepare(`${DOCTOR_SELECT} WHERE d.id = ?`).get(req.params.id);
    if (!doctor) {
      throw new ApiError(404, 'Doctor not found.');
    }

    const schedules = db
      .prepare('SELECT * FROM doctor_schedules WHERE doctor_id = ? ORDER BY day_of_week')
      .all(req.params.id);

    res.json({ success: true, data: { ...doctor, schedules } });
  })
);

const doctorValidators = [
  body('fullName').trim().notEmpty().withMessage('Full name is required.'),
  body('email').optional({ nullable: true }).isEmail().withMessage('email must be valid.').normalizeEmail(),
  body('phone').optional({ nullable: true }).isString().trim(),
  body('departmentId').optional({ nullable: true }).isInt().withMessage('departmentId must be an integer.'),
  body('specialization').optional({ nullable: true }).isString().trim(),
  body('qualification').optional({ nullable: true }).isString().trim(),
  body('consultationFee')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('consultationFee must be a non-negative number.'),
];

router.post(
  '/',
  authenticate,
  authorize('admin'),
  doctorValidators,
  validate,
  asyncHandler(async (req, res) => {
    const {
      fullName,
      email,
      phone,
      departmentId,
      specialization,
      qualification,
      consultationFee,
    } = req.body;

    if (departmentId) {
      const department = db.prepare('SELECT id FROM departments WHERE id = ?').get(departmentId);
      if (!department) {
        throw new ApiError(400, 'departmentId does not reference an existing department.');
      }
    }

    if (email) {
      const existing = db.prepare('SELECT id FROM doctors WHERE email = ?').get(email);
      if (existing) {
        throw new ApiError(409, 'A doctor with this email already exists.');
      }
    }

    const info = db
      .prepare(
        `INSERT INTO doctors (full_name, email, phone, department_id, specialization, qualification, consultation_fee)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        fullName,
        email || null,
        phone || null,
        departmentId || null,
        specialization || null,
        qualification || null,
        consultationFee || 0
      );

    const doctor = db.prepare(`${DOCTOR_SELECT} WHERE d.id = ?`).get(info.lastInsertRowid);
    res.status(201).json({ success: true, data: doctor });
  })
);

router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  [param('id').isInt().withMessage('id must be an integer.'), ...doctorValidators],
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      fullName,
      email,
      phone,
      departmentId,
      specialization,
      qualification,
      consultationFee,
    } = req.body;

    const doctor = db.prepare('SELECT id FROM doctors WHERE id = ?').get(id);
    if (!doctor) {
      throw new ApiError(404, 'Doctor not found.');
    }

    if (departmentId) {
      const department = db.prepare('SELECT id FROM departments WHERE id = ?').get(departmentId);
      if (!department) {
        throw new ApiError(400, 'departmentId does not reference an existing department.');
      }
    }

    if (email) {
      const existing = db
        .prepare('SELECT id FROM doctors WHERE email = ? AND id != ?')
        .get(email, id);
      if (existing) {
        throw new ApiError(409, 'A doctor with this email already exists.');
      }
    }

    db.prepare(
      `UPDATE doctors
       SET full_name = ?, email = ?, phone = ?, department_id = ?, specialization = ?, qualification = ?, consultation_fee = ?
       WHERE id = ?`
    ).run(
      fullName,
      email || null,
      phone || null,
      departmentId || null,
      specialization || null,
      qualification || null,
      consultationFee || 0,
      id
    );

    const updated = db.prepare(`${DOCTOR_SELECT} WHERE d.id = ?`).get(id);
    res.json({ success: true, data: updated });
  })
);

router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  [param('id').isInt().withMessage('id must be an integer.')],
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const doctor = db.prepare('SELECT id FROM doctors WHERE id = ?').get(id);
    if (!doctor) {
      throw new ApiError(404, 'Doctor not found.');
    }
    db.prepare('UPDATE doctors SET is_active = 0 WHERE id = ?').run(id);
    res.json({ success: true, data: { id: Number(id) } });
  })
);

// --- Schedules ---

router.get(
  '/:id/schedules',
  authenticate,
  [param('id').isInt().withMessage('id must be an integer.')],
  validate,
  asyncHandler(async (req, res) => {
    const doctor = db.prepare('SELECT id FROM doctors WHERE id = ?').get(req.params.id);
    if (!doctor) {
      throw new ApiError(404, 'Doctor not found.');
    }
    const schedules = db
      .prepare('SELECT * FROM doctor_schedules WHERE doctor_id = ? ORDER BY day_of_week')
      .all(req.params.id);
    res.json({ success: true, data: schedules });
  })
);

router.post(
  '/:id/schedules',
  authenticate,
  authorize('admin'),
  [
    param('id').isInt().withMessage('id must be an integer.'),
    body('dayOfWeek').isInt({ min: 0, max: 6 }).withMessage('dayOfWeek must be between 0 and 6.'),
    body('startTime').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('startTime must be HH:MM.'),
    body('endTime').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('endTime must be HH:MM.'),
    body('slotMinutes').optional().isInt({ min: 5, max: 240 }).withMessage('slotMinutes must be between 5 and 240.'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { dayOfWeek, startTime, endTime, slotMinutes } = req.body;

    const doctor = db.prepare('SELECT id FROM doctors WHERE id = ?').get(id);
    if (!doctor) {
      throw new ApiError(404, 'Doctor not found.');
    }

    if (startTime >= endTime) {
      throw new ApiError(400, 'startTime must be earlier than endTime.');
    }

    try {
      const info = db
        .prepare(
          `INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(id, dayOfWeek, startTime, endTime, slotMinutes || 30);

      const schedule = db.prepare('SELECT * FROM doctor_schedules WHERE id = ?').get(info.lastInsertRowid);
      res.status(201).json({ success: true, data: schedule });
    } catch (err) {
      if (String(err.message).includes('UNIQUE constraint failed')) {
        throw new ApiError(409, 'This schedule slot already exists for the doctor.');
      }
      throw err;
    }
  })
);

router.delete(
  '/:id/schedules/:scheduleId',
  authenticate,
  authorize('admin'),
  [
    param('id').isInt().withMessage('id must be an integer.'),
    param('scheduleId').isInt().withMessage('scheduleId must be an integer.'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { id, scheduleId } = req.params;
    const schedule = db
      .prepare('SELECT id FROM doctor_schedules WHERE id = ? AND doctor_id = ?')
      .get(scheduleId, id);
    if (!schedule) {
      throw new ApiError(404, 'Schedule not found.');
    }
    db.prepare('DELETE FROM doctor_schedules WHERE id = ?').run(scheduleId);
    res.json({ success: true, data: { id: Number(scheduleId) } });
  })
);

module.exports = router;
