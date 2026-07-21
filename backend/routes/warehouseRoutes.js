const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const { requireAdmin } = require('../middleware/authMiddleware');
const { logAction } = require('../utils/auditLogger');

// GET /warehouses - list all warehouses
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT id, name FROM warehouses ORDER BY name ASC');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Failed to fetch warehouses:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch warehouses' });
  }
});

// POST /warehouses - add a new warehouse (Admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Warehouse Name is required' });
  }
  try {
    const pool = getPool();
    const trimmedName = name.trim();
    const id = 'WH' + Date.now(); // Generate a unique ID
    
    await pool.query('INSERT INTO warehouses (id, name) VALUES (?, ?)', [id, trimmedName]);

    await logAction(req, {
      module: 'Warehouse',
      action: 'ADD_WAREHOUSE',
      reference_type: 'warehouses',
      reference_id: id,
      old_value: null,
      new_value: { id, name: trimmedName },
      description: `Added warehouse: ${trimmedName} (${id})`
    });

    res.status(201).json({ success: true, message: 'Warehouse added successfully', data: { id, name: trimmedName } });
  } catch (err) {
    console.error('Failed to add warehouse:', err.message);
    res.status(500).json({ success: false, message: 'Failed to add warehouse' });
  }
});

// PUT /warehouses/:id - rename warehouse (Admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Warehouse Name is required' });
  }
  try {
    const pool = getPool();
    const trimmedName = name.trim();

    const [existing] = await pool.query('SELECT name FROM warehouses WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Warehouse not found' });
    }
    const oldName = existing[0].name;

    await pool.query('UPDATE warehouses SET name = ? WHERE id = ?', [trimmedName, id]);

    await logAction(req, {
      module: 'Warehouse',
      action: 'RENAME_WAREHOUSE',
      reference_type: 'warehouses',
      reference_id: id,
      old_value: { name: oldName },
      new_value: { name: trimmedName },
      description: `Warehouse renamed: ${oldName} -> ${trimmedName} by Admin`
    });

    res.json({ success: true, message: 'Warehouse renamed successfully', data: { id, name: trimmedName } });
  } catch (err) {
    console.error('Failed to rename warehouse:', err.message);
    res.status(500).json({ success: false, message: 'Failed to rename warehouse' });
  }
});

// DELETE /warehouses/:id - delete a warehouse (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const pool = getPool();
    const [existing] = await pool.query('SELECT name FROM warehouses WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Warehouse not found' });
    }
    const whName = existing[0].name;

    // Check if there are transactions associated
    const [txs] = await pool.query('SELECT COUNT(*) as count FROM transactions WHERE warehouse_id = ? OR from_warehouse_id = ? OR to_warehouse_id = ?', [id, id, id]);
    if (txs[0].count > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete warehouse because it is referenced in transaction history logs.' });
    }

    await pool.query('DELETE FROM warehouses WHERE id = ?', [id]);

    await logAction(req, {
      module: 'Warehouse',
      action: 'DELETE_WAREHOUSE',
      reference_type: 'warehouses',
      reference_id: id,
      old_value: { name: whName },
      new_value: null,
      description: `Warehouse deleted: ${whName} by Admin`
    });

    res.json({ success: true, message: 'Warehouse deleted successfully' });
  } catch (err) {
    console.error('Failed to delete warehouse:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete warehouse: ' + err.message });
  }
});

module.exports = router;
