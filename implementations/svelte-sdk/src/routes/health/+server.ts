import { json } from '@sveltejs/kit';
export const GET = () => json({ status: 'ok', application: 'experiences-svelte-sdk' });
