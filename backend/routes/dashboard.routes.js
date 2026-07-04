const express = require('express');

const db = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// GET /stats — overview statistics
  router.get('/stats', authenticate, asyncHandler(async (req, res) => {
    const [
      totalPatients,
      totalDoctors,
      totalAppointments,
      todayAppointments,
      pendingInvoices,
      totalRevenue,
      departments,
    ] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS count FROM patients').get(),
      db.prepare('SELECT COUNT(*) AS count FROM doctors').get(),
      db.prepare('SELECT COUNT(*) AS count FROM appointments').get(),
      db.prepare('SELECT COUNT(*) AS count FROM appointments WHERE date(appointment_date) = date(\'now\', \'localtime\')').get(),
      db.prepare('SELECT COUNT(*) AS count FROM invoices WHERE status = \'unpaid\'').get(),
      db.prepare('SELECT COALESCE(SUM(total), 0) AS total FROM invoices WHERE status = \'paid\'').get(),
      db.prepare('SELECT COUNT(*) AS count FROM departments').get(),
    ]);

    res.json({
      success: true,
      data: {
        totalPatients: totalPatients.count,
        totalDoctors: totalDoctors.count,
        totalAppointments: totalAppointments.count,
        todayAppointments: todayAppointments.count,
        pendingInvoices: pendingInvoices.count,
        totalRevenue: totalRevenue.total,
        departments: departments.count,
      },
    });
  }));

  // GET /appointments-by-status — appointments grouped by status
  router.get('/appointments-by-status', authenticate, asyncHandler(async (req, res) => {
    const rows = db.prepare(
      'SELECT status, COUNT(*) AS count FROM appointments GROUP BY status'
    ).all();

    res.json({ success: true, data: rows });
  }));

  // GET /appointments-by-department — appointments grouped by doctor's department
  router.get('/appointments-by-department', authenticate, asyncHandler(async (req, res) => {
    const rows = db.prepare(`
      SELECT d.name AS department_name, COUNT(*) AS count
      FROM appointments a
      JOIN doctors doc ON a.doctor_id = doc.id
      JOIN departments d ON doc.department_id = d.id
      GROUP BY d.id, d.name
    `).all();

    res.json({ success: true, data: rows });
  }));

  // GET /revenue-by-month — last 6 months revenue from paid invoices
  router.get('/revenue-by-month', authenticate, asyncHandler(async (req, res) => {
    const rows = db.prepare(`
      SELECT strftime('%Y-%m', created_at) AS month,
             COALESCE(SUM(total), 0) AS revenue
      FROM invoices
      WHERE status = 'paid'
        AND created_at >= date('now', '-6 months', 'localtime')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month ASC
    `).all();

    res.json({ success: true, data: rows });
  }));

  // GET /patients-by-gender — patients grouped by gender
  router.get('/patients-by-gender', authenticate, asyncHandler(async (req, res) => {
    const rows = db.prepare(
      'SELECT gender, COUNT(*) AS count FROM patients GROUP BY gender'
    ).all();

    res.json({ success: true, data: rows });
  }));

  // GET /recent-appointments — last 10 appointments with patient + doctor names
  router.get('/recent-appointments', authenticate, asyncHandler(async (req, res) => {
    const rows = db.prepare(`
      SELECT a.id,
             p.full_name AS patient_name,
             doc.full_name AS doctor_name,
             a.appointment_date,
             a.start_time,
             a.status
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN doctors doc ON a.doctor_id = doc.id
      ORDER BY a.appointment_date DESC, a.start_time DESC
      LIMIT 10
    `).all();

    res.json({ success: true, data: rows });
  }));

module.exports = router;
