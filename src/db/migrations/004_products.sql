-- Products table with Full Text Search tsvector column (Store -> Products)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL CHECK (price > 0), -- Stored as integer currency (FCFA) to maintain server-side price integrity
  category TEXT NOT NULL,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'C')
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes optimized for 1,000,000+ products search and filtering
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category) WHERE is_archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price) WHERE is_archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC) WHERE is_archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_products_search_vector ON products USING GIN(search_vector);
-- Composite index for category + price filtering & sorting
CREATE INDEX IF NOT EXISTS idx_products_cat_price ON products(category, price) WHERE is_archived = FALSE;
