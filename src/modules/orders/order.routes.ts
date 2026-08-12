import { FastifyInstance } from 'fastify';
import { authenticateUser, requireRole } from '../../middleware/auth.js';
import { BadRequestError } from '../../lib/errors.js';
import { CreateOrderSchema } from './order.schema.js';
import { OrderService } from './order.service.js';

export async function orderRoutes(fastify: FastifyInstance) {
  // POST /orders (Customer places order)
  fastify.post('/orders', {
    preHandler: [requireRole('CUSTOMER')],
    schema: {
      description: 'Place a new order (Customer only). Supports Idempotency-Key header to prevent duplicates.',
      tags: ['Orders'],
      security: [{ bearerAuth: [] }],
      headers: {
        type: 'object',
        properties: {
          'idempotency-key': { type: 'string', description: 'Optional UUID key to prevent duplicate orders on retry' },
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
        error: { code: 'BAD_REQUEST', message: 'Invalid order payload', details: parseResult.error.format() },
      });
    }

    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
    const customer = request.user!;

    const { cached, order } = await OrderService.createOrder(customer.id, parseResult.data, idempotencyKey);
    return reply.status(cached ? 200 : 201).send(order);
  });

  // Fix 6: GET /orders — add authenticateUser preHandler (was always returning 401 before)
  fastify.get('/orders', {
    preHandler: [authenticateUser],
    schema: {
      description: 'List orders for authenticated customer (their orders) or seller (orders with their products)',
      tags: ['Orders'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const user = request.user!;
    const orders = await OrderService.getOrders(user.id, user.role);
    return reply.status(200).send(orders);
  });

  // Fix 6: GET /orders/:id — add authenticateUser preHandler + IDOR protection
  fastify.get('/orders/:id', {
    preHandler: [authenticateUser],
    schema: {
      description: 'Get order details by ID (must be owner or seller of ordered items)',
      tags: ['Orders'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const order = await OrderService.getOrderById(request.user!.id, id);
    return reply.status(200).send(order);
  });
}
