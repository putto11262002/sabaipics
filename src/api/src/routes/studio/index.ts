import { Hono } from 'hono';
import type { Env } from '../../types';
import { studioLutsRouter } from './luts';
import { studioAutoEditRouter } from './auto-edit';

export const studioRouter = new Hono<Env>()
  .route('/luts', studioLutsRouter)
  .route('/auto-edit', studioAutoEditRouter);
