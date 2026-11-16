import { ServerContentPage } from '../../components/ServerContentPage';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export default function Home() {
  return <ServerContentPage title="Next SDK" />;
}
