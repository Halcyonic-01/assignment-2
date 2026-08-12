-- Enable Row Level Security (RLS) on all tables

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Helper function to extract current authenticated user ID from Supabase JWT or custom session
CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_user_id', true), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- PROFILES POLICIES
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (true); -- Public/authenticated read profile info

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (id = current_user_id());

-- STORES POLICIES
DROP POLICY IF EXISTS "stores_select_public" ON stores;
CREATE POLICY "stores_select_public" ON stores FOR SELECT
  USING (true); -- Public read stores

DROP POLICY IF EXISTS "stores_manage_seller" ON stores;
CREATE POLICY "stores_manage_seller" ON stores FOR ALL
  USING (seller_id = current_user_id());

-- PRODUCTS POLICIES
DROP POLICY IF EXISTS "products_select_public" ON products;
CREATE POLICY "products_select_public" ON products FOR SELECT
  USING (is_archived = FALSE OR store_id IN (SELECT id FROM stores WHERE seller_id = current_user_id()));

DROP POLICY IF EXISTS "products_seller_insert" ON products;
CREATE POLICY "products_seller_insert" ON products FOR INSERT
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE seller_id = current_user_id()));

DROP POLICY IF EXISTS "products_seller_update" ON products;
CREATE POLICY "products_seller_update" ON products FOR UPDATE
  USING (store_id IN (SELECT id FROM stores WHERE seller_id = current_user_id()));

DROP POLICY IF EXISTS "products_seller_delete" ON products;
CREATE POLICY "products_seller_delete" ON products FOR DELETE
  USING (store_id IN (SELECT id FROM stores WHERE seller_id = current_user_id()));

-- INVENTORY POLICIES
DROP POLICY IF EXISTS "inventory_select_public" ON inventory;
CREATE POLICY "inventory_select_public" ON inventory FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "inventory_seller_manage" ON inventory;
CREATE POLICY "inventory_seller_manage" ON inventory FOR ALL
  USING (product_id IN (
    SELECT p.id FROM products p
    JOIN stores s ON s.id = p.store_id
    WHERE s.seller_id = current_user_id()
  ));

-- ORDERS POLICIES
DROP POLICY IF EXISTS "orders_customer_select" ON orders;
CREATE POLICY "orders_customer_select" ON orders FOR SELECT
  USING (
    customer_id = current_user_id() OR
    id IN (
      SELECT oi.order_id FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      JOIN stores s ON s.id = p.store_id
      WHERE s.seller_id = current_user_id()
    )
  );

DROP POLICY IF EXISTS "orders_customer_insert" ON orders;
CREATE POLICY "orders_customer_insert" ON orders FOR INSERT
  WITH CHECK (customer_id = current_user_id());

-- ORDER ITEMS POLICIES
DROP POLICY IF EXISTS "order_items_select" ON order_items;
CREATE POLICY "order_items_select" ON order_items FOR SELECT
  USING (
    order_id IN (SELECT id FROM orders WHERE customer_id = current_user_id()) OR
    product_id IN (
      SELECT p.id FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE s.seller_id = current_user_id()
    )
  );
