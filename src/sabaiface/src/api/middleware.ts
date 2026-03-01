/**
 * API Middleware
 *
 * Error handling, logging, and CORS middleware for Hono.
 */

import { Context, Next } from 'hono';
import { ZodError } from 'zod';

// =============================================================================
// Error Codes
// =============================================================================

/**
 * AWS Rekognition-compatible error codes
 */
export const ErrorCodes = {
  INVALID_PARAMETER: 'InvalidParameterException',
  RESOURCE_NOT_FOUND: 'ResourceNotFoundException',
  RESOURCE_ALREADY_EXISTS: 'ResourceAlreadyExistsException',
  INVALID_IMAGE: 'InvalidImageFormatException',
  IMAGE_TOO_LARGE: 'ImageTooLargeException',
  THROTTLING: 'ThrottlingException',
  INTERNAL_ERROR: 'InternalServerError',
  LIMIT_EXCEEDED: 'LimitExceededException',
} as const;

// =============================================================================
// Error Handler
// =============================================================================

/**
 * Global error handler middleware.
 * Converts errors to AWS Rekognition-compatible format.
 */
export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    console.error('API Error:', error);

    // Zod validation errors
    if (error instanceof ZodError) {
      return c.json(
        {
          __type: ErrorCodes.INVALID_PARAMETER,
          message: `Invalid request: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
        },
        400,
      );
    }

    // Domain errors (if any)
    if (error instanceof Error) {
      // Check error name for specific handling
      if (error.name === 'ResourceNotFoundException') {
        return c.json(
          {
            __type: ErrorCodes.RESOURCE_NOT_FOUND,
            message: error.message,
          },
          404,
        );
      }

      if (error.name === 'ResourceAlreadyExistsException') {
        return c.json(
          {
            __type: ErrorCodes.RESOURCE_ALREADY_EXISTS,
            message: error.message,
          },
          400,
        );
      }

      if (error.name === 'InvalidImageFormatException') {
        return c.json(
          {
            __type: ErrorCodes.INVALID_IMAGE,
            message: error.message,
          },
          400,
        );
      }

      if (error.name === 'ImageTooLargeException') {
        return c.json(
          {
            __type: ErrorCodes.IMAGE_TOO_LARGE,
            message: error.message,
          },
          400,
        );
      }

      // Generic error
      return c.json(
        {
          __type: ErrorCodes.INTERNAL_ERROR,
          message: error.message || 'Internal server error',
        },
        500,
      );
    }

    // Unknown error
    return c.json(
      {
        __type: ErrorCodes.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
      },
      500,
    );
  }
}

// =============================================================================
// Request Logger
// =============================================================================

/**
 * Request logging middleware.
 * Logs all incoming requests and their response times.
 */
export async function requestLogger(c: Context, next: Next) {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  console.log(`→ ${method} ${path}`);

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  console.log(`← ${method} ${path} ${status} (${duration}ms)`);
}

// =============================================================================
// CORS
// =============================================================================

/**
 * CORS middleware (for development).
 * In production, configure CORS at the load balancer/CDN level.
 */
export async function cors(c: Context, next: Next) {
  // Handle OPTIONS preflight
  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.header('Access-Control-Max-Age', '86400');
    return c.body(null, 204);
  }

  await next();

  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
