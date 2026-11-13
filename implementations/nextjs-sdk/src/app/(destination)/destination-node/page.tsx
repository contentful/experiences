import { DestinationAppRoute } from '../../../components/DestinationAppRoute';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Selects the configured DESTINATION_NODE_ID instead of a path.
export default async function DestinationNode({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { mode } = await searchParams;
  return <DestinationAppRoute serverOnly={mode === 'server-only'} />;
}
