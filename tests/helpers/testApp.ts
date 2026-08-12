import { buildApp } from '../../src/app.js';
import { seedDatabase } from '../../src/db/seed.js';

export async function createTestEnvironment() {
  const app = buildApp();
  await app.ready();

  const seedData = await seedDatabase();

  return {
    app,
    seedData,
  };
}
