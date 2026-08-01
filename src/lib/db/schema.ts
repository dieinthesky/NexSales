import type { NxDB } from './client'

function tableColumns(db: NxDB, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return new Set(rows.map((r) => r.name))
}

/** Add missing columns on existing userData DBs (CREATE TABLE IF NOT EXISTS won't). */
function migrateSchema(db: NxDB): void {
  const products = tableColumns(db, 'products')
  if (!products.has('track_stock')) {
    db.exec(`ALTER TABLE products ADD COLUMN track_stock INTEGER NOT NULL DEFAULT 1`)
  }
  if (!products.has('image_url')) {
    db.exec(`ALTER TABLE products ADD COLUMN image_url TEXT`)
  }

  const saleItems = tableColumns(db, 'sale_items')
  if (!saleItems.has('item_description')) {
    db.exec(`ALTER TABLE sale_items ADD COLUMN item_description TEXT`)
  }
}

export function initSchema(db: NxDB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id               TEXT PRIMARY KEY,
      code             TEXT NOT NULL,
      name             TEXT NOT NULL,
      description      TEXT,
      sale_price       REAL NOT NULL,
      cost_price       REAL NOT NULL DEFAULT 0,
      stock_quantity   INTEGER NOT NULL DEFAULT 0,
      min_stock        INTEGER NOT NULL DEFAULT 0,
      category_id      TEXT,
      is_active        INTEGER NOT NULL DEFAULT 1,
      track_stock      INTEGER NOT NULL DEFAULT 1,
      image_url        TEXT,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id          TEXT PRIMARY KEY,
      full_name   TEXT NOT NULL,
      phone       TEXT,
      notes       TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id              TEXT PRIMARY KEY,
      total_amount    REAL NOT NULL,
      payment_method  TEXT NOT NULL,
      notes           TEXT,
      seller_id       TEXT NOT NULL,
      created_at      TEXT NOT NULL,
      client_uuid     TEXT,
      customer_id     TEXT
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id                 TEXT PRIMARY KEY,
      sale_id            TEXT NOT NULL,
      product_id         TEXT NOT NULL,
      quantity           INTEGER NOT NULL,
      unit_price         REAL NOT NULL,
      subtotal           REAL NOT NULL,
      item_description   TEXT,
      FOREIGN KEY (sale_id)    REFERENCES sales(id)    ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS debt_payments (
      id           TEXT PRIMARY KEY,
      customer_id  TEXT NOT NULL,
      amount       REAL NOT NULL,
      notes        TEXT,
      recorded_by  TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type   TEXT NOT NULL,
      entity_type  TEXT NOT NULL,
      entity_id    TEXT NOT NULL,
      payload      TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      synced_at    TEXT,
      status       TEXT NOT NULL DEFAULT 'pending',
      attempts     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      table_name     TEXT PRIMARY KEY,
      last_synced_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sales_created_at        ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_customer_id       ON sales(customer_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id      ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_product_id   ON sale_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_debt_payments_customer  ON debt_payments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_products_is_active      ON products(is_active);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status       ON sync_queue(status);
  `)

  migrateSchema(db)

  // Refresh view definition on every boot (IF NOT EXISTS keeps stale SQL).
  db.exec(`DROP VIEW IF EXISTS customer_balances`)
  db.exec(`
    CREATE VIEW customer_balances AS
    SELECT
      c.id,
      c.full_name,
      c.phone,
      c.notes,
      c.created_at,
      c.updated_at,
      COALESCE(
        (SELECT SUM(s.total_amount) FROM sales s
         WHERE s.customer_id = c.id AND s.payment_method = 'fiado'), 0
      ) AS total_fiado,
      COALESCE(
        (SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.customer_id = c.id), 0
      ) AS total_paid,
      COALESCE(
        (SELECT SUM(s.total_amount) FROM sales s
         WHERE s.customer_id = c.id AND s.payment_method = 'fiado'), 0
      ) - COALESCE(
        (SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.customer_id = c.id), 0
      ) AS current_debt,
      (SELECT MAX(dp.created_at) FROM debt_payments dp WHERE dp.customer_id = c.id)
        AS last_payment_at,
      (SELECT MIN(s.created_at) FROM sales s
       WHERE s.customer_id = c.id AND s.payment_method = 'fiado')
        AS first_fiado_at
    FROM customers c;
  `)
}
