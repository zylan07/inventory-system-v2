const { getPool } = require('../db');

exports.getProducts = async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    res.json({ success: true, message: 'Products fetched successfully', data: rows });
  } catch (err) {
    console.error('Error fetching products:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch products', data: null });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const { group_name, product_name, model_no, description, min_stock } = req.body;
    
    if (!group_name || !product_name || !model_no) {
      return res.status(400).json({ success: false, message: 'Missing required product fields', data: null });
    }

    const pool = getPool();
    
    // Check if model number exists
    const [existing] = await pool.query('SELECT id FROM products WHERE model_no = ?', [model_no]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Product with this Model Number already exists', data: null });
    }

    const [result] = await pool.query(
      'INSERT INTO products (group_name, product_name, model_no, description, min_stock) VALUES (?, ?, ?, ?, ?)',
      [group_name, product_name, model_no, description || null, min_stock || 10]
    );

    res.status(201).json({ success: true, message: 'Product created successfully', data: { id: result.insertId } });
  } catch (err) {
    console.error('Error creating product:', err.message);
    res.status(500).json({ success: false, message: 'Failed to create product', data: null });
  }
};
