# Inventory-management-system
<img width="1917" height="911" alt="Screenshot 2026-07-17 103325" src="https://github.com/user-attachments/assets/2ecee332-a705-4d55-9642-c0f73c126102" />

# 🗄️ SQL Inventory Management System

A premium, full-stack **Inventory Management System** powered by **Node.js**, **Express**, and **SQLite**. Features a beautiful dark-themed web interface with glassmorphism design, real-time SQL execution logs, an interactive SQL Playground, and complete inventory tracking.

---

## ✨ Features

- 📊 **Dashboard** — Live inventory valuation, product counts, low stock alerts, category bar charts, and recent transaction history
- 📦 **Product Management** — Full CRUD (Create, Read, Update, Delete) with SKU, category, supplier, price, and stock level tracking
- 🔄 **Stock Transactions** — Log Stock-In (restocking), Stock-Out (sales/shipments), and Adjust (audits) operations with automatic quantity updates
- 🏭 **Supplier & Category Management** — Register suppliers with contact details; organize products by category
- 🖥️ **Interactive SQL Playground** — Write and execute raw SQL queries directly against the SQLite database, with pre-built query templates and CSV export
- ⚡ **Live SQL Console** — A real-time bottom drawer showing every SQL statement executed by the UI (with syntax highlighting and execution times)
- 🔁 **Database Reset** — One-click reset to restore the database to seeded demo data

---

## 🛠️ Tech Stack

| Layer      | Technology              |
|------------|-------------------------|
| Backend    | Node.js + Express.js    |
| Database   | SQLite3 (file-based)    |
| Frontend   | Vanilla HTML, CSS, JS   |
| UI Design  | Glassmorphism Dark Theme |
| Fonts      | Inter, Outfit, Fira Code |
| Icons      | Lucide Icons            |

---

## 📁 Project Structure

```
inventory-management-system/
├── backend/
│   ├── database.js      # SQLite connection, schema creation & data seeding
│   └── server.js        # Express API routes
├── frontend/
│   ├── index.html       # Main UI layout with all sections and modals
│   ├── style.css        # Premium dark theme with glassmorphism styling
│   └── app.js           # Frontend logic, API calls, chart rendering
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v16 or higher
- npm (comes with Node.js)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/inventory-management-system.git

# 2. Navigate into the project directory
cd inventory-management-system

# 3. Install dependencies
npm install

# 4. Start the server
npm start
```

### Open the App

Once the server is running, open your browser and go to:

```
http://localhost:3000
```
