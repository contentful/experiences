import type { Metadata } from 'next';
import { ServerContentPage, type PageSearchParams } from '../../../components/ServerContentPage';

export const metadata: Metadata = { title: 'Page Two' };
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export default async function PageTwo({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  return (
    <ServerContentPage pathname="/page-two" title="Page Two" searchParams={await searchParams} />
  );
}
