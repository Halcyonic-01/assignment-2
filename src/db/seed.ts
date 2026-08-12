import sql from './index.js';

export async function seedDatabase() {
  console.log('🌱 Seeding database with initial data...');

  // Clean existing tables
  await sql`TRUNCATE TABLE outbox, order_items, orders, inventory, products, stores, profiles CASCADE;`;

  // Create Seller A & Store A
  const [sellerA] = await sql`
    INSERT INTO profiles (email, role, full_name)
    VALUES ('sellerA@reneo.com', 'SELLER', 'Seller Alpha')
    RETURNING id;
  `;

  const [storeA] = await sql`
    INSERT INTO stores (seller_id, name, description)
    VALUES (${sellerA.id}, 'Alpha Electronics', 'Premier tech gear seller')
    RETURNING id;
  `;

  // Create Seller B & Store B
  const [sellerB] = await sql`
    INSERT INTO profiles (email, role, full_name)
    VALUES ('sellerB@reneo.com', 'SELLER', 'Seller Beta')
    RETURNING id;
  `;

  const [storeB] = await sql`
    INSERT INTO stores (seller_id, name, description)
    VALUES (${sellerB.id}, 'Beta Fashion', 'Trendy apparel and shoes')
    RETURNING id;
  `;

  // Create Customer 1 & Customer 2
  const [customer1] = await sql`
    INSERT INTO profiles (email, role, full_name)
    VALUES ('customer1@reneo.com', 'CUSTOMER', 'Customer One')
    RETURNING id;
  `;

  const [customer2] = await sql`
    INSERT INTO profiles (email, role, full_name)
    VALUES ('customer2@reneo.com', 'CUSTOMER', 'Customer Two')
    RETURNING id;
  `;

  // Create Products for Seller A
  const [product1] = await sql`
    INSERT INTO products (store_id, name, description, price, category)
    VALUES (${storeA.id}, 'Solar Powered Laptop', 'High efficiency solar laptop for remote work', 450000, 'Electronics')
    RETURNING id;
  `;

  await sql`
    INSERT INTO inventory (product_id, stock)
    VALUES (${product1.id}, 10);
  `;

  // Create Product with Stock = 1 for Concurrency Race Testing (B1 / Test 5)
  const [lastItemProduct] = await sql`
    INSERT INTO products (store_id, name, description, price, category)
    VALUES (${storeA.id}, 'Limited Edition Smart Watch', 'Ultra rare single stock watch', 120000, 'Electronics')
    RETURNING id;
  `;

  await sql`
    INSERT INTO inventory (product_id, stock)
    VALUES (${lastItemProduct.id}, 1);
  `;

  // Create Products for Seller B
  const [productB1] = await sql`
    INSERT INTO products (store_id, name, description, price, category)
    VALUES (${storeB.id}, 'Leather Boots', 'Durable handcrafted leather boots', 35000, 'Footwear')
    RETURNING id;
  `;

  await sql`
    INSERT INTO inventory (product_id, stock)
    VALUES (${productB1.id}, 25);
  `;

  console.log('✅ Database seeded successfully!');
  return {
    sellerA: sellerA.id,
    storeA: storeA.id,
    sellerB: sellerB.id,
    storeB: storeB.id,
    customer1: customer1.id,
    customer2: customer2.id,
    product1: product1.id,
    lastItemProduct: lastItemProduct.id,
    productB1: productB1.id,
  };
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Seeding failed:', err);
      process.exit(1);
    });
}
