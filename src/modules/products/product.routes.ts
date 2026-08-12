import { FastifyInstance } from 'fastify';
import { authenticateUser, requireRole } from '../../middleware/auth.js';
import { BadRequestError } from '../../lib/errors.js';
import { CreateProductSchema, SearchProductsQuerySchema, UpdateProductSchema } from './product.schema.js';
import { ProductService } from './product.service.js';

export async function productRoutes(fastify: FastifyInstance) {
  // GET /products (Public/Seller search and pagination)
  fastify.get('/products', async (request, reply) => {
    const parseResult = SearchProductsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid query parameters');
    }

    // Check if seller wants only their own products
    const authHeader = request.headers.authorization;
    let sellerId: string | undefined = undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        await authenticateUser(request, reply);
        if (request.user?.role === 'SELLER') {
          sellerId = request.user.id;
        }
      } catch {
        // Unauthenticated search is fine
      }
    }

    const result = await ProductService.searchProducts(parseResult.data, sellerId);
    return reply.status(200).send(result);
  });

  // GET /products/explain (Get EXPLAIN output for README)
  fastify.get('/products/explain', async (request, reply) => {
    const parseResult = SearchProductsQuerySchema.safeParse(request.query);
    const query = parseResult.success ? parseResult.data : { page: 1, limit: 20, sort: 'price_asc' as const };
    const explainOutput = await ProductService.explainSearchQuery(query);
    return reply.status(200).send({ explain: explainOutput });
  });

  // GET /products/:id (Get single product)
  fastify.get('/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = await ProductService.getProductById(id);
    return reply.status(200).send(product);
  });

  // POST /products (Seller creates product)
  fastify.post('/products', { preHandler: [requireRole('SELLER')] }, async (request, reply) => {
    const parseResult = CreateProductSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Invalid product input', details: parseResult.error.format() }
      });
    }

    const seller = request.user!;
    if (!seller.store_id) {
      throw new BadRequestError('Seller does not have an assigned store');
    }

    const product = await ProductService.createProduct(seller.id, seller.store_id, parseResult.data);
    return reply.status(201).send(product);
  });

  // PATCH /products/:id (Seller updates product)
  fastify.patch('/products/:id', { preHandler: [requireRole('SELLER')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = UpdateProductSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Invalid product update fields', details: parseResult.error.format() }
      });
    }

    const seller = request.user!;
    const updated = await ProductService.updateProduct(seller.id, id, parseResult.data);
    return reply.status(200).send(updated);
  });

  // DELETE /products/:id (Seller deletes/archives product)
  fastify.delete('/products/:id', { preHandler: [requireRole('SELLER')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const seller = request.user!;
    const result = await ProductService.deleteProduct(seller.id, id);
    return reply.status(200).send(result);
  });
}
