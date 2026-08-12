import sql from './index.js';

async function seedOneMillionProducts() {
  console.log('🚀 Seeding 1,000,000 products for performance testing & EXPLAIN output...');
  const startTime = Date.now();

  // Get or create store
  let [store] = await sql`SELECT id FROM stores LIMIT 1`;
  if (!store) {
    const [seller] = await sql`
      INSERT INTO profiles (email, role, full_name)
      VALUES ('mega_seller@reneo.com', 'SELLER', 'Mega Seller')
      RETURNING id;
    `;
    [store] = await sql`
      INSERT INTO stores (seller_id, name, description)
      VALUES (${seller.id}, 'Mega Store', '1M Product Store')
      RETURNING id;
    `;
  }

  const categories = ['Electronics', 'Footwear', 'Apparel', 'Home & Kitchen', 'Beauty', 'Sports', 'Books', 'Toys'];
  const batchSize = 10000;
  const totalRecords = 1000000;

  for (let i = 0; i < totalRecords; i += batchSize) {
    const rows = [];
    for (let j = 0; j < batchSize; j++) {
      const idx = i + j;
      const cat = categories[idx % categories.length];
      const price = Math.floor(Math.random() * 500000) + 1000;
      rows.push({
        store_id: store.id,
        name: `Product ${idx} ${cat} Special Edition`,
        description: `High quality product item number ${idx} in category ${cat} for Reneo platform shoppers`,
        price,
        category: cat,
        is_archived: false,
      });
    }

    await sql`
      INSERT INTO products ${sql(rows, 'store_id', 'name', 'description', 'price', 'category', 'is_archived')}
    `;

    console.log(`Inserted ${i + batchSize} / ${totalRecords} products...`);
  }

  // Populate inventory for all products
  console.log('Populating inventory for products...');
  await sql`
    INSERT INTO inventory (product_id, stock)
    SELECT id, floor(random() * 100 + 1)::int
    FROM products
    ON CONFLICT (product_id) DO NOTHING;
  `;

  console.log('Re-analyzing products table...');
  await sql`ANALYZE products;`;

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ 1,000,000 products seeded in ${duration} seconds!`);
  await sql.end();
}

seedOneMillionProducts().catch((err) => {
  console.error('❌ Failed seeding 1M products:', err);
  process.exit(1);
});
