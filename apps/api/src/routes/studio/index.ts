import { Hono } from 'hono';
import type { Env } from '../../types';
import { studioLutsRouter } from './luts';

export const studioRouter = new Hono<Env>().route('/luts', studioLutsRouter);
