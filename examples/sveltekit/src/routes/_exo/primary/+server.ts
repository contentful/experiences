import { request } from '$lib/server/experiences.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = request.handlePreparation;
