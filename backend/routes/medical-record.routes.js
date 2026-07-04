const express = require('express');
const { body, param, query } = require('express-validator');

const db = require('../db/connection');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const router = express.Router();

const RECORD_SELECT = `
  SELECT mr.*, p.full_name AS patient_name, d.full_name AS doctor_name
  FROM medical_records mr
  LEFT JOIN patients p ON p.id = mr.patient_id
  LEFT JOIN doctors d ON d.id = mr.doctor_id
`;

// GET / - list with optional filters
router.get(
  '/',
  authenticate,
  [
    query('patientId').optional().isInt().withMessage('patientId must be an integer.'),
    query('doctorId').optional().isInt().withMessage('doctorId must be an integer.'),
    query('appointmentId').optional().isInt().withMessage('appointmentId must be an integer.'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { patientId, doctorId, appointmentId } = req.query;
    const conditions = [];
    const params = [];

    if (patientId) { conditions.push('mr.patient_id = ?'); params.push(patientId); }
    if (doctorId) { conditions.push('mr.doctor_id = ?'); params.push(doctorId); }
    if (appointmentId) { conditions.push('mr.appointment_id = ?'); params.push(appointmentId); }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const records = db
      .prepare(`${RECORD_SELECT} ${whereClause} ORDER BY mr.created_at DESC`)
      .all(...params);

    res.json({ success: true, data: records });
  })
);

// GET /:id - single record with extended details
router.get(
  '/:id',
  authenticate,
  [param('id').isInt().withMessage('id must be an integer.')],
  validate,
  asyncHandler(async (req, res) => {
    const record = db
      .prepare(
        `SELECT mr.*,
                p.full_name AS patient_name, p.gender AS patient_gender, p.date_of_birth AS patient_dob,
                d.full_name AS doctor_name, d.specialization AS doctor_specialization
         FROM medical_records mr
         LEFT JOIN patients p ON p.id = mr.patient_id
         LEFT JOIN doctors d ON d.id = mr.doctor_id
         WHERE mr.id = ?`
      )
      .get(req.params.id);

    if (!record) {
      throw new ApiError(404, 'Medical record not found.');
    }
    res.json({ success: true, data: record });
  })
);

const recordValidators = [
  body('patientId').isInt().withMessage('patientId must be an integer.'),
  body('doctorId').isInt().withMessage('doctorId must be an integer.'),
  body('appointmentId').optional({ nullable: true }).isInt().withMessage('appointmentId must be an integer.'),
  body('diagnosis').trim().notEmpty().withMessage('diagnosis is required.'),
  body('prescription').optional({ nullable: true }).isString(),
  body('notes').optional({ nullable: true }).isString(),
];

// POST /
router.post(
  '/',
  authenticate,
  authorize('admin', 'doctor'),
  recordValidators,
  validate,
  asyncHandler(async (req, res) => {
    const { patientId, doctorId, appointmentId, diagnosis, prescription, notes } = req.body;

    const patient = db.prepare('SELECT id FROM patients WHERE id = ? AND is_active = 1').get(patientId);
    if (!patient) {
      throw new ApiError(400, 'patientId does not reference an active patient.');
    }
    const doctor = db.prepare('SELECT id FROM doctors WHERE id = ? AND is_active = 1').get(doctorId);
    if (!doctor) {
      throw new ApiError(400, 'doctorId does not reference an active doctor.');
    }
    if (appointmentId) {
      const appointment = db.prepare('SELECT id FROM appointments WHERE id = ?').get(appointmentId);
      if (!appointment) {
        throw new ApiError(400, 'appointmentId does not reference an existing appointment.');
      }
    }

    const info = db
      .prepare(
        `INSERT INTO medical_records (patient_id, doctor_id, appointment_id, diagnosis, prescription, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(patientId, doctorId, appointmentId || null, diagnosis, prescription || null, notes || null);

    const record = db.prepare(`${RECORD_SELECT} WHERE mr.id = ?`).get(info.lastInsertRowid);
    res.status(201).json({ success: true, data: record });
  })
);

// PUT /:id
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'doctor'),
  [
    param('id').isInt().withMessage('id must be an integer.'),
    body('diagnosis').optional().trim().notEmpty().withMessage('diagnosis cannot be empty.'),
    body('prescription').optional({ nullable: true }).isString(),
    body('notes').optional({ nullable: true }).isString(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM medical_records WHERE id = ?').get(id);
    if (!existing) {
      throw new ApiError(404, 'Medical record not found.');
    }

    const diagnosis = req.body.diagnosis ?? existing.diagnosis;
    const prescription = req.body.prescription !== undefined ? req.body.prescription : existing.prescription;
    const notes = req.body.notes !== undefined ? req.body.notes : existing.notes;

    db.prepare(
      `UPDATE medical_records
       SET diagnosis = ?, prescription = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(diagnosis, prescription, notes, id);

    const record = db.prepare(`${RECORD_SELECT} WHERE mr.id = ?`).get(id);
    res.json({ success: true, data: record });
  })
);

// DELETE /:id
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  [param('id').isInt().withMessage('id must be an integer.')],
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM medical_records WHERE id = ?').get(id);
    if (!existing) {
      throw new ApiError(404, 'Medical record not found.');
    }
    db.prepare('DELETE FROM medical_records WHERE id = ?').run(id);
    res.json({ success: true, data: { id: Number(id) } });
  })
);

module.exports = router;
