import fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import dotenv from 'dotenv';

import { errorHandler } from './middleware/errorHandler.js';
import { productRoutes } from './modules/products/product.routes.js';
import { orderRoutes } from './modules/orders/order.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';

dotenv.config();

export function buildApp() {
  const app = fastify({
    logger: process.env.NODE_ENV === 'development',
  });

  // Plugins
  app.register(cors, { origin: '*' });
  app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'reneo-super-secret-jwt-key-at-least-32-chars-long',
  });

  // OpenAPI Documentation (Deliverable #5)
  app.register(swagger, {
    openapi: {
      info: {
        title: 'Reneo Commerce Platform API',
        description: 'Multi-tenant E-Commerce Backend API for Reneo',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: false },
  });

  // Error Handler (A7)
  app.setErrorHandler(errorHandler);

  // Register Modules
  app.register(authRoutes);
  app.register(productRoutes);
  app.register(orderRoutes);

  // Root endpoint
  app.get('/', async () => ({
    name: 'Reneo Commerce Platform API',
    version: '1.0.0',
    status: 'online',
    documentation: '/docs',
    healthCheck: '/health',
  }));

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  return app;
}
