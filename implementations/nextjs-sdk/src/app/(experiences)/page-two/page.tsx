import type { Metadata } from 'next';
import { ServerContentPage } from '../../../components/ServerContentPage';

export const metadata: Metadata = { title: 'Page Two' };
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export default function PageTwo() {
  return <ServerContentPage title="Page Two" />;
}
