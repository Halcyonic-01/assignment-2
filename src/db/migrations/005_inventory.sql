-- Inventory table: 1-to-1 relationship with Products (Products -> Inventory)
CREATE TABLE IF NOT EXISTS inventory (
  product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0), -- Check constraint prevents negative stock at DB level
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for stock availability filter (stock > 0)
CREATE INDEX IF NOT EXISTS idx_inventory_stock ON inventory(stock) WHERE stock > 0;
