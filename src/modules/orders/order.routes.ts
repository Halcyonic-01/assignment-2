import { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth.js';
import { BadRequestError } from '../../lib/errors.js';
import { CreateOrderSchema } from './order.schema.js';
import { OrderService } from './order.service.js';

export async function orderRoutes(fastify: FastifyInstance) {
  // POST /orders (Customer places order)
  fastify.post('/orders', { preHandler: [requireRole('CUSTOMER')] }, async (request, reply) => {
    // Explicit anti-tampering check: reject if client attempts to pass price/total in request body
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

  // GET /orders (List orders for authenticated customer or seller)
  fastify.get('/orders', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    }
    const user = request.user;
    const orders = await OrderService.getOrders(user.id, user.role);
    return reply.status(200).send(orders);
  });

  // GET /orders/:id (Get order by ID)
  fastify.get('/orders/:id', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    }
    const { id } = request.params as { id: string };
    const order = await OrderService.getOrderById(request.user.id, id);
    return reply.status(200).send(order);
  });
}
