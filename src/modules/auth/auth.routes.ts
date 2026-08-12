import { FastifyInstance } from 'fastify';
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
  // POST /auth/signup (Development / Test authentication helper)
  fastify.post('/auth/signup', async (request, reply) => {
    const parseResult = SignupSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid signup parameters');
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
  });
}
