// Global State
const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
let currentTab = 'dashboard';
let categories = [];
let suppliers = [];
let products = [];
let allTransactions = [];

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  lucide.createIcons();
  
  // Load initial data
  initializeApp();
  
  // Add keyboard shortcut for SQL Playground
  const sqlEditor = document.getElementById('sql-editor');
  if (sqlEditor) {
    sqlEditor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        executeSQLPlayground();
      }
    });
  }
});

async function initializeApp() {
  await fetchCategories();
  await fetchSuppliers();
  await fetchProducts();
  
  // Load the initial tab data
  switchTab('dashboard');
  
  // Initialize SQL schema drawer (keep products open by default)
  const schemaProd = document.getElementById('schema-products');
  if (schemaProd) schemaProd.classList.remove('collapsed');
}

// Tab Switching
function switchTab(tabName) {
  currentTab = tabName;
  
  // Update menu items active class
  document.querySelectorAll('.menu-item').forEach(item => {
    item.classList.remove('active');
  });
  
  const activeMenuBtn = document.getElementById(`tab-${tabName}`);
  if (activeMenuBtn) activeMenuBtn.classList.add('active');
  
  // Show/Hide sections
  document.querySelectorAll('.tab-section').forEach(section => {
    section.classList.remove('active');
  });
  
  const activeSection = document.getElementById(`sec-${tabName}`);
  if (activeSection) activeSection.classList.add('active');
  
  // Update Top Bar title
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) {
    pageTitle.textContent = tabName.charAt(0).toUpperCase() + tabName.slice(1).replace('-', ' ');
  }
  
  // Fetch fresh data for specific tab
  if (tabName === 'dashboard') {
    fetchDashboardStats();
  } else if (tabName === 'products') {
    fetchProducts();
  } else if (tabName === 'transactions') {
    fetchTransactions();
  } else if (tabName === 'suppliers') {
    fetchSuppliers();
  }
  
  // Pull live SQL query logs
  updateSQLLogs();
}

// Toast Notifications
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'info';
  if (type === 'success') icon = 'check-circle';
  if (type === 'error') icon = 'alert-triangle';
  
  toast.innerHTML = `
    <i data-lucide="${icon}"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);
  lucide.createIcons();
  
  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) reverse';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- API COMMUNICATIONS ---

// Fetch Stats for Dashboard
async function fetchDashboardStats() {
  try {
    const res = await fetch(API_BASE + '/api/dashboard/stats');
    if (!res.ok) throw new Error('Stats error');
    const data = await res.json();
    
    // Update Stats
    document.getElementById('stat-valuation').textContent = formatCurrency(data.totalValuation);
    document.getElementById('stat-total-products').textContent = data.totalProducts;
    document.getElementById('stat-low-stock').textContent = data.lowStockProducts;
    document.getElementById('stat-out-stock').textContent = data.outOfStockProducts;
    
    // Draw Category Chart
    renderCategoryChart(data.categories);
    
    // Render Recent Transactions
    renderRecentTransactions(data.recentTransactions);
    
    // Update live SQL drawer
    updateSQLLogs();
  } catch (err) {
    console.error(err);
    showToast('Failed to fetch dashboard stats', 'error');
  }
}

// Fetch all products
async function fetchProducts() {
  try {
    const search = document.getElementById('search-product').value;
    const category = document.getElementById('filter-category').value;
    const lowStock = document.getElementById('filter-lowstock').checked;
    
    let url = `/api/products?search=${encodeURIComponent(search)}`;
    if (category) url += `&category=${category}`;
    if (lowStock) url += `&lowStock=true`;
    
    const res = await fetch(API_BASE + url);
    if (!res.ok) throw new Error();
    products = await res.json();
    
    renderProductsTable();
    updateSQLLogs();
  } catch (err) {
    console.error(err);
    showToast('Failed to fetch products', 'error');
  }
}

// Fetch transactions history
async function fetchTransactions() {
  try {
    const res = await fetch(API_BASE + '/api/transactions');
    if (!res.ok) throw new Error();
    allTransactions = await res.json();
    
    renderTransactionsTable(allTransactions);
    updateSQLLogs();
  } catch (err) {
    console.error(err);
    showToast('Failed to load transaction history', 'error');
  }
}

// Fetch Categories
async function fetchCategories() {
  try {
    const res = await fetch(API_BASE + '/api/categories');
    if (!res.ok) throw new Error();
    categories = await res.json();
    
    // Populate filter category dropdown
    const filterCat = document.getElementById('filter-category');
    if (filterCat) {
      filterCat.innerHTML = '<option value="">All Categories</option>';
      categories.forEach(c => {
        filterCat.innerHTML += `<option value="${c.id}">${c.name}</option>`;
      });
    }
    
    // Populate form selects
    const pCategory = document.getElementById('p-category');
    if (pCategory) {
      pCategory.innerHTML = '<option value="">Select Category</option>';
      categories.forEach(c => {
        pCategory.innerHTML += `<option value="${c.id}">${c.name}</option>`;
      });
    }
  } catch (err) {
    console.error(err);
  }
}

// Fetch Suppliers
async function fetchSuppliers() {
  try {
    const res = await fetch(API_BASE + '/api/suppliers');
    if (!res.ok) throw new Error();
    suppliers = await res.json();
    
    // Render Suppliers Table
    renderSuppliersTable(suppliers);
    
    // Populate form selects
    const pSupplier = document.getElementById('p-supplier');
    if (pSupplier) {
      pSupplier.innerHTML = '<option value="">Select Supplier</option>';
      suppliers.forEach(s => {
        pSupplier.innerHTML += `<option value="${s.id}">${s.name}</option>`;
      });
    }
    updateSQLLogs();
  } catch (err) {
    console.error(err);
  }
}

// --- RENDER FUNCTIONS ---

// Draw SVG Dashboard Category Chart
function renderCategoryChart(data) {
  const container = document.getElementById('category-chart-container');
  if (!container) return;
  
  if (!data || data.length === 0 || data.every(c => !c.total_stock)) {
    container.innerHTML = `
      <div class="chart-empty">
        <i data-lucide="bar-chart-2"></i>
        <span>No stock data to graph</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  // Find max stock for percentage calculation
  const maxStock = Math.max(...data.map(c => c.total_stock || 0), 1);
  
  let html = '<div style="display: flex; width: 100%; height: 100%; align-items: flex-end; justify-content: space-around;">';
  
  data.forEach(c => {
    const stock = c.total_stock || 0;
    const heightPercent = Math.min((stock / maxStock) * 100, 100);
    const valuation = c.valuation || 0;
    
    html += `
      <div class="chart-bar-group">
        <div class="chart-bar" style="height: calc(${heightPercent}% - 5px)" data-val="${stock}" title="${c.name}: ${stock} units (Valued at ${formatCurrency(valuation)})"></div>
        <div class="chart-label" title="${c.name}">${c.name}</div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

// Render Recent Transactions (Dashboard)
function renderRecentTransactions(transactions) {
  const tbody = document.getElementById('recent-transactions-tbody');
  if (!tbody) return;
  
  if (!transactions || transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No transactions recorded yet</td></tr>';
    return;
  }
  
  tbody.innerHTML = '';
  transactions.forEach(t => {
    const isCost = t.transaction_type === 'IN';
    const typeLabel = t.transaction_type === 'IN' ? 'IN' : t.transaction_type === 'OUT' ? 'OUT' : 'ADJ';
    const typeClass = t.transaction_type === 'IN' ? 'badge-in' : t.transaction_type === 'OUT' ? 'badge-out' : 'badge-adjust';
    const dateStr = new Date(t.transaction_date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${dateStr}</td>
      <td style="font-weight: 500;">${escapeHtml(t.product_name)}</td>
      <td><span class="badge ${typeClass}">${typeLabel}</span></td>
      <td class="text-right">${t.quantity}</td>
      <td class="text-right">${formatCurrency(t.quantity * t.unit_price)}</td>
    `;
    tbody.appendChild(row);
  });
}

// Render Products Tab Table
function renderProductsTable() {
  const tbody = document.getElementById('products-tbody');
  if (!tbody) return;
  
  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">No products found matching filters</td></tr>';
    return;
  }
  
  tbody.innerHTML = '';
  products.forEach(p => {
    // Check Stock Level status
    let stockClass = 'stock-ok';
    let stockStatus = 'In Stock';
    if (p.stock_quantity === 0) {
      stockClass = 'stock-none';
      stockStatus = 'Out of Stock';
    } else if (p.stock_quantity <= p.reorder_level) {
      stockClass = 'stock-low';
      stockStatus = 'Low Stock';
    }
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="font-family: monospace; font-size: 13px;">${escapeHtml(p.sku)}</td>
      <td>
        <div style="font-weight: 500;">${escapeHtml(p.name)}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(p.description || 'No description')}</div>
      </td>
      <td>${escapeHtml(p.category_name || 'Unassigned')}</td>
      <td>${escapeHtml(p.supplier_name || 'Unassigned')}</td>
      <td class="text-right" style="font-weight: 500;">${formatCurrency(p.price)}</td>
      <td class="text-right">
        <span class="stock-tag ${stockClass}">${p.stock_quantity}</span>
        <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">${stockStatus}</div>
      </td>
      <td class="text-right" style="color: var(--text-secondary);">${p.reorder_level}</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon edit-btn" onclick="openProductModal(${p.id})" title="Edit Product">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="btn-icon delete-btn" onclick="deleteProduct(${p.id})" title="Delete Product">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
  
  lucide.createIcons();
}

// Render Transactions Tab Table
function renderTransactionsTable(transactions) {
  const tbody = document.getElementById('transactions-tbody');
  if (!tbody) return;
  
  if (transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">No inventory transactions logged yet</td></tr>';
    return;
  }
  
  tbody.innerHTML = '';
  transactions.forEach(t => {
    const typeLabel = t.transaction_type === 'IN' ? 'STOCK-IN' : t.transaction_type === 'OUT' ? 'STOCK-OUT' : 'ADJUST';
    const typeClass = t.transaction_type === 'IN' ? 'badge-in' : t.transaction_type === 'OUT' ? 'badge-out' : 'badge-adjust';
    const formattedDate = new Date(t.transaction_date).toLocaleString();
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${t.id}</td>
      <td>${formattedDate}</td>
      <td style="font-weight: 500;">${escapeHtml(t.product_name)}</td>
      <td style="font-family: monospace; font-size: 13px;">${escapeHtml(t.product_sku)}</td>
      <td><span class="badge ${typeClass}">${typeLabel}</span></td>
      <td class="text-right" style="font-weight: 500;">${t.quantity}</td>
      <td class="text-right">${formatCurrency(t.unit_price)}</td>
      <td class="text-right" style="font-weight: 600;">${formatCurrency(t.quantity * t.unit_price)}</td>
      <td><span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(t.remarks || '-')}</span></td>
    `;
    tbody.appendChild(row);
  });
}

// Render Suppliers Tab Table
function renderSuppliersTable(supList) {
  const tbody = document.getElementById('suppliers-tbody');
  if (!tbody) return;
  
  if (supList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No suppliers registered</td></tr>';
    return;
  }
  
  tbody.innerHTML = '';
  supList.forEach(s => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="font-weight: 600;">${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.contact_name || '-')}</td>
      <td>${s.email ? `<a href="mailto:${s.email}" style="color: var(--accent-hover); text-decoration: none;">${escapeHtml(s.email)}</a>` : '-'}</td>
      <td>${escapeHtml(s.phone || '-')}</td>
      <td><span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(s.address || '-')}</span></td>
    `;
    tbody.appendChild(row);
  });
}

// Filter tables locally on keypress
function filterTransactionsTable() {
  const query = document.getElementById('search-transaction').value.toLowerCase();
  const rows = document.querySelectorAll('#transactions-tbody tr');
  
  rows.forEach(row => {
    const prodName = row.children[2]?.textContent.toLowerCase() || '';
    const sku = row.children[3]?.textContent.toLowerCase() || '';
    const remarks = row.children[8]?.textContent.toLowerCase() || '';
    
    if (prodName.includes(query) || sku.includes(query) || remarks.includes(query)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

function filterSuppliersTable() {
  const query = document.getElementById('search-supplier').value.toLowerCase();
  const rows = document.querySelectorAll('#suppliers-tbody tr');
  
  rows.forEach(row => {
    const name = row.children[0]?.textContent.toLowerCase() || '';
    const contact = row.children[1]?.textContent.toLowerCase() || '';
    const email = row.children[2]?.textContent.toLowerCase() || '';
    
    if (name.includes(query) || contact.includes(query) || email.includes(query)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// --- MODAL SUBMISSIONS ---

// Product Add / Edit Save
async function saveProduct(event) {
  event.preventDefault();
  const id = document.getElementById('product-id').value;
  const payload = {
    sku: document.getElementById('p-sku').value,
    name: document.getElementById('p-name').value,
    description: document.getElementById('p-desc').value,
    category_id: document.getElementById('p-category').value,
    supplier_id: document.getElementById('p-supplier').value,
    price: parseFloat(document.getElementById('p-price').value),
    reorder_level: parseInt(document.getElementById('p-reorder').value)
  };
  
  // If creating, add stock qty
  if (!id) {
    payload.stock_quantity = parseInt(document.getElementById('p-stock').value || 0);
  }
  
  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/products/${id}` : '/api/products';
    
    const res = await fetch(API_BASE + url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.details || 'Operation failed');
    }
    
    showToast(id ? 'Product updated successfully' : 'Product created successfully');
    closeProductModal();
    fetchProducts();
    if (currentTab === 'dashboard') fetchDashboardStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Delete Product
async function deleteProduct(id) {
  if (!confirm('Are you sure you want to delete this product? All historical transactions for this product will be lost.')) return;
  
  try {
    const res = await fetch(API_BASE + `/api/products/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    
    showToast('Product deleted successfully');
    fetchProducts();
    if (currentTab === 'dashboard') fetchDashboardStats();
  } catch (err) {
    showToast('Failed to delete product', 'error');
  }
}

// Save Category
async function saveCategory(event) {
  event.preventDefault();
  const payload = {
    name: document.getElementById('cat-name').value,
    description: document.getElementById('cat-desc').value
  };
  
  try {
    const res = await fetch(API_BASE + '/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.details || 'Unique name violated');
    }
    
    showToast('Category created');
    closeCategoryModal();
    fetchCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Save Supplier
async function saveSupplier(event) {
  event.preventDefault();
  const payload = {
    name: document.getElementById('s-name').value,
    contact_name: document.getElementById('s-contact').value,
    email: document.getElementById('s-email').value,
    phone: document.getElementById('s-phone').value,
    address: document.getElementById('s-address').value
  };
  
  try {
    const res = await fetch(API_BASE + '/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error();
    
    showToast('Supplier registered successfully');
    closeSupplierModal();
    fetchSuppliers();
  } catch (err) {
    showToast('Failed to create supplier', 'error');
  }
}

// Log Inventory Movement Transaction
async function saveTransaction(event) {
  event.preventDefault();
  const payload = {
    product_id: document.getElementById('t-product').value,
    transaction_type: document.getElementById('t-type').value,
    quantity: parseInt(document.getElementById('t-qty').value),
    unit_price: parseFloat(document.getElementById('t-price').value),
    remarks: document.getElementById('t-remarks').value
  };
  
  try {
    const res = await fetch(API_BASE + '/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Log failed');
    }
    
    showToast('Stock movement logged successfully');
    closeTransactionModal();
    
    // Reload active tab
    if (currentTab === 'dashboard') fetchDashboardStats();
    if (currentTab === 'products') fetchProducts();
    if (currentTab === 'transactions') fetchTransactions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Transaction Modal Dynamic Changes
function handleTransactionProductChange() {
  const pId = document.getElementById('t-product').value;
  const selectProd = products.find(p => p.id == pId);
  const priceInput = document.getElementById('t-price');
  const stockInfo = document.getElementById('current-stock-info');
  
  if (selectProd) {
    priceInput.value = selectProd.price.toFixed(2);
    stockInfo.textContent = `Current Stock: ${selectProd.stock_quantity} units (Reorder lvl: ${selectProd.reorder_level})`;
  } else {
    priceInput.value = '';
    stockInfo.textContent = '';
  }
}

function handleTransactionTypeChange() {
  const type = document.getElementById('t-type').value;
  const qtyLabel = document.getElementById('t-qty-label');
  const priceLabel = document.getElementById('t-price-label');
  
  if (type === 'IN') {
    qtyLabel.textContent = 'Quantity to Restock *';
    priceLabel.textContent = 'Purchase Unit Cost ($) *';
  } else if (type === 'OUT') {
    qtyLabel.textContent = 'Quantity to Ship/Sell *';
    priceLabel.textContent = 'Selling Unit Price ($) *';
  } else if (type === 'ADJUST') {
    qtyLabel.textContent = 'Target Audited Quantity (Stock will overwrite to this value) *';
    priceLabel.textContent = 'Item Estimated Cost ($) *';
  }
}

// --- MODAL UTILITIES ---

function openProductModal(editId = null) {
  const form = document.getElementById('product-form');
  form.reset();
  document.getElementById('product-id').value = '';
  document.getElementById('p-stock-group').style.display = 'block';
  document.getElementById('product-modal-title').textContent = 'Add New Product';
  
  // Load categories and suppliers in modal options
  fetchCategories();
  fetchSuppliers();
  
  if (editId) {
    document.getElementById('product-id').value = editId;
    document.getElementById('p-stock-group').style.display = 'none'; // Cannot change initial stock on edit (must log transaction)
    document.getElementById('product-modal-title').textContent = 'Edit Product';
    
    const prod = products.find(p => p.id === editId);
    if (prod) {
      document.getElementById('p-sku').value = prod.sku;
      document.getElementById('p-name').value = prod.name;
      document.getElementById('p-desc').value = prod.description || '';
      document.getElementById('p-category').value = prod.category_id || '';
      document.getElementById('p-supplier').value = prod.supplier_id || '';
      document.getElementById('p-price').value = prod.price;
      document.getElementById('p-reorder').value = prod.reorder_level;
    }
  }
  
  document.getElementById('product-modal').classList.add('active');
}

function closeProductModal() {
  document.getElementById('product-modal').classList.remove('active');
}

function openCategoryModal() {
  document.getElementById('category-form').reset();
  document.getElementById('category-modal').classList.add('active');
}

function closeCategoryModal() {
  document.getElementById('category-modal').classList.remove('active');
}

function openSupplierModal() {
  document.getElementById('supplier-form').reset();
  document.getElementById('supplier-modal').classList.add('active');
}

function closeSupplierModal() {
  document.getElementById('supplier-modal').classList.remove('active');
}

function openTransactionModal() {
  document.getElementById('transaction-form').reset();
  document.getElementById('current-stock-info').textContent = '';
  
  // Populate products select
  const select = document.getElementById('t-product');
  select.innerHTML = '<option value="">-- Select Product --</option>';
  
  // Order products alphabetically
  const sortedProds = [...products].sort((a,b) => a.name.localeCompare(b.name));
  sortedProds.forEach(p => {
    select.innerHTML += `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sku)})</option>`;
  });
  
  // Trigger initial labels
  handleTransactionTypeChange();
  
  document.getElementById('transaction-modal').classList.add('active');
}

function closeTransactionModal() {
  document.getElementById('transaction-modal').classList.remove('active');
}

// --- INTERACTIVE SQL PLAYGROUND ---

// Templates Map
const SQL_TEMPLATES = {
  select_all: 'SELECT * FROM products ORDER BY stock_quantity ASC;',
  low_stock: 'SELECT sku, name, stock_quantity, reorder_level\nFROM products\nWHERE stock_quantity <= reorder_level\nORDER BY stock_quantity DESC;',
  val_by_cat: 'SELECT c.name AS category,\n       COUNT(p.id) AS unique_items,\n       SUM(p.stock_quantity) AS total_stock,\n       SUM(p.price * p.stock_quantity) AS total_valuation\nFROM categories c\nLEFT JOIN products p ON c.id = p.category_id\nGROUP BY c.id\nORDER BY total_valuation DESC;',
  sales_history: 'SELECT t.id, t.transaction_date, p.name AS product, t.quantity, t.unit_price,\n       (t.quantity * t.unit_price) AS total_sale\nFROM transactions t\nJOIN products p ON t.product_id = p.id\nWHERE t.transaction_type = \'OUT\'\nORDER BY t.transaction_date DESC;',
  supplier_performance: 'SELECT s.name AS supplier, COUNT(p.id) AS products_supplied,\n       SUM(p.stock_quantity) AS total_units_in_stock\nFROM suppliers s\nLEFT JOIN products p ON s.id = p.supplier_id\nGROUP BY s.id\nHAVING products_supplied > 0;'
};

function loadSQLTemplate() {
  const sel = document.getElementById('sql-templates').value;
  if (sel && SQL_TEMPLATES[sel]) {
    document.getElementById('sql-editor').value = SQL_TEMPLATES[sel];
  }
}

function clearSQLEditor() {
  document.getElementById('sql-editor').value = '';
  document.getElementById('sql-templates').value = '';
}

async function executeSQLPlayground() {
  const query = document.getElementById('sql-editor').value;
  const resultsCard = document.getElementById('sql-results-card');
  const metaSpan = document.getElementById('sql-query-meta');
  const outputDiv = document.getElementById('sql-output-content');
  
  if (!query.trim()) {
    showToast('SQL editor is empty', 'error');
    return;
  }
  
  metaSpan.textContent = 'Executing...';
  outputDiv.innerHTML = '<div class="loading-spinner"></div>';
  
  try {
    const res = await fetch(API_BASE + '/api/sql/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.message || 'Syntax error');
    }
    
    // Render Results
    metaSpan.textContent = `Executed in ${data.duration}ms`;
    
    if (data.type === 'SELECT') {
      metaSpan.textContent += ` | Returned ${data.rowCount} rows`;
      
      if (data.rows.length === 0) {
        outputDiv.innerHTML = `
          <div class="sql-output-placeholder">
            <i data-lucide="check-circle" style="color: var(--success); width: 32px; height: 32px;"></i>
            <p>Query executed successfully. Empty set returned (0 rows).</p>
          </div>
        `;
        lucide.createIcons();
        return;
      }
      
      // Render dynamic data table
      let tableHtml = '<table class="data-table" id="sql-results-table"><thead><tr>';
      
      // Columns
      data.columns.forEach(col => {
        tableHtml += `<th>${escapeHtml(col)}</th>`;
      });
      tableHtml += '</tr></thead><tbody>';
      
      // Rows
      data.rows.forEach(row => {
        tableHtml += 'tr>';
        tableHtml += '<tr>';
        data.columns.forEach(col => {
          const val = row[col];
          const displayVal = val === null ? '<span style="color: var(--text-muted); font-style: italic;">NULL</span>' : escapeHtml(String(val));
          tableHtml += `<td>${displayVal}</td>`;
        });
        tableHtml += '</tr>';
      });
      tableHtml += '</tbody></table>';
      
      outputDiv.innerHTML = tableHtml;
      
    } else {
      // DDL or DML (INSERT, UPDATE, DELETE)
      outputDiv.innerHTML = `
        <div class="sql-output-placeholder">
          <i data-lucide="check-circle" style="color: var(--success); width: 32px; height: 32px;"></i>
          <p>${escapeHtml(data.message)}</p>
        </div>
      `;
      lucide.createIcons();
      showToast('SQL executed successfully');
      
      // Refresh local dropdown caches if schema changed
      fetchCategories();
      fetchSuppliers();
    }
    
    // Sync live SQL logs
    updateSQLLogs();
    
  } catch (err) {
    metaSpan.textContent = 'Execution failed';
    outputDiv.innerHTML = `
      <div style="padding: 20px; color: var(--danger); font-family: 'Fira Code', monospace; font-size: 13px; line-height: 1.6; border: 1px dashed rgba(239, 68, 68, 0.3); border-radius: var(--border-radius-md); background: rgba(239, 68, 68, 0.05);">
        <div style="font-weight: 700; margin-bottom: 8px; font-size: 14px;">SQL Error:</div>
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
    showToast('SQL execution failed', 'error');
    updateSQLLogs();
  }
}

// Export SQL terminal results to CSV
function exportResultsTable() {
  const table = document.getElementById('sql-results-table');
  if (!table) {
    showToast('No table results to export', 'error');
    return;
  }
  
  let csv = [];
  const rows = table.querySelectorAll('tr');
  
  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i].querySelectorAll('td, th');
    let row = [];
    
    for (let j = 0; j < cols.length; j++) {
      let text = cols[j].textContent;
      // escape double quotes
      text = text.replace(/"/g, '""');
      row.push(`"${text}"`);
    }
    csv.push(row.join(','));
  }
  
  const csvContent = "data:text/csv;charset=utf-8," + csv.join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `sql_query_export_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Reset Database Confirmation
async function confirmResetDB() {
  if (!confirm('WARNING: This will drop all tables and restore the initial seeded data. Are you sure you want to reset the database?')) return;
  
  try {
    const res = await fetch(API_BASE + '/api/sql/reset', { method: 'POST' });
    if (!res.ok) throw new Error();
    
    showToast('Database reset and seeded successfully', 'info');
    
    // Refresh application state
    await initializeApp();
  } catch (err) {
    showToast('Failed to reset database', 'error');
  }
}

// Toggle Table helper accordion in SQL Playground
function toggleSchemaTable(elementId) {
  const elem = document.getElementById(elementId);
  const parent = elem.parentElement;
  
  if (elem.style.display === 'none' || elem.classList.contains('collapsed')) {
    elem.style.display = 'flex';
    elem.classList.remove('collapsed');
    parent.classList.remove('collapsed');
  } else {
    elem.style.display = 'none';
    elem.classList.add('collapsed');
    parent.classList.add('collapsed');
  }
}

// --- LIVE SQL LOG DRAWER ---

let drawerExpanded = false;

function toggleSqlLogDrawer() {
  const drawer = document.getElementById('sql-log-drawer');
  drawerExpanded = !drawerExpanded;
  
  if (drawerExpanded) {
    drawer.classList.add('expanded');
  } else {
    drawer.classList.remove('expanded');
  }
}

// Fetch live SQL logs from Express and render them
async function updateSQLLogs() {
  const content = document.getElementById('drawer-content');
  const countBadge = document.getElementById('log-count');
  if (!content) return;
  
  try {
    const res = await fetch(API_BASE + '/api/sql/logs');
    if (!res.ok) throw new Error();
    const logs = await res.json();
    
    countBadge.textContent = `${logs.length} logs`;
    
    if (logs.length === 0) {
      content.innerHTML = '<div class="console-placeholder">Perform actions in the app to see live SQL statements.</div>';
      return;
    }
    
    content.innerHTML = '';
    logs.forEach(l => {
      const isSuccess = l.success;
      const statusIcon = isSuccess ? 'check' : 'alert-circle';
      const statusClass = isSuccess ? 'success' : 'fail';
      
      const logDiv = document.createElement('div');
      logDiv.className = 'log-container';
      
      let html = `
        <div class="log-item">
          <span class="log-time">[${l.timestamp}]</span>
          <span class="log-op">${escapeHtml(l.operation)}</span>
          <i data-lucide="${statusIcon}" class="log-status ${statusClass}"></i>
          <span class="log-sql">${highlightSQL(l.sql)}</span>
          <span class="log-dur">${l.duration}ms</span>
        </div>
      `;
      
      if (!isSuccess && l.error) {
        html += `<div class="log-error-msg">Error: ${escapeHtml(l.error)}</div>`;
      }
      
      logDiv.innerHTML = html;
      content.appendChild(logDiv);
    });
    
    lucide.createIcons();
  } catch (err) {
    console.error('Failed to sync SQL logs:', err);
  }
}

// Simple SQL keyword highlighter
function highlightSQL(sql) {
  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'ON', 'GROUP BY', 'ORDER BY', 'LIMIT',
    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE TABLE', 'DROP TABLE',
    'INTEGER PRIMARY KEY', 'TEXT', 'REAL', 'NOT NULL', 'UNIQUE', 'FOREIGN KEY', 'REFERENCES',
    'PRAGMA', 'CHECK', 'DEFAULT', 'ON DELETE', 'CASCADE'
  ];
  
  let highlighted = escapeHtml(sql);
  
  keywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'gi');
    highlighted = highlighted.replace(regex, `<span class="keyword">${kw}</span>`);
  });
  
  // Strings
  highlighted = highlighted.replace(/('[^']*')/g, '<span class="string">$1</span>');
  // Numbers
  highlighted = highlighted.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="number">$1</span>');
  
  return highlighted;
}

// --- DATA UTILITIES ---

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
