const express = require('express');
const { body, param, query } = require('express-validator');

const db = require('../db/connection');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const router = express.Router();

router.get(
  '/',
  authenticate,
  [
    query('search').optional().isString().trim(),
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer.'),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('pageSize must be between 1 and 100.'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { search } = req.query;
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    const conditions = ['is_active = 1'];
    const params = [];

    if (search) {
      conditions.push('(full_name LIKE ? OR phone LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const total = db
      .prepare(`SELECT COUNT(*) AS count FROM patients ${whereClause}`)
      .get(...params).count;

    const patients = db
      .prepare(`SELECT * FROM patients ${whereClause} ORDER BY full_name LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset);

    res.json({
      success: true,
      data: patients,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  })
);

router.get(
  '/:id',
  authenticate,
  [param('id').isInt().withMessage('id must be an integer.')],
  validate,
  asyncHandler(async (req, res) => {
    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
    if (!patient) {
      throw new ApiError(404, 'Patient not found.');
    }
    res.json({ success: true, data: patient });
  })
);

const patientValidators = [
  body('fullName').trim().notEmpty().withMessage('Full name is required.'),
  body('dateOfBirth').optional({ nullable: true }).isISO8601().withMessage('dateOfBirth must be a valid date.'),
  body('gender').optional({ nullable: true }).isIn(['male', 'female', 'other']).withMessage('gender must be male, female, or other.'),
  body('phone').optional({ nullable: true }).isString().trim(),
  body('email').optional({ nullable: true }).isEmail().withMessage('email must be valid.').normalizeEmail(),
  body('address').optional({ nullable: true }).isString().trim(),
  body('bloodGroup').optional({ nullable: true }).isString().trim(),
  body('emergencyContactName').optional({ nullable: true }).isString().trim(),
  body('emergencyContactPhone').optional({ nullable: true }).isString().trim(),
  body('allergies').optional({ nullable: true }).isString().trim(),
];

router.post(
  '/',
  authenticate,
  authorize('admin', 'receptionist'),
  patientValidators,
  validate,
  asyncHandler(async (req, res) => {
    const {
      fullName,
      dateOfBirth,
      gender,
      phone,
      email,
      address,
      bloodGroup,
      emergencyContactName,
      emergencyContactPhone,
      allergies,
    } = req.body;

    const info = db
      .prepare(
        `INSERT INTO patients (
          full_name, date_of_birth, gender, phone, email, address, blood_group,
          emergency_contact_name, emergency_contact_phone, allergies
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        fullName,
        dateOfBirth || null,
        gender || null,
        phone || null,
        email || null,
        address || null,
        bloodGroup || null,
        emergencyContactName || null,
        emergencyContactPhone || null,
        allergies || null
      );

    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ success: true, data: patient });
  })
);

router.put(
  '/:id',
  authenticate,
  authorize('admin', 'receptionist'),
  [param('id').isInt().withMessage('id must be an integer.'), ...patientValidators],
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      fullName,
      dateOfBirth,
      gender,
      phone,
      email,
      address,
      bloodGroup,
      emergencyContactName,
      emergencyContactPhone,
      allergies,
    } = req.body;

    const patient = db.prepare('SELECT id FROM patients WHERE id = ?').get(id);
    if (!patient) {
      throw new ApiError(404, 'Patient not found.');
    }

    db.prepare(
      `UPDATE patients SET
        full_name = ?, date_of_birth = ?, gender = ?, phone = ?, email = ?, address = ?,
        blood_group = ?, emergency_contact_name = ?, emergency_contact_phone = ?, allergies = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      fullName,
      dateOfBirth || null,
      gender || null,
      phone || null,
      email || null,
      address || null,
      bloodGroup || null,
      emergencyContactName || null,
      emergencyContactPhone || null,
      allergies || null,
      id
    );

    const updated = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
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
    const patient = db.prepare('SELECT id FROM patients WHERE id = ?').get(id);
    if (!patient) {
      throw new ApiError(404, 'Patient not found.');
    }
    db.prepare('UPDATE patients SET is_active = 0 WHERE id = ?').run(id);
    res.json({ success: true, data: { id: Number(id) } });
  })
);

router.get(
  '/:id/medical-records',
  authenticate,
  [param('id').isInt().withMessage('id must be an integer.')],
  validate,
  asyncHandler(async (req, res) => {
    const patient = db.prepare('SELECT id FROM patients WHERE id = ?').get(req.params.id);
    if (!patient) {
      throw new ApiError(404, 'Patient not found.');
    }
    const records = db
      .prepare(
        `SELECT mr.*, d.full_name AS doctor_name
         FROM medical_records mr
         LEFT JOIN doctors d ON d.id = mr.doctor_id
         WHERE mr.patient_id = ?
         ORDER BY mr.visit_date DESC`
      )
      .all(req.params.id);
    res.json({ success: true, data: records });
  })
);

router.get(
  '/:id/appointments',
  authenticate,
  [param('id').isInt().withMessage('id must be an integer.')],
  validate,
  asyncHandler(async (req, res) => {
    const patient = db.prepare('SELECT id FROM patients WHERE id = ?').get(req.params.id);
    if (!patient) {
      throw new ApiError(404, 'Patient not found.');
    }
    const appointments = db
      .prepare(
        `SELECT a.*, d.full_name AS doctor_name
         FROM appointments a
         LEFT JOIN doctors d ON d.id = a.doctor_id
         WHERE a.patient_id = ?
         ORDER BY a.appointment_date DESC, a.start_time DESC`
      )
      .all(req.params.id);
    res.json({ success: true, data: appointments });
  })
);

module.exports = router;
