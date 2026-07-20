const { getPool } = require('../db');
const { sendMail } = require('../utils/mailer');

/**
 * Checks if product stock in a specific warehouse has fallen below the reorder point.
 * If so, inserts a recommendation to the purchase queue and sends alert emails.
 * 
 * Reorder Point = (ADC * Lead Time) + (Safety Stock * Global Multiplier)
 * Suggested Order Qty = Reorder Point - Current Stock (or configured product reorder quantity if larger)
 */
async function checkReorder(productId, warehouseId) {
  const pool = getPool();
  try {
    console.log(`🔍 Checking reorder triggers for Product ID: ${productId}, Warehouse: ${warehouseId}...`);

    // 1. Fetch product details and joined preferred supplier info
    const [prodRows] = await pool.query(`
      SELECT p.*, s.name as supplier_name, s.phone as supplier_phone, s.email as supplier_email
      FROM products p
      LEFT JOIN suppliers s ON p.preferred_supplier_id = s.id
      WHERE p.id = ?
    `, [productId]);

    if (prodRows.length === 0) {
      console.log(`⚠️ Product ID ${productId} not found. Skipping reorder check.`);
      return;
    }
    const product = prodRows[0];
    const leadTime = parseInt(product.lead_time_days) || 0;
    const safetyStock = parseInt(product.safety_stock) || 0;
    const reorderQtyConfig = parseInt(product.reorder_quantity) || 0;
    
    const supplierName = product.supplier_name || 'Direct/Default Supplier';
    const supplierContact = product.supplier_phone || product.supplier_email 
      ? `${product.supplier_phone || ''} ${product.supplier_email || ''}`.trim()
      : 'N/A';

    // 2. Fetch current safety multiplier from settings
    let safetyMultiplier = 1.0;
    const [settRows] = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'business_configuration'");
    if (settRows.length > 0) {
      try {
        const config = JSON.parse(settRows[0].setting_value);
        if (config?.thresholds?.global_safety_multiplier) {
          safetyMultiplier = parseFloat(config.thresholds.global_safety_multiplier) || 1.0;
        }
      } catch (e) {
        console.error("Failed to parse settings JSON for multiplier:", e.message);
      }
    }

    // 3. Fetch current stock in this warehouse
    const [stockRows] = await pool.query('SELECT quantity FROM stock WHERE product_id = ? AND warehouse_id = ?', [productId, warehouseId]);
    const currentStock = stockRows.length > 0 ? parseInt(stockRows[0].quantity) || 0 : 0;

    // 4. Fetch warehouse name
    const [whRows] = await pool.query('SELECT name FROM warehouses WHERE id = ?', [warehouseId]);
    const warehouseName = whRows.length > 0 ? whRows[0].name : warehouseId;

    // 5. Calculate Average Daily Consumption (ADC) for last 30 days in this warehouse
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const [txRows] = await pool.query(`
      SELECT COALESCE(SUM(quantity), 0) as total_qty 
      FROM transactions 
      WHERE product_id = ? AND warehouse_id = ? AND type = 'OUTWARD' AND created_at >= ?
    `, [productId, warehouseId, thirtyDaysAgo]);
    
    const outwardQty30 = parseInt(txRows[0].total_qty) || 0;
    const adc = outwardQty30 / 30;

    // 6. Evaluate Reorder Point
    const reorderPoint = (adc * leadTime) + (safetyStock * safetyMultiplier);
    
    console.log(`📊 Product: ${product.product_name} (${product.model_no}). Stock: ${currentStock}, Reorder Point: ${reorderPoint.toFixed(2)} (ADC: ${adc.toFixed(2)}/day, LT: ${leadTime} days, SS: ${safetyStock}, Mult: ${safetyMultiplier}x)`);

    if (currentStock <= reorderPoint) {
      // Reorder is required!
      const suggestedOrderQty = Math.max(Math.ceil(reorderPoint - currentStock), reorderQtyConfig, 1);
      
      // Calculate suggested purchase date
      const remainingDays = adc > 0 ? currentStock / adc : Infinity;
      const daysToOrder = remainingDays === Infinity ? 0 : Math.max(0, Math.ceil(remainingDays - leadTime));
      const now = new Date();
      const suggestedPurchaseDate = new Date(now.getTime() + daysToOrder * 24 * 60 * 60 * 1000);

      // Check if there is already a Pending or Ordered entry in the purchase queue for this product + warehouse
      const [queueRows] = await pool.query(
        "SELECT id, status FROM purchase_queue WHERE product_id = ? AND warehouse_id = ? AND status IN ('Pending', 'Ordered')",
        [productId, warehouseId]
      );

      if (queueRows.length > 0) {
        console.log(`ℹ️ Recommendation already active in queue (Status: ${queueRows[0].status}) for ${product.model_no} in ${warehouseId}. Skipping insert.`);
        return;
      }

      // Insert/Update into purchase_queue
      await pool.query(`
        INSERT INTO purchase_queue (product_id, warehouse_id, reorder_qty, status)
        VALUES (?, ?, ?, 'Pending')
        ON DUPLICATE KEY UPDATE reorder_qty = ?, status = 'Pending'
      `, [productId, warehouseId, suggestedOrderQty, suggestedOrderQty]);
      console.log(`📥 Added/Updated ${product.model_no} in purchase_queue with qty ${suggestedOrderQty}.`);

      // Query active internal purchase team users to notify
      const [users] = await pool.query('SELECT email FROM users WHERE purchase_team = TRUE AND is_active = TRUE');
      let emails = users.map(u => u.email);

      // Query active external purchase team recipients
      const [externals] = await pool.query('SELECT email FROM purchase_team_recipients WHERE is_active = TRUE');
      const externalEmails = externals.map(e => e.email);

      // Merge and deduplicate
      emails = [...new Set([...emails, ...externalEmails])];

      if (emails.length > 0) {
        const subject = `⚠️ Alert: Purchase Replenishment Required for ${product.product_name} (${product.model_no})`;
        const text = `
Hello Purchase Team,

This is an automated alert from Inventra. The stock level for the following item has fallen below its calculated reorder threshold.

REPLENISHMENT DETAILS:
-------------------------------------------
Product: ${product.product_name}
Model Number: ${product.model_no}
Warehouse: ${warehouseName} (ID: ${warehouseId})
Current Stock: ${currentStock} units
Minimum Stock Level: ${product.min_stock || 0} units
Safety Stock Buffer: ${safetyStock} units
Average Daily Consumption (ADC): ${adc.toFixed(2)} units/day
Lead Time: ${leadTime} days

RECOMMENDED ACTION:
-------------------------------------------
Recommended Order Qty: ${suggestedOrderQty} units
Preferred Supplier: ${supplierName}
Supplier Contact Details: ${supplierContact}
Suggested Purchase Date: ${suggestedPurchaseDate.toLocaleDateString()}

WHY IS THIS RECOMMENDED?
-------------------------------------------
Current Stock (${currentStock} units) is less than or equal to the Reorder Point (${reorderPoint.toFixed(1)} units).
At the current consumption rate of ${adc.toFixed(2)} units per day, the remaining stock will last approximately ${remainingDays === Infinity ? '∞' : remainingDays.toFixed(1)} days.
Considering a supplier lead time of ${leadTime} days, orders must be initiated on or before ${suggestedPurchaseDate.toLocaleDateString()} to avoid a stockout.

Please log into the Inventra dashboard to process this recommendation.
        `;

        for (const recipientEmail of emails) {
          try {
            await sendMail({
              to: recipientEmail,
              subject,
              text
            });
            console.log(`📧 Dispatched replenishment email alert to: ${recipientEmail}`);
          } catch (mailErr) {
            console.error(`❌ Failed to send reorder alert email to ${recipientEmail}:`, mailErr.message);
          }
        }
      } else {
        console.log("ℹ️ No active users subscribed to Purchase Team notifications. Skipping email alert.");
      }
    }
  } catch (error) {
    console.error(`❌ Error checking reorder point for Product ${productId}:`, error.message);
  }
}

module.exports = {
  checkReorder
};
