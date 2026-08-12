import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import sql from '../../db/index.js';
import { BadRequestError } from '../../lib/errors.js';
import { z } from 'zod';

const SignupSchema = z.object({
  email: z.string().email(),
  role: z.enum(['SELLER', 'CUSTOMER']),
  full_name: z.string().min(1),
  store_name: z.string().optional(),
});

export async function authRoutes(fastify: FastifyInstance) {
  const signupSwaggerSchema = {
    schema: {
      description: 'Signup or authenticate user and return JWT bearer token',
      tags: ['Authentication'],
      body: {
        type: 'object',
        required: ['email', 'role', 'full_name'],
        properties: {
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['SELLER', 'CUSTOMER'] },
          full_name: { type: 'string' },
          store_name: { type: 'string' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string' },
                full_name: { type: 'string' },
                store_id: { type: 'string' },
              },
            },
            token: { type: 'string' },
          },
        },
      },
    },
  };

  const handleSignup = async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = SignupSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid signup body. Required fields: email, role ("SELLER" or "CUSTOMER"), full_name',
          details: parseResult.error.format(),
        },
      });
    }

    const { email, role, full_name, store_name } = parseResult.data;

    return await sql.begin(async (tx) => {
      const [profile] = await tx`
        INSERT INTO profiles (email, role, full_name)
        VALUES (${email}, ${role}, ${full_name})
        ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
        RETURNING id, email, role, full_name;
      `;

      let storeId = undefined;
      if (role === 'SELLER') {
        const [store] = await tx`
          INSERT INTO stores (seller_id, name)
          VALUES (${profile.id}, ${store_name || `${full_name}'s Store`})
          ON CONFLICT (seller_id) DO UPDATE SET name = EXCLUDED.name
          RETURNING id;
        `;
        storeId = store.id;
      }

      const token = fastify.jwt.sign({
        sub: profile.id,
        email: profile.email,
        role: profile.role,
        store_id: storeId,
      });

      return reply.status(201).send({
        user: { ...profile, store_id: storeId },
        token,
      });
    });
  };

  fastify.post('/auth/signup', signupSwaggerSchema, handleSignup);
  fastify.post('/signup', signupSwaggerSchema, handleSignup);

  fastify.get('/signup', async (request, reply) => {
    return reply.status(400).send({
      message: 'Signup requires an HTTP POST request with a JSON body',
      examplePayload: {
        email: 'seller@reneo.com',
        role: 'SELLER',
        full_name: 'Kushagra Singh',
        store_name: 'Kushagra Electronics',
      },
    });
  });
}
