import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors.js';
import { formatErrorResponse } from '../lib/response.js';

export function errorHandler(error: FastifyError | AppError | Error, _request: FastifyRequest, reply: FastifyReply) {
  // Handle our custom AppError hierarchy
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send(formatErrorResponse(error.code, error.message));
  }

  // Handle Fastify validation errors (400 Bad Request from schema mismatch)
  if ('validation' in error && error.validation) {
    return reply.status(400).send(formatErrorResponse('BAD_REQUEST', 'Validation failed', error.validation));
  }

  // Handle native Fastify HTTP errors (404 Route Not Found, 400 malformed JSON, etc.)
  // These have a statusCode property set by Fastify itself
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    const statusCode = error.statusCode;
    if (statusCode === 404) {
      return reply.status(404).send(formatErrorResponse('NOT_FOUND', error.message || 'Route not found'));
    }
    if (statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send(formatErrorResponse('BAD_REQUEST', error.message || 'Bad request'));
    }
  }

  // Handle Postgres error codes (check constraint violation, duplicate key)
  if ('code' in error) {
    const pgError = error as { code: string; message: string };
    if (pgError.code === '23514') {
      return reply.status(409).send(formatErrorResponse('CONFLICT', 'Check constraint violation (e.g. negative stock)'));
    }
    if (pgError.code === '23505') {
      return reply.status(409).send(formatErrorResponse('CONFLICT', 'Duplicate resource conflict'));
    }
  }

  console.error('Unhandled server error:', error);
  return reply.status(500).send(formatErrorResponse('INTERNAL_SERVER_ERROR', 'An unexpected error occurred'));
}
