import { FastifyReply, FastifyRequest } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import sql from '../db/index.js';

export interface AuthUser {
  id: string;
  email: string;
  role: 'SELLER' | 'CUSTOMER';
  store_id?: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email?: string; role?: string; store_id?: string };
    user: AuthUser;
  }
}

export async function authenticateUser(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header');
  }

  try {
    // Always verify JWT — never accept raw UUIDs or emails as tokens
    const decoded = await request.jwtVerify<{ sub: string; email?: string; role?: string; store_id?: string }>();
    const userId = decoded.sub;

    const [profile] = await sql`
      SELECT p.id, p.email, p.role, s.id as store_id
      FROM profiles p
      LEFT JOIN stores s ON s.seller_id = p.id
      WHERE p.id = ${userId}
    `;

    if (!profile) {
      throw new UnauthorizedError('Authenticated user profile not found');
    }

    const authUser: AuthUser = {
      id: profile.id,
      email: profile.email,
      role: profile.role as 'SELLER' | 'CUSTOMER',
      store_id: profile.store_id || undefined,
    };

    request.user = authUser;

    // Set Postgres session variable for RLS enforcement
    await sql`SELECT set_config('app.current_user_id', ${profile.id}, true)`;

  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired authentication token');
  }
}

export function requireRole(allowedRole: 'SELLER' | 'CUSTOMER') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticateUser(request, reply);

    if (!request.user || request.user.role !== allowedRole) {
      throw new ForbiddenError(`Access denied: required role ${allowedRole}`);
    }
  };
}
