import { loadComparisons } from '#lib/server/load-comparisons.js';
export const load = ({ url }: { url: URL }) => loadComparisons(url);
