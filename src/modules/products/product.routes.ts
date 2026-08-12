import { FastifyInstance } from 'fastify';
import { authenticateUser, requireRole } from '../../middleware/auth.js';
import { BadRequestError } from '../../lib/errors.js';
import { CreateProductSchema, SearchProductsQuerySchema, UpdateProductSchema } from './product.schema.js';
import { ProductService } from './product.service.js';

export async function productRoutes(fastify: FastifyInstance) {
  // GET /products
  fastify.get('/products', {
    schema: {
      description: 'Search & filter products with pagination',
      tags: ['Products'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
          q: { type: 'string', description: 'Full-text search query' },
          category: { type: 'string' },
          min_price: { type: 'integer' },
          max_price: { type: 'integer' },
          available: { type: 'string', enum: ['true', 'false'] },
          sort: { type: 'string', enum: ['price_asc', 'price_desc', 'created_at'], default: 'created_at' },
        },
      },
    },
  }, async (request, reply) => {
    const parseResult = SearchProductsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid query parameters');
    }

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

  // GET /products/explain
  fastify.get('/products/explain', {
    schema: {
      description: 'Get PostgreSQL EXPLAIN ANALYZE execution plan for product search',
      tags: ['Products'],
    },
  }, async (request, reply) => {
    const parseResult = SearchProductsQuerySchema.safeParse(request.query);
    const query = parseResult.success ? parseResult.data : { page: 1, limit: 20, sort: 'price_asc' as const };
    const explainOutput = await ProductService.explainSearchQuery(query);
    return reply.status(200).send({ explain: explainOutput });
  });

  // GET /products/:id
  fastify.get('/products/:id', {
    schema: {
      description: 'Get product by ID',
      tags: ['Products'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = await ProductService.getProductById(id);
    return reply.status(200).send(product);
  });

  // POST /products
  fastify.post('/products', {
    preHandler: [requireRole('SELLER')],
    schema: {
      description: 'Create a new product (Seller only)',
      tags: ['Products'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'price', 'category'],
        properties: {
          name: { type: 'string', example: 'Solar Laptop Charger' },
          description: { type: 'string', example: 'Fast portable solar charger' },
          price: { type: 'integer', example: 45000 },
          category: { type: 'string', example: 'Electronics' },
          stock: { type: 'integer', example: 10 },
        },
      },
    },
  }, async (request, reply) => {
    const parseResult = CreateProductSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Invalid product input', details: parseResult.error.format() },
      });
    }

    const seller = request.user!;
    if (!seller.store_id) {
      throw new BadRequestError('Seller does not have an assigned store');
    }

    const product = await ProductService.createProduct(seller.id, seller.store_id, parseResult.data);
    return reply.status(201).send(product);
  });

  // PATCH /products/:id
  fastify.patch('/products/:id', {
    preHandler: [requireRole('SELLER')],
    schema: {
      description: 'Update product details or stock (Seller owner only)',
      tags: ['Products'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'integer' },
          category: { type: 'string' },
          stock: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = UpdateProductSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Invalid product update fields', details: parseResult.error.format() },
      });
    }

    const seller = request.user!;
    const updated = await ProductService.updateProduct(seller.id, id, parseResult.data);
    return reply.status(200).send(updated);
  });

  // DELETE /products/:id
  fastify.delete('/products/:id', {
    preHandler: [requireRole('SELLER')],
    schema: {
      description: 'Archive/Delete product (Seller owner only)',
      tags: ['Products'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const seller = request.user!;
    const result = await ProductService.deleteProduct(seller.id, id);
    return reply.status(200).send(result);
  });
}
