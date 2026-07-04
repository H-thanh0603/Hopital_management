const express = require('express');
const { body, param, query } = require('express-validator');

const db = require('../db/connection');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const router = express.Router();

const STATUSES = ['unpaid', 'paid', 'partially_paid', 'cancelled'];

const INVOICE_SELECT = `
  SELECT i.*, p.full_name AS patient_name
  FROM invoices i
  LEFT JOIN patients p ON p.id = i.patient_id
`;

function generateInvoiceNumber() {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${ymd}-${rand}`;
}

// GET / - list with optional filters
router.get(
  '/',
  authenticate,
  [
    query('patientId').optional().isInt().withMessage('patientId must be an integer.'),
    query('status').optional().isIn(STATUSES).withMessage('Invalid status.'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { patientId, status } = req.query;
    const conditions = [];
    const params = [];

    if (patientId) { conditions.push('i.patient_id = ?'); params.push(patientId); }
    if (status) { conditions.push('i.status = ?'); params.push(status); }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const invoices = db
      .prepare(`${INVOICE_SELECT} ${whereClause} ORDER BY i.created_at DESC`)
      .all(...params);

    res.json({ success: true, data: invoices });
  })
);

// GET /:id - single invoice with items
router.get(
  '/:id',
  authenticate,
  [param('id').isInt().withMessage('id must be an integer.')],
  validate,
  asyncHandler(async (req, res) => {
    const invoice = db.prepare(`${INVOICE_SELECT} WHERE i.id = ?`).get(req.params.id);
    if (!invoice) {
      throw new ApiError(404, 'Invoice not found.');
    }
    invoice.items = db
      .prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id')
      .all(req.params.id);
    res.json({ success: true, data: invoice });
  })
);

const invoiceValidators = [
  body('patientId').isInt().withMessage('patientId must be an integer.'),
  body('appointmentId').optional({ nullable: true }).isInt().withMessage('appointmentId must be an integer.'),
  body('dueDate').optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('dueDate must be YYYY-MM-DD.'),
  body('tax').optional().isFloat({ min: 0 }).withMessage('tax must be a non-negative number.'),
  body('discount').optional().isFloat({ min: 0 }).withMessage('discount must be a non-negative number.'),
  body('status').optional().isIn(STATUSES).withMessage('Invalid status.'),
  body('paymentMethod').optional({ nullable: true }).isString().trim(),
  body('items').optional().isArray().withMessage('items must be an array.'),
  body('items.*.description').notEmpty().withMessage('Item description is required.'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Item quantity must be at least 1.'),
  body('items.*.unitPrice').isFloat({ min: 0 }).withMessage('Item unitPrice must be a non-negative number.'),
];

// POST / - create invoice with items (transaction), amounts computed from items
router.post(
  '/',
  authenticate,
  authorize('admin', 'receptionist'),
  invoiceValidators,
  validate,
  asyncHandler(async (req, res) => {
    const { patientId, appointmentId, dueDate, tax = 0, discount = 0, status, paymentMethod, items = [] } = req.body;

    const patient = db.prepare('SELECT id FROM patients WHERE id = ?').get(patientId);
    if (!patient) {
      throw new ApiError(400, 'patientId does not reference an existing patient.');
    }
    if (appointmentId) {
      const appointment = db.prepare('SELECT id FROM appointments WHERE id = ?').get(appointmentId);
      if (!appointment) {
        throw new ApiError(400, 'appointmentId does not reference an existing appointment.');
      }
    }

    const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
    const total = Math.max(0, subtotal + Number(tax) - Number(discount));
    const invoiceStatus = status || 'unpaid';

    const createInvoice = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO invoices (invoice_number, patient_id, appointment_id, due_date, subtotal, tax, discount, total, status, payment_method, paid_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          generateInvoiceNumber(),
          patientId,
          appointmentId || null,
          dueDate || null,
          subtotal,
          tax,
          discount,
          total,
          invoiceStatus,
          paymentMethod || null,
          invoiceStatus === 'paid' ? new Date().toISOString() : null
        );

      const invoiceId = info.lastInsertRowid;
      if (items.length) {
        const insertItem = db.prepare(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount) VALUES (?, ?, ?, ?, ?)`
        );
        for (const it of items) {
          insertItem.run(invoiceId, it.description, it.quantity, it.unitPrice, it.quantity * it.unitPrice);
        }
      }
      return invoiceId;
    });

    const invoiceId = createInvoice();
    const invoice = db.prepare(`${INVOICE_SELECT} WHERE i.id = ?`).get(invoiceId);
    invoice.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id').all(invoiceId);
    res.status(201).json({ success: true, data: invoice });
  })
);

// PUT /:id - update invoice header fields
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'receptionist'),
  [
    param('id').isInt().withMessage('id must be an integer.'),
    body('dueDate').optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('dueDate must be YYYY-MM-DD.'),
    body('tax').optional().isFloat({ min: 0 }),
    body('discount').optional().isFloat({ min: 0 }),
    body('status').optional().isIn(STATUSES).withMessage('Invalid status.'),
    body('paymentMethod').optional({ nullable: true }).isString().trim(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    if (!existing) {
      throw new ApiError(404, 'Invoice not found.');
    }

    const tax = req.body.tax ?? existing.tax;
    const discount = req.body.discount ?? existing.discount;
    const dueDate = req.body.dueDate !== undefined ? req.body.dueDate : existing.due_date;
    const status = req.body.status ?? existing.status;
    const paymentMethod = req.body.paymentMethod !== undefined ? req.body.paymentMethod : existing.payment_method;
    const total = Math.max(0, existing.subtotal + Number(tax) - Number(discount));
    const paidAt = status === 'paid' && !existing.paid_at ? new Date().toISOString() : existing.paid_at;

    db.prepare(
      `UPDATE invoices
       SET due_date = ?, tax = ?, discount = ?, total = ?, status = ?, payment_method = ?, paid_at = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(dueDate, tax, discount, total, status, paymentMethod, paidAt, id);

    const updated = db.prepare(`${INVOICE_SELECT} WHERE i.id = ?`).get(id);
    updated.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id').all(id);
    res.json({ success: true, data: updated });
  })
);

// PATCH /:id/status
router.patch(
  '/:id/status',
  authenticate,
  authorize('admin', 'receptionist'),
  [
    param('id').isInt().withMessage('id must be an integer.'),
    body('status').isIn(STATUSES).withMessage('Invalid status.'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const existing = db.prepare('SELECT id, paid_at FROM invoices WHERE id = ?').get(id);
    if (!existing) {
      throw new ApiError(404, 'Invoice not found.');
    }
    const paidAt = status === 'paid' && !existing.paid_at ? new Date().toISOString() : existing.paid_at;
    db.prepare("UPDATE invoices SET status = ?, paid_at = ?, updated_at = datetime('now') WHERE id = ?").run(status, paidAt, id);
    const updated = db.prepare(`${INVOICE_SELECT} WHERE i.id = ?`).get(id);
    updated.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id').all(id);
    res.json({ success: true, data: updated });
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
    const existing = db.prepare('SELECT id FROM invoices WHERE id = ?').get(id);
    if (!existing) {
      throw new ApiError(404, 'Invoice not found.');
    }
    db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
    res.json({ success: true, data: { id: Number(id) } });
  })
);

module.exports = router;
