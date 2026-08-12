import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { createTestEnvironment } from './helpers/testApp.js';
import sql from '../src/db/index.js';

describe('Scenario 5: Concurrent Stock Control Test (B1 - 20 Points)', () => {
  let app: any;
  let seedData: any;
  let request: any;

  beforeAll(async () => {
    const env = await createTestEnvironment();
    app = env.app;
    seedData = env.seedData;
    request = supertest(app.server);
  }, 30000);

  afterAll(async () => {
    await app.close();
    await sql.end();
  });

  it('Scenario 5: Two simultaneous orders for the last item -> Exactly ONE succeeds (201), ONE fails (409)', async () => {
    const productId = seedData.lastItemProduct; // Stock = 1

    // Verify stock is exactly 1 before race
    const [invBefore] = await sql`SELECT stock FROM inventory WHERE product_id = ${productId}`;
    expect(invBefore.stock).toBe(1);

    // Fire TWO HTTP POST requests simultaneously at the exact same instant
    const request1 = request
      .post('/orders')
      .set('Authorization', `Bearer ${seedData.customer1}`)
      .send({
        items: [{ product_id: productId, quantity: 1 }],
      });

    const request2 = request
      .post('/orders')
      .set('Authorization', `Bearer ${seedData.customer2}`)
      .send({
        items: [{ product_id: productId, quantity: 1 }],
      });

    const [res1, res2] = await Promise.all([request1, request2]);

    const statuses = [res1.status, res2.status].sort();

    console.log(`🏁 Concurrency Race Test Results: Customer 1 status=${res1.status}, Customer 2 status=${res2.status}`);

    // EXACTLY ONE SUCCESS (201), EXACTLY ONE CONFLICT (409)
    expect(statuses).toEqual([201, 409]);

    // Verify remaining stock is exactly 0 and NOT negative (-1)
    const [invAfter] = await sql`SELECT stock FROM inventory WHERE product_id = ${productId}`;
    expect(invAfter.stock).toBe(0);
  }, 20000);
});
