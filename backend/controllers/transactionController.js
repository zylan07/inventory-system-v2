const { getPool } = require('../db');

exports.getTransactions = async (req, res) => {
  try {
    const pool = getPool();
    // Join with products layer to return model number nicely
    const [rows] = await pool.query(`
      SELECT 
        t.*, 
        p.model_no as modelNumber
      FROM transactions t
      JOIN products p ON t.product_id = p.id
      ORDER BY t.created_at DESC
    `);
    
    res.json({ success: true, message: 'Transactions fetched successfully', data: rows });
  } catch (err) {
    console.error('Error fetching transactions:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions', data: null });
  }
};

exports.createTransaction = async (req, res) => {
  const pool = getPool();
  const conn = await pool.getConnection();

  // Keep transaction atomic
  await conn.beginTransaction();

  try {
    const { type, product_id, quantity, warehouse_id, to_warehouse_id, narration, adjustmentType } = req.body;

    if (!type || !product_id || quantity === undefined || !warehouse_id) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Missing required transaction fields', data: null });
    }

    if (quantity < 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Quantity must be positive', data: null });
    }

    const numericQuantity = Number(quantity);

    // Fetch current stock
    const [stockRows] = await conn.query(
      'SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ? FOR UPDATE',
      [product_id, warehouse_id]
    );
    const currentStock = stockRows.length > 0 ? stockRows[0].quantity : 0;

    let transactionLogType = type;
    let finalNarration = narration;

    // Logic based on types
    if (type === 'INWARD') {
      await updateStock(conn, product_id, warehouse_id, numericQuantity);
    } 
    else if (type === 'OUTWARD') {
      if (currentStock < numericQuantity) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Insufficient stock in the selected warehouse', data: null });
      }
      await updateStock(conn, product_id, warehouse_id, -numericQuantity);
    } 
    else if (type === 'TRANSFER') {
      if (!to_warehouse_id) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Transfer requires a destination warehouse', data: null });
      }
      if (warehouse_id === to_warehouse_id) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Source and destination warehouses cannot be the same', data: null });
      }
      if (currentStock < numericQuantity) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Insufficient stock in the source warehouse to transfer', data: null });
      }

      // Deduct from source
      await updateStock(conn, product_id, warehouse_id, -numericQuantity);
      
      // Add to destination
      await updateStock(conn, product_id, to_warehouse_id, numericQuantity);
    }
    else if (type === 'ADJUSTMENT') {
      // Need adjustmentType (ADD or SUBTRACT)
      if (adjustmentType === 'ADD') {
        await updateStock(conn, product_id, warehouse_id, numericQuantity);
      } else if (adjustmentType === 'SUBTRACT') {
        if (currentStock < numericQuantity) {
          await conn.rollback();
          return res.status(400).json({ success: false, message: 'Cannot subtract more than current stock', data: null });
        }
        await updateStock(conn, product_id, warehouse_id, -numericQuantity);
      } else {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Invalid adjustment type specified', data: null });
      }
      
      if (!finalNarration) {
        finalNarration = `Adjustment: ${adjustmentType}`;
      }
    } else {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Invalid transaction type', data: null });
    }

    // Insert log
    await conn.query(`
      INSERT INTO transactions 
        (type, product_id, quantity, warehouse_id, to_warehouse_id, narration) 
      VALUES (?, ?, ?, ?, ?, ?)
    `, [type, product_id, numericQuantity, warehouse_id, to_warehouse_id || null, finalNarration || null]);

    await conn.commit();
    res.status(201).json({ success: true, message: 'Transaction successfully processed', data: null });

  } catch (err) {
    if (conn) await conn.rollback();
    console.error('Error creating transaction:', err.message);
    res.status(500).json({ success: false, message: 'Transaction failed due to an internal error', data: null });
  } finally {
    if (conn) conn.release();
  }
};

// Helper function to handle upserting stock increments/decrements safely
async function updateStock(conn, productId, warehouseId, deltaQty) {
  // If it's a positive delta, we INSERT OR UPDATE
  // If it's negative delta, we UPDATE (but relying on prior check that row exists and has enough)
  await conn.query(`
    INSERT INTO stock (product_id, warehouse_id, quantity) 
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE quantity = quantity + ?
  `, [productId, warehouseId, deltaQty, deltaQty]);
}
