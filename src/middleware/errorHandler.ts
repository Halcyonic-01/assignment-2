import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors.js';
import { formatErrorResponse } from '../lib/response.js';

export function errorHandler(error: FastifyError | AppError | Error, _request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send(formatErrorResponse(error.code, error.message));
  }

  // Handle Fastify validation errors
  if ('validation' in error && error.validation) {
    return reply.status(400).send(formatErrorResponse('BAD_REQUEST', 'Validation failed', error.validation));
  }

  // Handle Postgres error codes (e.g. check constraint violation, duplicate key)
  if ('code' in error) {
    const pgError = error as { code: string; message: string };
    if (pgError.code === '23514') {
      // Check constraint violation (e.g. negative stock)
      return reply.status(409).send(formatErrorResponse('CONFLICT', 'Out of stock or invalid constraint condition'));
    }
    if (pgError.code === '23505') {
      // Unique constraint violation
      return reply.status(409).send(formatErrorResponse('CONFLICT', 'Duplicate resource conflict'));
    }
  }

  console.error('Unhandled server error:', error);
  return reply.status(500).send(formatErrorResponse('INTERNAL_SERVER_ERROR', 'An unexpected error occurred'));
}
