const { getPool } = require('../db');
const { sendMail } = require('../utils/mailer');
const { logAction } = require('../utils/auditLogger');

exports.getTransactions = async (req, res) => {
  const userRole = req.user?.role;
  if (userRole === 'Basic User') {
    return res.status(403).json({ success: false, message: 'Forbidden: Basic Users are not authorized to view transaction reports.' });
  }

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
    const { 
      type, product_id, quantity, warehouse_id, to_warehouse_id, narration, 
      adjustmentType, client_id, unit_price 
    } = req.body;
    const userEmail = req.user?.email || 'System';
    const userRole = req.user?.role;

    if (userRole === 'Basic User' && type !== 'OUTWARD') {
      await conn.rollback();
      return res.status(403).json({ success: false, message: 'Forbidden: Basic Users can only perform Outward transactions.' });
    }
    if (userRole === 'Manager' && type === 'ADJUSTMENT') {
      await conn.rollback();
      return res.status(403).json({ success: false, message: 'Forbidden: Managers cannot perform Adjustment transactions.' });
    }

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

    // Fetch product pricing & details
    const [pRows] = await conn.query(
      'SELECT product_name, model_no, purchase_price, selling_price FROM products WHERE id = ?', 
      [product_id]
    );
    if (pRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Product not found', data: null });
    }
    const product = pRows[0];
    const pName = product.product_name;
    const pModel = product.model_no;

    let txnUnitPrice = 0.00;
    let txnClientId = null;

    // Logic based on types
    if (type === 'INWARD') {
      await updateStock(conn, product_id, warehouse_id, numericQuantity);
      txnUnitPrice = unit_price !== undefined ? parseFloat(unit_price) : parseFloat(product.purchase_price);
    } 
    else if (type === 'OUTWARD') {
      if (currentStock < numericQuantity) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Insufficient stock in the selected warehouse', data: null });
      }
      if (!client_id) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Client selection is required for outward transactions.', data: null });
      }
      
      // Verify client exists
      const [cRows] = await conn.query('SELECT company_name FROM clients WHERE id = ?', [client_id]);
      if (cRows.length === 0) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Selected client not found.', data: null });
      }

      await updateStock(conn, product_id, warehouse_id, -numericQuantity);
      txnUnitPrice = unit_price !== undefined ? parseFloat(unit_price) : parseFloat(product.selling_price);
      txnClientId = parseInt(client_id);

      // Automatically maintain purchase history (last purchase timestamp)
      await conn.query('UPDATE clients SET last_purchase_at = CURRENT_TIMESTAMP WHERE id = ?', [txnClientId]);
      if (!finalNarration) {
        finalNarration = `Sale to ${cRows[0].company_name}`;
      }
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

    const txnTotalValue = txnUnitPrice * numericQuantity;

    // Insert log
    const [txnResult] = await conn.query(`
      INSERT INTO transactions 
        (type, product_id, quantity, warehouse_id, to_warehouse_id, user_email, narration, client_id, unit_price, total_value) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      type, 
      product_id, 
      numericQuantity, 
      warehouse_id, 
      to_warehouse_id || null, 
      userEmail, 
      finalNarration || null,
      txnClientId,
      txnUnitPrice,
      txnTotalValue
    ]);

    const txnId = txnResult.insertId;

    // Reuse pName and pModel retrieved earlier in the function block

    // Fetch warehouse names
    const [wRows] = await conn.query('SELECT name FROM warehouses WHERE id = ?', [warehouse_id]);
    const wName = wRows.length > 0 ? wRows[0].name : 'N/A';
    
    let toWName = '';
    if (to_warehouse_id) {
      const [twRows] = await conn.query('SELECT name FROM warehouses WHERE id = ?', [to_warehouse_id]);
      if (twRows.length > 0) toWName = twRows[0].name;
    }

    let actionLabel = type; // INWARD, OUTWARD, TRANSFER, ADJUSTMENT
    let desc = `${type} transaction of ${numericQuantity} units for product ${pName} (${pModel}) at warehouse ${wName}.`;
    if (type === 'TRANSFER') {
      desc = `Stock Transfer of ${numericQuantity} units for product ${pName} (${pModel}) from ${wName} to ${toWName}.`;
    } else if (type === 'ADJUSTMENT') {
      desc = `Physical Stock Adjustment (${adjustmentType}) of ${numericQuantity} units for product ${pName} (${pModel}) at ${wName}.`;
    }

    await logAction(req, {
      module: 'Stock',
      action: actionLabel,
      reference_type: 'transactions',
      reference_id: txnId,
      old_value: { currentStock },
      new_value: { type, quantity: numericQuantity, adjustmentType, narration: finalNarration },
      description: desc
    });

    // Send Notification to Managers (With Grouping Logic)
    const notifPath = `/${type.toLowerCase()}`;
    const notifTypeStr = type.toLowerCase();
    
    const [recentNotif] = await conn.query(`
      SELECT id, group_count FROM notifications 
      WHERE type = ? AND role = 'Manager' AND created_at >= NOW() - INTERVAL 2 MINUTE
      ORDER BY id DESC LIMIT 1
    `, [notifTypeStr]);

    if (recentNotif.length > 0) {
      const gCount = recentNotif[0].group_count + 1;
      await conn.query(`
        UPDATE notifications 
        SET group_count = ?, 
            title = 'Multiple ${type} Transactions',
            message = ?,
            created_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [gCount, `${gCount} ${notifTypeStr} transactions were recorded recently.`, recentNotif[0].id]);
    } else {
      await conn.query(`
        INSERT INTO notifications (title, message, type, role, redirect_path, group_count)
        VALUES (?, ?, ?, 'Manager', ?, 1)
      `, [
        `New ${type} Transaction`,
        `A ${notifTypeStr} transaction of ${numericQuantity} units was recorded by ${userEmail}.`,
        notifTypeStr,
        notifPath
      ]);
    }

    await conn.commit();
    res.status(201).json({ success: true, message: 'Transaction successfully processed', data: null });

    // NON-BLOCKING ALERT HOOK
    if (type === 'INWARD' || type === 'OUTWARD' || type === 'ADJUSTMENT') {
      console.log(`[DEBUG_ALERT] Transaction committed. Calling checkAndSendAlert for ${type} on product ${product_id}, warehouse ${warehouse_id}`);
      checkAndSendAlert(product_id, warehouse_id).catch(e => console.error(e));
    } else if (type === 'TRANSFER') {
      console.log(`[DEBUG_ALERT] Transaction committed. Calling checkAndSendAlert for TRANSFER on product ${product_id}, source warehouse ${warehouse_id}, dest warehouse ${to_warehouse_id}`);
      checkAndSendAlert(product_id, warehouse_id).catch(e => console.error(e));
      checkAndSendAlert(product_id, to_warehouse_id).catch(e => console.error(e));
    }

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

// Fire-and-forget function
async function checkAndSendAlert(productId, warehouseId) {
  console.log(`[DEBUG_ALERT] Hook triggered for ProductID: ${productId}, WarehouseID: ${warehouseId}`);
  try {
    const pool = getPool();

    // Fetch stock and product details
    const [rows] = await pool.query(`
      SELECT 
        s.quantity, 
        s.alert_sent, 
        p.product_name, 
        p.model_no, 
        p.min_stock,
        w.name as warehouse_name
      FROM stock s
      JOIN products p ON s.product_id = p.id
      JOIN warehouses w ON s.warehouse_id = w.id
      WHERE s.product_id = ? AND s.warehouse_id = ?
    `, [productId, warehouseId]);

    if (!rows || rows.length === 0) {
      console.log(`[DEBUG_ALERT] No stock/product data found for ProductID: ${productId}, WarehouseID: ${warehouseId}. Exiting.`);
      return;
    }

    const data = rows[0];
    console.log(`[DEBUG_ALERT] Fetched Data - Quantity: ${data.quantity}, Min_Stock: ${data.min_stock}, Alert_Sent: ${data.alert_sent}`);

    const conditionPassed = data.quantity < data.min_stock;
    console.log(`[DEBUG_ALERT] Condition (quantity < min_stock) evaluated to: ${conditionPassed}`);

    // Check if we need to send an email
    if (conditionPassed && !data.alert_sent) {
      console.log(`[DEBUG_ALERT] Condition met! alert_sent is FALSE. Proceeding to update alert_sent latch...`);
      // Prevent race conditions using conditional update
      const [updateRes] = await pool.query(
        'UPDATE stock SET alert_sent = TRUE WHERE product_id = ? AND warehouse_id = ? AND alert_sent = FALSE AND quantity < ?',
        [productId, warehouseId, data.min_stock]
      );

      console.log(`[DEBUG_ALERT] Latch update query completed. Affected rows: ${updateRes.affectedRows}`);

      // If affectedRows is 0, someone else already grabbed the lock
      if (updateRes.affectedRows === 0) {
        console.log(`[DEBUG_ALERT] Latch blocked execution (affectedRows is 0). Another process may have grabbed the lock or condition changed.`);
        return;
      }

      console.log(`[DEBUG_ALERT] Latch acquired. Fetching Admins and Managers for email notification...`);
      // Fetch Admins and Managers
      const [userRows] = await pool.query(`
        SELECT email FROM users 
        WHERE role IN ('Admin', 'Manager') AND is_active = TRUE
      `);

      if (userRows.length === 0) {
        console.log(`[DEBUG_ALERT] No eligible admin/manager found to send email. Exiting.`);
        return;
      }

      console.log(`[DEBUG_ALERT] Recipient emails fetched: ${userRows.map(u => u.email).join(', ')}`);

      // Add Notification for Managers/Admins (Distinct, No Grouping)
      try {
        await pool.query(`
          INSERT INTO notifications (title, message, type, role, redirect_path)
          VALUES (?, ?, 'low_stock', 'Manager', '/dashboard')
        `, [
          `Low Stock Alert: ${data.product_name}`,
          `Product ${data.product_name} (${data.model_no}) in ${data.warehouse_name} has fallen below minimum stock (${data.min_stock}). Current: ${data.quantity}`
        ]);
        console.log(`[DEBUG_ALERT] Low stock notification created for role Manager`);
      } catch (notifErr) {
        console.error(`[DEBUG_ALERT] Error creating notification:`, notifErr.message);
      }

      console.log(`[DEBUG_ALERT] Preparing HTML email content...`);
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <h2 style="color: #d9534f;">⚠️ Low Stock Alert</h2>
          <p>A product is running critically low on stock in <strong>${data.warehouse_name}</strong>.</p>
          <table style="border-collapse: collapse; width: 100%; max-width: 500px; margin-top: 10px;">
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; background-color: #f9f9f9;">Product Name</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${data.product_name}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; background-color: #f9f9f9;">Model Number</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${data.model_no}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; background-color: #f9f9f9;">Warehouse</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${data.warehouse_name}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; background-color: #f9f9f9;">Current Stock</td>
              <td style="border: 1px solid #ddd; padding: 8px; color: #d9534f; font-weight: bold;">${data.quantity}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; background-color: #f9f9f9;">Minimum Required</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${data.min_stock}</td>
            </tr>
          </table>
          <p style="margin-top: 20px;">Please review the inventory and restock immediately.</p>
          <br/>
          <small style="color: #777;">This is an automated message from the Inventra System.</small>
        </div>
      `;

      // Send to each admin individually via a try/catch loop
      for (const user of userRows) {
        try {
          console.log(`[DEBUG_ALERT] Attempting to send email to: ${user.email}`);
          await sendMail({
            to: user.email,
            subject: `⚠️ Low Stock Alert: ${data.product_name} (${data.model_no})`,
            html: htmlContent
          });
          console.log(`[DEBUG_ALERT] 📧 Success: Low stock alert sent to ${user.email} for product ${productId}`);
        } catch (emailErr) {
          console.error(`[DEBUG_ALERT] ❌ Failed to send low stock alert to ${user.email}:`, emailErr.message);
        }
      }
    } 
    // Condition to RESET the alert lock if stock is restored safely above limits
    else if (data.quantity >= data.min_stock && data.alert_sent) {
      console.log(`[DEBUG_ALERT] Stock restored above min_stock and alert_sent is TRUE. Resetting alert latch.`);
      const [updateRes] = await pool.query(
        'UPDATE stock SET alert_sent = FALSE WHERE product_id = ? AND warehouse_id = ? AND alert_sent = TRUE AND quantity >= ?',
        [productId, warehouseId, data.min_stock]
      );
      console.log(`[DEBUG_ALERT] 🟢 Stock restored for product ${productId} in warehouse ${warehouseId}. Alert lock reset. Affected rows: ${updateRes.affectedRows}`);
    } else {
      console.log(`[DEBUG_ALERT] No action taken. Condition passed: ${conditionPassed}, Alert already sent: ${data.alert_sent}`);
    }

  } catch (err) {
    console.error('[DEBUG_ALERT] ❌ Error in checkAndSendAlert Hook:', err, err.message);
  }
}

