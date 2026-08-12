export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function formatErrorResponse(code: string, message: string, details?: unknown): ErrorResponseBody {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}
