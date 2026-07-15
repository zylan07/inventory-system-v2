const { getPool } = require('../db');
const xlsx = require('xlsx');

exports.getProducts = async (req, res) => {
  try {
    const pool = getPool();
    const userRole = req.user?.role;

    if (userRole === 'Admin') {
      const [rows] = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
      res.json({ success: true, message: 'Products fetched successfully', data: rows });
    } else {
      const [rows] = await pool.query('SELECT id, product_name, model_no, unit FROM products ORDER BY model_no ASC');
      res.json({ success: true, message: 'Products selectors fetched successfully', data: rows });
    }
  } catch (err) {
    console.error('Error fetching products:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch products', data: null });
  }
};

const { logAction } = require('../utils/auditLogger');

exports.createProduct = async (req, res) => {
  try {
    const { group_name, product_name, model_no, description, min_stock, unit } = req.body;
    
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
      'INSERT INTO products (group_name, product_name, model_no, unit, description, min_stock) VALUES (?, ?, ?, ?, ?, ?)',
      [group_name, product_name, model_no, unit || 'pcs', description || null, min_stock || 10]
    );

    const newId = result.insertId;

    await logAction(req, {
      module: 'Products',
      action: 'CREATE_PRODUCT',
      reference_type: 'products',
      reference_id: newId,
      old_value: null,
      new_value: { group_name, product_name, model_no, unit, min_stock },
      description: `Created new product ${product_name} (Model: ${model_no}).`
    });

    res.status(201).json({ success: true, message: 'Product created successfully', data: { id: newId } });
  } catch (err) {
    console.error('Error creating product:', err.message);
    res.status(500).json({ success: false, message: 'Failed to create product', data: null });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { group_name, product_name, model_no, unit, description, min_stock } = req.body;

    if (!group_name || !product_name || !model_no) {
      return res.status(400).json({ success: false, message: 'Missing required product fields', data: null });
    }

    const pool = getPool();

    // Check if product exists
    const [existing] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found', data: null });
    }
    const oldProduct = existing[0];

    // Check if model number exists on another product
    const [duplicate] = await pool.query('SELECT id FROM products WHERE model_no = ? AND id != ?', [model_no, id]);
    if (duplicate.length > 0) {
      return res.status(400).json({ success: false, message: 'Product with this Model Number already exists', data: null });
    }

    // Update details
    await pool.query(
      'UPDATE products SET group_name = ?, product_name = ?, model_no = ?, unit = ?, description = ?, min_stock = ? WHERE id = ?',
      [group_name.trim(), product_name.trim(), model_no.trim().toUpperCase(), unit || 'pcs', description || null, min_stock || 10, id]
    );

    // Write audit log
    await logAction(req, {
      module: 'Products',
      action: 'PRODUCT_UPDATED',
      reference_type: 'products',
      reference_id: id,
      old_value: {
        group_name: oldProduct.group_name,
        product_name: oldProduct.product_name,
        model_no: oldProduct.model_no,
        unit: oldProduct.unit,
        description: oldProduct.description,
        min_stock: oldProduct.min_stock
      },
      new_value: {
        group_name: group_name.trim(),
        product_name: product_name.trim(),
        model_no: model_no.trim().toUpperCase(),
        unit: unit || 'pcs',
        description: description || null,
        min_stock: min_stock || 10
      },
      description: `Updated product ${product_name} details.`
    });

    res.json({ success: true, message: 'Product updated successfully', data: null });
  } catch (err) {
    console.error('Error updating product:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update product', data: null });
  }
};

exports.importProducts = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    // Read Excel
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1 }); // read as array of arrays

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Excel file is empty' });
    }

    // Headers are in rows[0]
    const headers = rows[0].map(h => String(h || '').trim());
    
    // Required headers
    const requiredHeaders = ['Group', 'Product Name', 'Model Number', 'Minimum Stock'];
    const missingHeaders = requiredHeaders.filter(rh => !headers.includes(rh));
    
    if (missingHeaders.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Missing required columns: ${missingHeaders.join(', ')}` 
      });
    }

    // Map headers to indexes
    const headerIndices = {
      group: headers.indexOf('Group'),
      product: headers.indexOf('Product Name'),
      model: headers.indexOf('Model Number'),
      minStock: headers.indexOf('Minimum Stock'),
      unit: headers.indexOf('Unit'),
      description: headers.indexOf('Description'),
    };

    let total = 0;
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];

    // Query all existing model numbers from DB to check for duplicates
    const [existingProducts] = await pool.query('SELECT model_no FROM products');
    const dbModelNos = new Set(existingProducts.map(p => String(p.model_no).toUpperCase()));

    // Keep track of model numbers seen in this file to find duplicates
    const seenModelNos = new Set();
    const productsToInsert = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue; // skip empty rows
      
      // Check if the entire row is empty cells
      const isRowEmpty = row.every(cell => cell === undefined || cell === null || String(cell).trim() === '');
      if (isRowEmpty) continue;

      total++;
      const rowNumber = i + 1; // Excel row number (1-based, headers at row 1, data starts at row 2)

      const groupVal = row[headerIndices.group];
      const productVal = row[headerIndices.product];
      const modelVal = row[headerIndices.model];
      const minStockVal = row[headerIndices.minStock];
      const unitVal = headerIndices.unit !== -1 ? row[headerIndices.unit] : null;
      const descVal = headerIndices.description !== -1 ? row[headerIndices.description] : null;

      // Validate mandatory fields
      if (groupVal === undefined || groupVal === null || String(groupVal).trim() === '') {
        failed++;
        errors.push(`Row ${rowNumber}: Group is required`);
        continue;
      }
      if (productVal === undefined || productVal === null || String(productVal).trim() === '') {
        failed++;
        errors.push(`Row ${rowNumber}: Product Name is required`);
        continue;
      }
      if (modelVal === undefined || modelVal === null || String(modelVal).trim() === '') {
        failed++;
        errors.push(`Row ${rowNumber}: Model Number is required`);
        continue;
      }
      if (minStockVal === undefined || minStockVal === null || String(minStockVal).trim() === '') {
        failed++;
        errors.push(`Row ${rowNumber}: Minimum Stock is required`);
        continue;
      }

      const modelNo = String(modelVal).trim().toUpperCase();

      // Check duplicates within the file
      if (seenModelNos.has(modelNo)) {
        failed++;
        errors.push(`Row ${rowNumber}: Duplicate Model Number "${modelNo}" within the file`);
        continue;
      }
      seenModelNos.add(modelNo);

      // Check data type for minStock
      const minStockNum = Number(minStockVal);
      if (isNaN(minStockNum) || minStockNum < 0) {
        failed++;
        errors.push(`Row ${rowNumber}: Minimum Stock must be a non-negative number`);
        continue;
      }

      // Check duplicate in database
      if (dbModelNos.has(modelNo)) {
        skipped++;
        errors.push(`Row ${rowNumber}: Product with Model Number "${modelNo}" already exists in the database. (Skipped)`);
        continue;
      }

      productsToInsert.push({
        group_name: String(groupVal).trim(),
        product_name: String(productVal).trim(),
        model_no: modelNo,
        unit: unitVal ? String(unitVal).trim() : 'pcs',
        description: descVal ? String(descVal).trim() : null,
        min_stock: minStockNum,
        rowNumber
      });
    }

    // Now insert valid products in a transaction block
    await conn.beginTransaction();

    try {
      for (const p of productsToInsert) {
        await conn.query(
          'INSERT INTO products (group_name, product_name, model_no, unit, description, min_stock) VALUES (?, ?, ?, ?, ?, ?)',
          [p.group_name, p.product_name, p.model_no, p.unit, p.description, p.min_stock]
        );
        imported++;
      }
      await conn.commit();
    } catch (insertErr) {
      await conn.rollback();
      console.error('Transaction rollback due to database error:', insertErr);
      return res.status(500).json({ 
        success: false, 
        message: 'Import failed due to database error. Transaction rolled back completely.', 
        error: insertErr.message 
      });
    }

    await logAction(req, {
      module: 'Products',
      action: failed > 0 && imported === 0 ? 'EXCEL_IMPORT_FAILED' : 'EXCEL_IMPORT',
      old_value: null,
      new_value: { total, imported, skipped, failed },
      description: `Excel product import completed. Processed: ${total}, Imported: ${imported}, Skipped: ${skipped}, Failed: ${failed}.`,
      status: failed > 0 && imported === 0 ? 'FAILED' : 'SUCCESS'
    });

    res.json({
      success: true,
      message: 'Excel processing completed successfully',
      data: {
        total,
        imported,
        skipped,
        failed,
        errors
      }
    });

  } catch (err) {
    console.error('Error importing products:', err.message);
    await logAction(req, {
      module: 'Products',
      action: 'EXCEL_IMPORT_FAILED',
      old_value: null,
      new_value: null,
      description: `Excel product import crashed: ${err.message}`,
      status: 'FAILED'
    });
    res.status(500).json({ success: false, message: 'Failed to process Excel file', error: err.message });
  } finally {
    conn.release();
  }
};
