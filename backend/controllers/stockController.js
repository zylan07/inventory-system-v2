const { getPool } = require('../db');

exports.getStock = async (req, res) => {
  const userRole = req.user?.role;
  if (userRole === 'Basic User') {
    return res.status(403).json({ success: false, message: 'Forbidden: Basic Users are not authorized to view stock levels.' });
  }

  try {
    const pool = getPool();
    // Get all products joined with preferred suppliers
    const [products] = await pool.query(`
      SELECT p.*, s.name as preferred_supplier_name 
      FROM products p 
      LEFT JOIN suppliers s ON p.preferred_supplier_id = s.id 
      ORDER BY p.group_name, p.product_name
    `);
    
    // Get all stock entries
    const [stockEntries] = await pool.query('SELECT product_id, warehouse_id, quantity FROM stock');
    
    // Structure like the existing frontend expects or at least aggregate it
    const formattedData = products.map(product => {
      // Find all stock for this specific product
      const productStock = stockEntries.filter(s => s.product_id === product.id);
      
      // Map warehouse_id -> quantity
      const stockMap = {};
      productStock.forEach(entry => {
        stockMap[entry.warehouse_id] = entry.quantity;
      });

      return {
        ...product,
        stock: stockMap
      };
    });

    res.json({ success: true, message: 'Stock fetched successfully', data: formattedData });
  } catch (err) {
    console.error('Error fetching stock:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch stock', data: null });
  }
};

exports.getStockByModelNo = async (req, res) => {
  const userRole = req.user?.role;
  if (userRole === 'Basic User') {
    return res.status(403).json({ success: false, message: 'Forbidden: Basic Users are not authorized to view stock levels.' });
  }

  try {
    const { modelNo } = req.params;
    const pool = getPool();
    
    // Find product joined with preferred supplier
    const [products] = await pool.query(`
      SELECT p.*, s.name as preferred_supplier_name 
      FROM products p 
      LEFT JOIN suppliers s ON p.preferred_supplier_id = s.id 
      WHERE p.model_no = ?
    `, [modelNo]);
    if (products.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found', data: null });
    }
    const product = products[0];

    // Find stock
    const [stockEntries] = await pool.query('SELECT warehouse_id, quantity FROM stock WHERE product_id = ?', [product.id]);
    
    const stockMap = {};
    stockEntries.forEach(entry => {
      stockMap[entry.warehouse_id] = entry.quantity;
    });

    res.json({
      success: true,
      message: 'Product stock fetched successfully',
      data: {
        ...product,
        stock: stockMap
      }
    });
  } catch (err) {
    console.error('Error fetching product stock:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch product stock', data: null });
  }
};
