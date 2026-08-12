import { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth.js';
import { BadRequestError } from '../../lib/errors.js';
import { CreateOrderSchema } from './order.schema.js';
import { OrderService } from './order.service.js';

export async function orderRoutes(fastify: FastifyInstance) {
  // POST /orders
  fastify.post('/orders', {
    preHandler: [requireRole('CUSTOMER')],
    schema: {
      description: 'Place a new order (Customer only, supports Idempotency-Key header)',
      tags: ['Orders'],
      security: [{ bearerAuth: [] }],
      headers: {
        type: 'object',
        properties: {
          'idempotency-key': { type: 'string', description: 'Optional unique UUID key to prevent duplicate orders' },
        },
      },
      body: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['product_id', 'quantity'],
              properties: {
                product_id: { type: 'string', format: 'uuid' },
                quantity: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const bodyObj = request.body as Record<string, unknown>;
    if (bodyObj && ('price' in bodyObj || 'total_amount' in bodyObj || 'total' in bodyObj)) {
      return reply.status(400).send({
        error: {
          code: 'BAD_REQUEST',
          message: 'Client cannot supply price or total_amount. Server owns price calculations.',
        },
      });
    }

    const parseResult = CreateOrderSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Invalid order request payload', details: parseResult.error.format() },
      });
    }

    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
    const customer = request.user!;

    const { cached, order } = await OrderService.createOrder(customer.id, parseResult.data, idempotencyKey);
    return reply.status(cached ? 200 : 201).send(order);
  });

  // GET /orders
  fastify.get('/orders', {
    schema: {
      description: 'Get orders for authenticated customer or seller',
      tags: ['Orders'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    }
    const user = request.user;
    const orders = await OrderService.getOrders(user.id, user.role);
    return reply.status(200).send(orders);
  });

  // GET /orders/:id
  fastify.get('/orders/:id', {
    schema: {
      description: 'Get order details by order ID',
      tags: ['Orders'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    }
    const { id } = request.params as { id: string };
    const order = await OrderService.getOrderById(request.user.id, id);
    return reply.status(200).send(order);
  });
}
