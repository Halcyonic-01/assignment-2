import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { createTestEnvironment, TestSeeds } from './helpers/testApp.js';
import sql from '../src/db/index.js';

describe('Part A & B: Core API & Access Control Tests', () => {
  let app: any;
  let seedData: TestSeeds;
  let request: any;

  beforeAll(async () => {
    const env = await createTestEnvironment();
    app = env.app;
    seedData = env.seedData;
    request = supertest(app.server);
  }, 60000);

  afterAll(async () => {
    await app.close();
    await sql.end();
  });

  // Scenario 1: Seller A creates a product
  it('Scenario 1: Seller A creates a product (Expected: Success 201)', async () => {
    const res = await request
      .post('/products')
      .set('Authorization', `Bearer ${seedData.sellerAToken}`)
      .send({
        name: 'Wireless Ergonomic Keyboard',
        description: 'Mechanical feel solar keyboard',
        price: 45000,
        category: 'Electronics',
        stock: 15,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Wireless Ergonomic Keyboard');
    expect(res.body.stock).toBe(15);
  }, 15000);

  // Scenario 2: Seller B attempts to modify Seller A's product
  it('Scenario 2: Seller B attempts to modify Seller A product (Expected: Denied 403 or 404)', async () => {
    const res = await request
      .patch(`/products/${seedData.product1}`)
      .set('Authorization', `Bearer ${seedData.sellerBToken}`)
      .send({ price: 10 });

    expect([403, 404]).toContain(res.status);
  }, 15000);

  // Scenario 3: Customer orders an available product
  it('Scenario 3: Customer orders an available product (Expected: Success 201)', async () => {
    const res = await request
      .post('/orders')
      .set('Authorization', `Bearer ${seedData.customer1Token}`)
      .send({
        items: [{ product_id: seedData.product1, quantity: 2 }],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.total_amount).toBe(900000); // 450000 * 2
  }, 15000);

  // Scenario 4: Customer orders more than available stock
  it('Scenario 4: Customer orders more than available stock (Expected: Denied 409 Conflict)', async () => {
    const res = await request
      .post('/orders')
      .set('Authorization', `Bearer ${seedData.customer2Token}`)
      .send({
        items: [{ product_id: seedData.product1, quantity: 9999 }],
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  }, 15000);

  // Idempotency Test (B2)
  it('B2 Challenge: Duplicate order with same Idempotency-Key returns cached response', async () => {
    const idempotencyKey = 'test-idempotency-key-abc123';

    const firstReq = await request
      .post('/orders')
      .set('Authorization', `Bearer ${seedData.customer1Token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ items: [{ product_id: seedData.product1, quantity: 1 }] });

    expect(firstReq.status).toBe(201);

    const secondReq = await request
      .post('/orders')
      .set('Authorization', `Bearer ${seedData.customer1Token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ items: [{ product_id: seedData.product1, quantity: 1 }] });

    expect(secondReq.status).toBe(200);
    expect(secondReq.body.id).toBe(firstReq.body.id);
  }, 15000);
});
