import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { emitStructuredLog } from '../lib/observability/log';
import { emitCounterMetric } from '../lib/observability/metrics';
import type { Env } from '../types';

const clientErrorSchema = z.object({
  platform: z.enum(['web', 'ios']),
  sourceService: z.enum(['framefast-dashboard', 'framefast-event', 'framefast-ios']).optional(),
  errorType: z.string().trim().min(1).max(64),
  message: z.string().trim().min(1).max(2000),
  stack: z.string().max(16000).optional(),
  handled: z.boolean().optional(),
  severity: z.enum(['error', 'fatal']).default('error'),
  url: z.string().url().max(2048).optional(),
  route: z.string().max(512).optional(),
  release: z.string().max(128).optional(),
  userAgent: z.string().max(512).optional(),
  traceparent: z.string().max(128).optional(),
  baggage: z.string().max(2048).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

function normalizeErrorType(raw: string): string {
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return value.length > 0 ? value.slice(0, 64) : 'unknown';
}

function sourceServiceFromPlatform(platform: 'web' | 'ios'): string {
  return platform === 'ios' ? 'framefast-ios' : 'framefast-dashboard';
}

export const observabilityRouter = new Hono<Env>().post(
  '/client-errors',
  zValidator('json', clientErrorSchema),
  async (c) => {
    const body = c.req.valid('json');
    const ctx = c.executionCtx as unknown as ExecutionContext;
    const errorType = normalizeErrorType(body.errorType);

    let requestId: string | null = null;
    try {
      requestId = c.get('requestId');
    } catch {
      requestId = null;
    }

    const sourceService = body.sourceService ?? sourceServiceFromPlatform(body.platform);

    emitStructuredLog(c, 'error', 'client_error_captured', {
      source_service: sourceService,
      request_id: requestId,
      platform: body.platform,
      error_type: errorType,
      message: body.message,
      stack: body.stack,
      handled: body.handled ?? false,
      severity: body.severity,
      url: body.url,
      route: body.route,
      release: body.release,
      user_agent: body.userAgent ?? c.req.header('user-agent') ?? null,
      traceparent: body.traceparent,
      baggage: body.baggage,
      metadata: body.metadata,
    });

    emitCounterMetric(c.env, ctx, 'framefast_client_errors_total', 1, {
      source_service: sourceService,
      platform: body.platform,
      error_type: errorType,
      severity: body.severity,
      handled: body.handled ?? false,
    });

    return c.body(null, 202);
  },
);

export type ObservabilityRouterType = typeof observabilityRouter;
