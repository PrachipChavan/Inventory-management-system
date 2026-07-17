const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'inventory.db');

// Ensure database directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Connect to SQLite Database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite inventory database.');
    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON;', (err) => {
      if (err) console.error('Error enabling foreign keys:', err.message);
    });
  }
});

// Promise-based wrappers for database operations
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    db.run(sql, params, function (err) {
      const duration = Date.now() - startTime;
      if (err) {
        reject({ error: err, sql, duration });
      } else {
        resolve({ lastID: this.lastID, changes: this.changes, sql, duration });
      }
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    db.all(sql, params, (err, rows) => {
      const duration = Date.now() - startTime;
      if (err) {
        reject({ error: err, sql, duration });
      } else {
        resolve({ rows, sql, duration });
      }
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    db.get(sql, params, (err, row) => {
      const duration = Date.now() - startTime;
      if (err) {
        reject({ error: err, sql, duration });
      } else {
        resolve({ row, sql, duration });
      }
    });
  });
};

const dbExec = (sql) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    db.exec(sql, (err) => {
      const duration = Date.now() - startTime;
      if (err) {
        reject({ error: err, sql, duration });
      } else {
        resolve({ sql, duration });
      }
    });
  });
};

// Initialize database schema and seed data
async function initializeDatabase() {
  try {
    // Create Categories Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT
      )
    `);

    // Create Suppliers Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        contact_name TEXT,
        email TEXT,
        phone TEXT,
        address TEXT
      )
    `);

    // Create Products Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        category_id INTEGER,
        supplier_id INTEGER,
        price REAL NOT NULL CHECK(price >= 0),
        stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0),
        reorder_level INTEGER NOT NULL DEFAULT 10 CHECK(reorder_level >= 0),
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
      )
    `);

    // Create Transactions Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        transaction_type TEXT CHECK(transaction_type IN ('IN', 'OUT', 'ADJUST')),
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        unit_price REAL NOT NULL CHECK(unit_price >= 0),
        transaction_date TEXT DEFAULT (datetime('now', 'localtime')),
        remarks TEXT,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `);

    console.log('Tables initialized successfully.');

    // Seed Data if categories table is empty
    const { row: categoryCount } = await dbGet('SELECT COUNT(*) as count FROM categories');
    if (categoryCount.count === 0) {
      console.log('Seeding initial data...');

      // Seed Categories
      const categories = [
        ['Electronics', 'Gadgets, devices, smart appliances, and tech accessories'],
        ['Apparel & Fashion', 'Clothing, footwear, jackets, and accessories'],
        ['Home & Kitchen', 'Cookware, kitchen appliances, and home decor'],
        ['Office Supplies', 'Stationery, ergonomic furniture, and desk setups'],
        ['Sports & Outdoors', 'Fitness equipment, athletic gear, and camping supplies']
      ];
      for (const [name, desc] of categories) {
        await dbRun('INSERT INTO categories (name, description) VALUES (?, ?)', [name, desc]);
      }

      // Seed Suppliers
      const suppliers = [
        ['TechDistributors Inc.', 'Alice Smith', 'alice@techdist.com', '+1-555-0101', '123 Silicon Valley Road, San Jose, CA'],
        ['Global Threads Ltd.', 'Bob Jones', 'bob@globalthreads.com', '+1-555-0102', '456 Fashion Ave, New York, NY'],
        ['HomeEssentials Corp.', 'Clara Davis', 'clara@homeessentials.com', '+1-555-0103', '789 Cozy Lane, Austin, TX'],
        ['SwiftOffice Co.', 'David Miller', 'david@swiftoffice.com', '+1-555-0104', '101 Workstation Blvd, Chicago, IL'],
        ['ActiveLife Gear', 'Eva Green', 'eva@activelife.com', '+1-555-0105', '202 Mountain Peak Way, Denver, CO']
      ];
      for (const [name, contact, email, phone, addr] of suppliers) {
        await dbRun('INSERT INTO suppliers (name, contact_name, email, phone, address) VALUES (?, ?, ?, ?, ?)', [name, contact, email, phone, addr]);
      }

      // Seed Products
      // Products have category_ids (1 to 5) and supplier_ids (1 to 5)
      const products = [
        // Electronics
        ['SKU-ELE-001', 'Smartphone X', 'Latest generation flagship smartphone with 128GB storage', 1, 1, 799.99, 45, 10],
        ['SKU-ELE-002', 'Wireless Noise-Cancelling Headphones', 'Over-ear headphones with 40hr battery life', 1, 1, 149.99, 12, 5],
        ['SKU-ELE-003', 'Smart Watch Fitness Tracker', 'Waterproof fitness watch with heart-rate monitor', 1, 1, 89.99, 8, 10], // Low stock
        
        // Apparel & Fashion
        ['SKU-APP-001', 'Premium Leather Jacket', '100% genuine black leather slim-fit jacket', 2, 2, 199.99, 20, 5],
        ['SKU-APP-002', 'Unisex Cotton Hoodie', 'Super soft pullover hoodie in charcoal gray', 2, 2, 45.00, 60, 15],
        
        // Home & Kitchen
        ['SKU-HOM-001', 'Programmable Coffee Maker', '12-cup drip coffee maker with thermal carafe', 3, 3, 79.95, 30, 8],
        ['SKU-HOM-002', 'Air Fryer XL', '5.8-quart digital air fryer with 8 presets', 3, 3, 119.99, 4, 5], // Low stock

        // Office Supplies
        ['SKU-OFF-001', 'Ergonomic Mesh Chair', 'High-back desk chair with lumbar support and adjustable armrests', 4, 4, 249.99, 15, 5],
        ['SKU-OFF-002', 'Dual Monitor Arm Mount', 'Heavy-duty steel desk mount for two screens', 4, 4, 59.99, 25, 8],

        // Sports & Outdoors
        ['SKU-SPO-001', 'Carbon Fiber Tennis Racket', 'Professional lightweight racket with case', 5, 5, 129.50, 18, 5],
        ['SKU-SPO-002', 'Hydration Backpack 2L', 'Lightweight cycling running bladder bag', 5, 5, 34.99, 3, 5] // Low stock
      ];

      for (const [sku, name, desc, catId, supId, price, qty, reorder] of products) {
        await dbRun(
          'INSERT INTO products (sku, name, description, category_id, supplier_id, price, stock_quantity, reorder_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [sku, name, desc, catId, supId, price, qty, reorder]
        );
      }

      // Seed Transactions
      // Find the created product IDs and record initial STOCK-IN transactions
      const { rows: dbProducts } = await dbAll('SELECT id, price, stock_quantity FROM products');
      for (const p of dbProducts) {
        // Record stocking transaction
        await dbRun(
          'INSERT INTO transactions (product_id, transaction_type, quantity, unit_price, remarks) VALUES (?, ?, ?, ?, ?)',
          [p.id, 'IN', p.stock_quantity, p.price * 0.7, 'Initial system stock-in'] // Cost of goods sold estimated at 70% of price
        );
      }

      // Record a few historical OUT (sales) transactions to make history look realistic
      const { row: p1 } = await dbGet("SELECT id, price FROM products WHERE sku = 'SKU-ELE-001'");
      if (p1) {
        await dbRun('INSERT INTO transactions (product_id, transaction_type, quantity, unit_price, remarks) VALUES (?, ?, ?, ?, ?)',
          [p1.id, 'OUT', 5, p1.price, 'Store sale #1001']
        );
      }
      const { row: p2 } = await dbGet("SELECT id, price FROM products WHERE sku = 'SKU-APP-002'");
      if (p2) {
        await dbRun('INSERT INTO transactions (product_id, transaction_type, quantity, unit_price, remarks) VALUES (?, ?, ?, ?, ?)',
          [p2.id, 'OUT', 10, p2.price, 'Online web sale #1002']
        );
      }

      console.log('Database seeded successfully.');
    } else {
      console.log('Database already contains data, skipping seed.');
    }
  } catch (error) {
    console.error('Error during database initialization:', error);
  }
}

// Initialize tables and run seeder
initializeDatabase();

module.exports = {
  db,
  dbRun,
  dbAll,
  dbGet,
  dbExec
};
