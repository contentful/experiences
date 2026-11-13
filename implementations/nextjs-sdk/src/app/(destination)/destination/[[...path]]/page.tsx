import { DestinationAppRoute } from '../../../../components/DestinationAppRoute';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// The route remainder is the Destination path: /destination is `/`.
export default async function DestinationPath({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { mode } = await searchParams;
  return <DestinationAppRoute serverOnly={mode === 'server-only'} />;
}
