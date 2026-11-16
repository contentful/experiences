import { ServerContentPage, type PageSearchParams } from '../../components/ServerContentPage';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export default async function Home({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  return <ServerContentPage pathname="/" title="Next SDK" searchParams={await searchParams} />;
}
