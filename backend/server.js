const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { dbRun, dbAll, dbGet, dbExec } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Helper to log and track SQL queries executed via the API
const sqlLog = [];
function logQuery(operation, sql, duration, success, error = null) {
  sqlLog.unshift({
    id: Date.now() + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toLocaleTimeString(),
    operation,
    sql: sql.replace(/\s+/g, ' ').trim(),
    duration,
    success,
    error: error ? error.message : null
  });
  if (sqlLog.length > 50) sqlLog.pop(); // Keep last 50 logs
}

// Endpoint to get SQL execution logs
app.get('/api/sql/logs', (req, res) => {
  res.json(sqlLog);
});

// --- DASHBOARD ENDPOINTS ---

app.get('/api/dashboard/stats', async (req, res) => {
  try {
    // 1. Total products
    const q1 = 'SELECT COUNT(*) as count FROM products';
    const r1 = await dbGet(q1);
    logQuery('Dashboard Stats', q1, r1.duration, true);

    // 2. Low stock count
    const q2 = 'SELECT COUNT(*) as count FROM products WHERE stock_quantity <= reorder_level AND stock_quantity > 0';
    const r2 = await dbGet(q2);
    logQuery('Dashboard Stats', q2, r2.duration, true);

    // 3. Out of stock count
    const q3 = 'SELECT COUNT(*) as count FROM products WHERE stock_quantity = 0';
    const r3 = await dbGet(q3);
    logQuery('Dashboard Stats', q3, r3.duration, true);

    // 4. Total inventory valuation
    const q4 = 'SELECT SUM(price * stock_quantity) as valuation FROM products';
    const r4 = await dbGet(q4);
    logQuery('Dashboard Stats', q4, r4.duration, true);

    // 5. Total transactions
    const q5 = 'SELECT COUNT(*) as count FROM transactions';
    const r5 = await dbGet(q5);
    logQuery('Dashboard Stats', q5, r5.duration, true);

    // 6. Category breakdown (stock count and valuation)
    const q6 = `
      SELECT c.name, COUNT(p.id) as product_count, SUM(p.stock_quantity) as total_stock, SUM(p.price * p.stock_quantity) as valuation
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      GROUP BY c.id
    `;
    const r6 = await dbAll(q6);
    logQuery('Dashboard Stats', q6, r6.duration, true);

    // 7. Recent Transactions (last 5)
    const q7 = `
      SELECT t.id, t.transaction_type, t.quantity, t.unit_price, t.transaction_date, t.remarks, p.name as product_name
      FROM transactions t
      JOIN products p ON t.product_id = p.id
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT 5
    `;
    const r7 = await dbAll(q7);
    logQuery('Dashboard Stats', q7, r7.duration, true);

    res.json({
      totalProducts: r1.row.count,
      lowStockProducts: r2.row.count,
      outOfStockProducts: r3.row.count,
      totalValuation: r4.row.valuation || 0,
      totalTransactions: r5.row.count,
      categories: r6.rows,
      recentTransactions: r7.rows
    });
  } catch (error) {
    console.error(error);
    logQuery('Dashboard Stats Error', error.sql || 'N/A', error.duration || 0, false, error.error || error);
    res.status(500).json({ error: 'Failed to retrieve dashboard stats', details: error.error?.message || error.message });
  }
});

// --- PRODUCTS ENDPOINTS ---

// Get all products with search and filtering
app.get('/api/products', async (req, res) => {
  const { search, category, lowStock } = req.query;
  let query = `
    SELECT p.*, c.name as category_name, s.name as supplier_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)';
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam);
  }

  if (category) {
    query += ' AND p.category_id = ?';
    params.push(category);
  }

  if (lowStock === 'true') {
    query += ' AND p.stock_quantity <= p.reorder_level';
  }

  query += ' ORDER BY p.id DESC';

  try {
    const result = await dbAll(query, params);
    logQuery('Get Products', query, result.duration, true);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    logQuery('Get Products Error', error.sql || 'N/A', error.duration || 0, false, error.error || error);
    res.status(500).json({ error: 'Failed to retrieve products', details: error.error?.message || error.message });
  }
});

// Create product
app.post('/api/products', async (req, res) => {
  const { sku, name, description, category_id, supplier_id, price, stock_quantity, reorder_level } = req.body;

  if (!sku || !name || price === undefined) {
    return res.status(400).json({ error: 'SKU, name, and price are required' });
  }

  const query = `
    INSERT INTO products (sku, name, description, category_id, supplier_id, price, stock_quantity, reorder_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    sku, 
    name, 
    description || null, 
    category_id ? parseInt(category_id) : null, 
    supplier_id ? parseInt(supplier_id) : null, 
    parseFloat(price), 
    stock_quantity ? parseInt(stock_quantity) : 0, 
    reorder_level !== undefined ? parseInt(reorder_level) : 10
  ];

  try {
    // Insert the product
    const result = await dbRun(query, params);
    logQuery('Create Product', query, result.duration, true);

    // If stock_quantity > 0, log an initial IN transaction
    if (stock_quantity && parseInt(stock_quantity) > 0) {
      const transQuery = `
        INSERT INTO transactions (product_id, transaction_type, quantity, unit_price, remarks)
        VALUES (?, 'IN', ?, ?, 'Initial inventory count on product creation')
      `;
      const transResult = await dbRun(transQuery, [result.lastID, parseInt(stock_quantity), parseFloat(price)]);
      logQuery('Log Initial Transaction', transQuery, transResult.duration, true);
    }

    res.status(201).json({ id: result.lastID, sku, name, message: 'Product created successfully' });
  } catch (error) {
    console.error(error);
    logQuery('Create Product Error', error.sql || 'N/A', error.duration || 0, false, error.error || error);
    res.status(500).json({ error: 'Failed to create product', details: error.error?.message || error.message });
  }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { sku, name, description, category_id, supplier_id, price, reorder_level } = req.body;

  if (!sku || !name || price === undefined) {
    return res.status(400).json({ error: 'SKU, name, and price are required' });
  }

  const query = `
    UPDATE products
    SET sku = ?, name = ?, description = ?, category_id = ?, supplier_id = ?, price = ?, reorder_level = ?
    WHERE id = ?
  `;
  const params = [
    sku,
    name,
    description || null,
    category_id ? parseInt(category_id) : null,
    supplier_id ? parseInt(supplier_id) : null,
    parseFloat(price),
    reorder_level !== undefined ? parseInt(reorder_level) : 10,
    parseInt(id)
  ];

  try {
    const result = await dbRun(query, params);
    logQuery('Update Product', query, result.duration, true);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product updated successfully' });
  } catch (error) {
    console.error(error);
    logQuery('Update Product Error', error.sql || 'N/A', error.duration || 0, false, error.error || error);
    res.status(500).json({ error: 'Failed to update product', details: error.error?.message || error.message });
  }
});

// Delete product
app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM products WHERE id = ?';

  try {
    const result = await dbRun(query, [id]);
    logQuery('Delete Product', query, result.duration, true);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error(error);
    logQuery('Delete Product Error', error.sql || 'N/A', error.duration || 0, false, error.error || error);
    res.status(500).json({ error: 'Failed to delete product', details: error.error?.message || error.message });
  }
});

// --- TRANSACTIONS ENDPOINTS ---

// Get all transactions
app.get('/api/transactions', async (req, res) => {
  const query = `
    SELECT t.*, p.name as product_name, p.sku as product_sku
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    ORDER BY t.transaction_date DESC, t.id DESC
  `;
  try {
    const result = await dbAll(query);
    logQuery('Get Transactions', query, result.duration, true);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    logQuery('Get Transactions Error', error.sql || 'N/A', error.duration || 0, false, error.error || error);
    res.status(500).json({ error: 'Failed to retrieve transactions', details: error.error?.message || error.message });
  }
});

// Add stock transaction (IN/OUT/ADJUST) and update inventory
app.post('/api/transactions', async (req, res) => {
  const { product_id, transaction_type, quantity, unit_price, remarks } = req.body;

  if (!product_id || !transaction_type || !quantity || unit_price === undefined) {
    return res.status(400).json({ error: 'Product ID, transaction type, quantity, and unit price are required' });
  }

  const pId = parseInt(product_id);
  const qty = parseInt(quantity);
  const price = parseFloat(unit_price);

  if (qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be positive' });
  }

  try {
    // 1. Get current product stock
    const selectQuery = 'SELECT stock_quantity, name FROM products WHERE id = ?';
    const selectResult = await dbGet(selectQuery, [pId]);
    logQuery('Fetch Product Stock', selectQuery, selectResult.duration, true);

    if (!selectResult.row) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let currentStock = selectResult.row.stock_quantity;
    let newStock = currentStock;

    if (transaction_type === 'IN') {
      newStock += qty;
    } else if (transaction_type === 'OUT') {
      if (currentStock < qty) {
        return res.status(400).json({ error: `Insufficient stock. Current stock is ${currentStock}.` });
      }
      newStock -= qty;
    } else if (transaction_type === 'ADJUST') {
      // In adjustments, remarks should specify if it was a positive or negative adjustment.
      // Usually, quantity is the change. We will assume the API caller sends a positive quantity,
      // and we adjust based on the comment, or we can assume ADJUST adds or replaces.
      // Let's assume ADJUST transaction adds or subtracts. We will use a standard: ADJUST adds the quantity.
      // If they want to adjust down, let's treat the payload quantity as the target quantity.
      // For simplicity: transaction quantity here is added to stock. If they want to decrease stock via adjustment,
      // they must specify a positive quantity, but select type OUT or just pass a target. Let's make ADJUST replace the stock quantity.
      newStock = qty;
    } else {
      return res.status(400).json({ error: 'Invalid transaction type. Must be IN, OUT, or ADJUST.' });
    }

    // 2. Perform updates sequentially
    const updateQuery = 'UPDATE products SET stock_quantity = ? WHERE id = ?';
    const updateResult = await dbRun(updateQuery, [newStock, pId]);
    logQuery('Update Product Stock', updateQuery, updateResult.duration, true);

    // Calculate actual transaction quantity (for ADJUST, it is newStock - oldStock)
    const transactionQty = transaction_type === 'ADJUST' ? Math.abs(newStock - currentStock) : qty;
    const finalTransType = transaction_type === 'ADJUST' ? (newStock >= currentStock ? 'IN' : 'OUT') : transaction_type;

    // 3. Log transaction
    const insertQuery = `
      INSERT INTO transactions (product_id, transaction_type, quantity, unit_price, remarks)
      VALUES (?, ?, ?, ?, ?)
    `;
    const insertResult = await dbRun(insertQuery, [pId, transaction_type, transactionQty, price, remarks || `Stock update: ${transaction_type}`]);
    logQuery('Log Transaction', insertQuery, insertResult.duration, true);

    res.status(201).json({
      message: 'Transaction recorded successfully',
      transactionId: insertResult.lastID,
      newStock
    });

  } catch (error) {
    console.error(error);
    logQuery('Record Transaction Error', error.sql || 'N/A', error.duration || 0, false, error.error || error);
    res.status(500).json({ error: 'Failed to record transaction', details: error.error?.message || error.message });
  }
});

// --- CATEGORIES & SUPPLIERS ENDPOINTS ---

// Get all categories
app.get('/api/categories', async (req, res) => {
  const query = 'SELECT * FROM categories ORDER BY name ASC';
  try {
    const result = await dbAll(query);
    logQuery('Get Categories', query, result.duration, true);
    res.json(result.rows);
  } catch (error) {
    logQuery('Get Categories Error', error.sql || 'N/A', error.duration || 0, false, error.error || error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

// Create category
app.post('/api/categories', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });

  const query = 'INSERT INTO categories (name, description) VALUES (?, ?)';
  try {
    const result = await dbRun(query, [name, description || null]);
    logQuery('Create Category', query, result.duration, true);
    res.status(201).json({ id: result.lastID, name, message: 'Category created' });
  } catch (error) {
    logQuery('Create Category Error', error.sql || 'N/A', error.duration || 0, false, error.error || error);
    res.status(500).json({ error: 'Failed to create category. Note: Names must be unique.', details: error.error?.message || error.message });
  }
});

// Get all suppliers
app.get('/api/suppliers', async (req, res) => {
  const query = 'SELECT * FROM suppliers ORDER BY name ASC';
  try {
    const result = await dbAll(query);
    logQuery('Get Suppliers', query, result.duration, true);
    res.json(result.rows);
  } catch (error) {
    logQuery('Get Suppliers Error', error.sql || 'N/A', error.duration || 0, false, error.error || error);
    res.status(500).json({ error: 'Failed to get suppliers' });
  }
});

// Create supplier
app.post('/api/suppliers', async (req, res) => {
  const { name, contact_name, email, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Supplier name is required' });

  const query = 'INSERT INTO suppliers (name, contact_name, email, phone, address) VALUES (?, ?, ?, ?, ?)';
  try {
    const result = await dbRun(query, [name, contact_name || null, email || null, phone || null, address || null]);
    logQuery('Create Supplier', query, result.duration, true);
    res.status(201).json({ id: result.lastID, name, message: 'Supplier created' });
  } catch (error) {
    logQuery('Create Supplier Error', error.sql || 'N/A', error.duration || 0, false, error.error || error);
    res.status(500).json({ error: 'Failed to create supplier', details: error.error?.message || error.message });
  }
});

// --- INTERACTIVE SQL PLAYGROUND ---

// Execute arbitrary SQL query
app.post('/api/sql/execute', async (req, res) => {
  const { query } = req.body;
  if (!query || query.trim() === '') {
    return res.status(400).json({ error: 'Query is empty' });
  }

  const trimmedQuery = query.trim();
  const isSelect = trimmedQuery.toUpperCase().startsWith('SELECT') || trimmedQuery.toUpperCase().startsWith('PRAGMA');

  try {
    let result;
    if (isSelect) {
      result = await dbAll(trimmedQuery);
      logQuery('SQL Playground SELECT', trimmedQuery, result.duration, true);
      
      // Send rows and columns
      const rows = result.rows || [];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      res.json({
        type: 'SELECT',
        columns,
        rows,
        duration: result.duration,
        rowCount: rows.length
      });
    } else {
      // Execute INSERT, UPDATE, DELETE, CREATE, DROP etc.
      // If it contains multiple statements separated by semicolons, we can use dbExec.
      // Otherwise dbRun is better to get changes/lastID details.
      if (trimmedQuery.includes(';')) {
        result = await dbExec(trimmedQuery);
        logQuery('SQL Playground EXEC', trimmedQuery, result.duration, true);
        res.json({
          type: 'EXECUTE',
          duration: result.duration,
          message: 'SQL batch statements executed successfully.'
        });
      } else {
        result = await dbRun(trimmedQuery);
        logQuery('SQL Playground RUN', trimmedQuery, result.duration, true);
        res.json({
          type: 'RUN',
          duration: result.duration,
          changes: result.changes,
          lastID: result.lastID,
          message: `Query executed successfully. Rows affected: ${result.changes}.`
        });
      }
    }
  } catch (error) {
    console.error('SQL Execution Error:', error);
    const errObj = error.error || error;
    logQuery('SQL Playground ERROR', trimmedQuery, error.duration || 0, false, errObj);
    res.status(400).json({
      error: 'SQL Syntax/Execution Error',
      message: errObj.message || 'Unknown error occurred during SQL execution',
      sql: trimmedQuery
    });
  }
});

// Reset database and seed again (for demonstration safety)
app.post('/api/sql/reset', async (req, res) => {
  try {
    console.log('Resetting database...');
    // Drop tables
    await dbRun('DROP TABLE IF EXISTS transactions');
    await dbRun('DROP TABLE IF EXISTS products');
    await dbRun('DROP TABLE IF EXISTS suppliers');
    await dbRun('DROP TABLE IF EXISTS categories');

    // Delete database file and re-run database script (by requiring it or deleting the db and invoking setup)
    // For simplicity, we delete the tables and then re-import or re-run setup.
    // Let's re-run initialization:
    const dbModule = require('./database');
    // We can clear requires cache if needed, but since our initialization function runs in database.js,
    // we can just delete the db file or let database.js do the initialization again by deleting tables first.
    // To make it robust, we drop tables and then delete the db file, then load database.js again.
    
    // We can resolve this easily by deleting the file and letting the server restart or re-initialize.
    // Since node keeps the db locked, dropping tables and running a shell script or custom init function is cleaner.
    // Let's run a custom script to drop and re-create.
    // We will delete database file:
    // First close connection
    dbModule.db.close(async (err) => {
      if (err) console.error('Error closing database before reset:', err.message);
      
      const dbFile = path.join(__dirname, 'inventory.db');
      if (fs.existsSync(dbFile)) {
        try {
          fs.unlinkSync(dbFile);
        } catch (unlinkErr) {
          console.error('Could not unlink database file (locked), purging tables instead.', unlinkErr);
        }
      }

      // Re-require database to re-initialize
      delete require.cache[require.resolve('./database')];
      const newDb = require('./database');
      
      // Let it wait a moment
      setTimeout(() => {
        logQuery('SQL Reset', 'DB Restored & Seeded', 10, true);
        res.json({ message: 'Database reset and seeded successfully' });
      }, 500);
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reset database', details: error.message });
  }
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
