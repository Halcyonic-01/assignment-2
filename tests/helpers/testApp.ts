import { buildApp } from '../../src/app.js';
import sql from '../../src/db/index.js';

export interface TestSeeds {
  sellerAToken: string;
  sellerBToken: string;
  customer1Token: string;
  customer2Token: string;
  product1: string;
  lastItemProduct: string;
}

export async function createTestEnvironment(): Promise<{ app: any; seedData: TestSeeds }> {
  const app = buildApp();
  await app.ready();

  // Clean all tables fresh for each test run
  await sql`TRUNCATE TABLE outbox, order_items, orders, inventory, products, stores, profiles CASCADE;`;

  // Use the signup endpoint to create real users and get real JWT tokens
  const signup = (body: object) =>
    app.inject({ method: 'POST', url: '/auth/signup', payload: body });

  const resSellerA = await signup({ email: 'sellerA@reneo-test.com', role: 'SELLER', full_name: 'Seller Alpha', store_name: 'Alpha Electronics' });
  const sellerAData = JSON.parse(resSellerA.body);

  const resSellerB = await signup({ email: 'sellerB@reneo-test.com', role: 'SELLER', full_name: 'Seller Beta', store_name: 'Beta Fashion' });
  const sellerBData = JSON.parse(resSellerB.body);

  const resCust1 = await signup({ email: 'customer1@reneo-test.com', role: 'CUSTOMER', full_name: 'Customer One' });
  const cust1Data = JSON.parse(resCust1.body);

  const resCust2 = await signup({ email: 'customer2@reneo-test.com', role: 'CUSTOMER', full_name: 'Customer Two' });
  const cust2Data = JSON.parse(resCust2.body);

  // Create products using Seller A's real JWT token
  const resProduct1 = await app.inject({
    method: 'POST',
    url: '/products',
    headers: { Authorization: `Bearer ${sellerAData.token}` },
    payload: { name: 'Solar Powered Laptop', description: 'High efficiency solar laptop', price: 450000, category: 'Electronics', stock: 10 },
  });
  const product1Data = JSON.parse(resProduct1.body);

  const resLastItem = await app.inject({
    method: 'POST',
    url: '/products',
    headers: { Authorization: `Bearer ${sellerAData.token}` },
    payload: { name: 'Limited Edition Smart Watch', description: 'Ultra rare single stock watch', price: 120000, category: 'Electronics', stock: 1 },
  });
  const lastItemData = JSON.parse(resLastItem.body);

  return {
    app,
    seedData: {
      sellerAToken: sellerAData.token,
      sellerBToken: sellerBData.token,
      customer1Token: cust1Data.token,
      customer2Token: cust2Data.token,
      product1: product1Data.id,
      lastItemProduct: lastItemData.id,
    },
  };
}
