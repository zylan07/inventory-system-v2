const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const { authMiddleware } = require('../middleware/authMiddleware');

const requireManagerOrAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'Admin' || req.user.role === 'Manager')) {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Forbidden: Manager or Admin access required' });
  }
};

// GET /purchase-queue - Retrieve purchase recommendation queue with dynamic sorting
router.get('/', authMiddleware, async (req, res) => {
  const pool = getPool();
  try {
    // 1. Fetch settings for safety stock multiplier
    let safetyMultiplier = 1.0;
    const [settRows] = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'business_configuration'");
    if (settRows.length > 0) {
      try {
        const config = JSON.parse(settRows[0].setting_value);
        if (config?.thresholds?.global_safety_multiplier) {
          safetyMultiplier = parseFloat(config.thresholds.global_safety_multiplier) || 1.0;
        }
      } catch (e) {}
    }

    // 2. Fetch all rows in purchase_queue joined with product, supplier, and warehouse info
    const [queueRows] = await pool.query(`
      SELECT 
        q.*, 
        p.product_name, 
        p.model_no, 
        p.lead_time_days, 
        p.safety_stock, 
        p.reorder_quantity, 
        p.min_stock,
        s.name as supplier_name, 
        s.phone as supplier_phone, 
        s.email as supplier_email,
        w.name as warehouse_name
      FROM purchase_queue q
      JOIN products p ON q.product_id = p.id
      JOIN warehouses w ON q.warehouse_id = w.id
      LEFT JOIN suppliers s ON p.preferred_supplier_id = s.id
      ORDER BY q.created_at DESC
    `);

    // 3. For each queue entry, fetch dynamic current stock and 30-day outward transactions
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const enrichPromises = queueRows.map(async (row) => {
      // Current stock in specific warehouse
      const [stRows] = await pool.query(
        'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?',
        [row.product_id, row.warehouse_id]
      );
      const currentStock = stRows.length > 0 ? parseInt(stRows[0].quantity) || 0 : 0;

      // Outward quantity in last 30 days
      const [txRows] = await pool.query(`
        SELECT COALESCE(SUM(quantity), 0) as total_qty 
        FROM transactions 
        WHERE product_id = ? AND warehouse_id = ? AND type = 'OUTWARD' AND created_at >= ?
      `, [row.product_id, row.warehouse_id, thirtyDaysAgo]);
      const outwardQty30 = parseInt(txRows[0].total_qty) || 0;

      const adc = outwardQty30 / 30;
      const remainingDays = adc > 0 ? currentStock / adc : Infinity;
      const leadTime = parseInt(row.lead_time_days) || 0;
      const safetyStock = parseInt(row.safety_stock) || 0;
      const reorderPoint = (adc * leadTime) + (safetyStock * safetyMultiplier);

      // Stock risk: lower current stock relative to reorder point represents higher risk (lower ratio is riskier)
      const stockRiskRatio = reorderPoint > 0 ? (currentStock / reorderPoint) : 1.0;

      return {
        ...row,
        currentStock,
        adc,
        remainingDays,
        reorderPoint,
        stockRiskRatio,
        supplier_contact: row.supplier_phone || row.supplier_email
          ? `${row.supplier_phone || ''} ${row.supplier_email || ''}`.trim()
          : 'N/A'
      };
    });

    const enrichedQueue = await Promise.all(enrichPromises);

    // 4. Perform dynamic sorting: Lowest Days Remaining -> Highest Stock Risk (Lowest ratio) -> Highest ADC
    enrichedQueue.sort((a, b) => {
      // 1. Lowest Days Remaining (Infinity sorted to the bottom)
      const daysA = a.remainingDays === Infinity ? 99999 : a.remainingDays;
      const daysB = b.remainingDays === Infinity ? 99999 : b.remainingDays;
      if (daysA !== daysB) {
        return daysA - daysB;
      }

      // 2. Highest Stock Risk (Lower ratio is riskier, so sort ascending)
      if (a.stockRiskRatio !== b.stockRiskRatio) {
        return a.stockRiskRatio - b.stockRiskRatio;
      }

      // 3. Highest ADC (Sort descending)
      return b.adc - a.adc;
    });

    res.json({ success: true, data: enrichedQueue });
  } catch (err) {
    console.error('Error fetching purchase queue:', err.message);
    res.status(500).json({ success: false, message: 'Failed to retrieve purchase queue: ' + err.message });
  }
});

// PUT /purchase-queue/:id - Update recommendation status
router.put('/:id', authMiddleware, requireManagerOrAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const pool = getPool();

  const validStatuses = ['Pending', 'Ordered', 'Received', 'Cancelled'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const [result] = await pool.query(
      'UPDATE purchase_queue SET status = ? WHERE id = ?',
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Purchase queue item not found' });
    }

    res.json({ success: true, message: 'Queue item status updated successfully.' });
  } catch (err) {
    console.error('Failed to update purchase queue status:', err.message);
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

module.exports = router;
