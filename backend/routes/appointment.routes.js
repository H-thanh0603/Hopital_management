const express = require('express');
const { body, param, query } = require('express-validator');

const db = require('../db/connection');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const router = express.Router();

const APPT_SELECT = `
  SELECT a.*, p.full_name AS patient_name, d.full_name AS doctor_name
  FROM appointments a
  LEFT JOIN patients p ON p.id = a.patient_id
  LEFT JOIN doctors d ON d.id = a.doctor_id
`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'];

// GET / - list with optional filters
router.get(
  '/',
  authenticate,
  [
    query('patientId').optional().isInt().withMessage('patientId must be an integer.'),
    query('doctorId').optional().isInt().withMessage('doctorId must be an integer.'),
    query('date').optional().matches(DATE_RE).withMessage('date must be YYYY-MM-DD.'),
    query('status').optional().isIn(STATUSES).withMessage('Invalid status.'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { patientId, doctorId, date, status } = req.query;
    const conditions = [];
    const params = [];

    if (patientId) { conditions.push('a.patient_id = ?'); params.push(patientId); }
    if (doctorId) { conditions.push('a.doctor_id = ?'); params.push(doctorId); }
    if (date) { conditions.push('a.appointment_date = ?'); params.push(date); }
    if (status) { conditions.push('a.status = ?'); params.push(status); }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const appointments = db
      .prepare(`${APPT_SELECT} ${whereClause} ORDER BY a.appointment_date DESC, a.start_time`)
      .all(...params);

    res.json({ success: true, data: appointments });
  })
);

// GET /:id
router.get(
  '/:id',
  authenticate,
  [param('id').isInt().withMessage('id must be an integer.')],
  validate,
  asyncHandler(async (req, res) => {
    const appointment = db.prepare(`${APPT_SELECT} WHERE a.id = ?`).get(req.params.id);
    if (!appointment) {
      throw new ApiError(404, 'Appointment not found.');
    }
    res.json({ success: true, data: appointment });
  })
);

const appointmentValidators = [
  body('patientId').isInt().withMessage('patientId must be an integer.'),
  body('doctorId').isInt().withMessage('doctorId must be an integer.'),
  body('appointmentDate').matches(DATE_RE).withMessage('appointmentDate must be YYYY-MM-DD.'),
  body('startTime').matches(TIME_RE).withMessage('startTime must be HH:MM.'),
  body('endTime').matches(TIME_RE).withMessage('endTime must be HH:MM.'),
  body('reason').optional({ nullable: true }).isString().trim(),
  body('status').optional().isIn(STATUSES).withMessage('Invalid status.'),
  body('notes').optional({ nullable: true }).isString().trim(),
];

// POST /
router.post(
  '/',
  authenticate,
  authorize('admin', 'receptionist'),
  appointmentValidators,
  validate,
  asyncHandler(async (req, res) => {
    const { patientId, doctorId, appointmentDate, startTime, endTime, reason, status, notes } = req.body;

    if (startTime >= endTime) {
      throw new ApiError(400, 'startTime must be earlier than endTime.');
    }

    const patient = db.prepare('SELECT id FROM patients WHERE id = ? AND is_active = 1').get(patientId);
    if (!patient) {
      throw new ApiError(400, 'patientId does not reference an active patient.');
    }
    const doctor = db.prepare('SELECT id FROM doctors WHERE id = ? AND is_active = 1').get(doctorId);
    if (!doctor) {
      throw new ApiError(400, 'doctorId does not reference an active doctor.');
    }

    const conflict = db
      .prepare('SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND start_time = ?')
      .get(doctorId, appointmentDate, startTime);
    if (conflict) {
      throw new ApiError(409, 'The doctor already has an appointment at this date and time.');
    }

    const info = db
      .prepare(
        `INSERT INTO appointments (patient_id, doctor_id, appointment_date, start_time, end_time, reason, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        patientId,
        doctorId,
        appointmentDate,
        startTime,
        endTime,
        reason || null,
        status || 'scheduled',
        notes || null
      );

    const appointment = db.prepare(`${APPT_SELECT} WHERE a.id = ?`).get(info.lastInsertRowid);
    res.status(201).json({ success: true, data: appointment });
  })
);

// PUT /:id
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'receptionist'),
  [
    param('id').isInt().withMessage('id must be an integer.'),
    body('appointmentDate').optional().matches(DATE_RE).withMessage('appointmentDate must be YYYY-MM-DD.'),
    body('startTime').optional().matches(TIME_RE).withMessage('startTime must be HH:MM.'),
    body('endTime').optional().matches(TIME_RE).withMessage('endTime must be HH:MM.'),
    body('reason').optional({ nullable: true }).isString().trim(),
    body('status').optional().isIn(STATUSES).withMessage('Invalid status.'),
    body('notes').optional({ nullable: true }).isString().trim(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
    if (!existing) {
      throw new ApiError(404, 'Appointment not found.');
    }

    const appointmentDate = req.body.appointmentDate ?? existing.appointment_date;
    const startTime = req.body.startTime ?? existing.start_time;
    const endTime = req.body.endTime ?? existing.end_time;
    const reason = req.body.reason !== undefined ? req.body.reason : existing.reason;
    const status = req.body.status ?? existing.status;
    const notes = req.body.notes !== undefined ? req.body.notes : existing.notes;

    if (startTime >= endTime) {
      throw new ApiError(400, 'startTime must be earlier than endTime.');
    }

    if (
      appointmentDate !== existing.appointment_date ||
      startTime !== existing.start_time
    ) {
      const conflict = db
        .prepare('SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND start_time = ? AND id != ?')
        .get(existing.doctor_id, appointmentDate, startTime, id);
      if (conflict) {
        throw new ApiError(409, 'The doctor already has an appointment at this date and time.');
      }
    }

    db.prepare(
      `UPDATE appointments
       SET appointment_date = ?, start_time = ?, end_time = ?, reason = ?, status = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(appointmentDate, startTime, endTime, reason, status, notes, id);

    const appointment = db.prepare(`${APPT_SELECT} WHERE a.id = ?`).get(id);
    res.json({ success: true, data: appointment });
  })
);

// PATCH /:id/status
router.patch(
  '/:id/status',
  authenticate,
  authorize('admin', 'doctor', 'receptionist'),
  [
    param('id').isInt().withMessage('id must be an integer.'),
    body('status').isIn(STATUSES).withMessage('Invalid status.'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const existing = db.prepare('SELECT id FROM appointments WHERE id = ?').get(id);
    if (!existing) {
      throw new ApiError(404, 'Appointment not found.');
    }

    db.prepare("UPDATE appointments SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
    const appointment = db.prepare(`${APPT_SELECT} WHERE a.id = ?`).get(id);
    res.json({ success: true, data: appointment });
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
    const existing = db.prepare('SELECT id FROM appointments WHERE id = ?').get(id);
    if (!existing) {
      throw new ApiError(404, 'Appointment not found.');
    }
    db.prepare('DELETE FROM appointments WHERE id = ?').run(id);
    res.json({ success: true, data: { id: Number(id) } });
  })
);

module.exports = router;
