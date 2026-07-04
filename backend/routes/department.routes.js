const express = require('express');
const { body, param } = require('express-validator');

const db = require('../db/connection');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const router = express.Router();

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const departments = db.prepare('SELECT * FROM departments ORDER BY name').all();
    res.json({ success: true, data: departments });
  })
);

router.get(
  '/:id',
  authenticate,
  [param('id').isInt().withMessage('id must be an integer.')],
  validate,
  asyncHandler(async (req, res) => {
    const department = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
    if (!department) {
      throw new ApiError(404, 'Department not found.');
    }
    res.json({ success: true, data: department });
  })
);

router.post(
  '/',
  authenticate,
  authorize('admin'),
  [
    body('name').trim().notEmpty().withMessage('Name is required.'),
    body('description').optional({ nullable: true }).isString(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { name, description } = req.body;

    const existing = db.prepare('SELECT id FROM departments WHERE name = ?').get(name);
    if (existing) {
      throw new ApiError(409, 'A department with this name already exists.');
    }

    const info = db
      .prepare('INSERT INTO departments (name, description) VALUES (?, ?)')
      .run(name, description || null);

    res.status(201).json({
      success: true,
      data: { id: info.lastInsertRowid, name, description: description || null },
    });
  })
);

router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  [
    param('id').isInt().withMessage('id must be an integer.'),
    body('name').trim().notEmpty().withMessage('Name is required.'),
    body('description').optional({ nullable: true }).isString(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;

    const department = db.prepare('SELECT id FROM departments WHERE id = ?').get(id);
    if (!department) {
      throw new ApiError(404, 'Department not found.');
    }

    db.prepare('UPDATE departments SET name = ?, description = ? WHERE id = ?').run(
      name,
      description || null,
      id
    );

    res.json({ success: true, data: { id: Number(id), name, description: description || null } });
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
    const department = db.prepare('SELECT id FROM departments WHERE id = ?').get(id);
    if (!department) {
      throw new ApiError(404, 'Department not found.');
    }
    db.prepare('DELETE FROM departments WHERE id = ?').run(id);
    res.json({ success: true, data: { id: Number(id) } });
  })
);

module.exports = router;
