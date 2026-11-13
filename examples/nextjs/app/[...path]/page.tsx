import { renderDestinationPage } from '@/lib/destination-page';

// Personalized request results are private and evaluated on demand. A public
// sitemap can still be enumerated separately with fetchDestinationSitemap.
export const dynamic = 'force-dynamic';

export default function DestinationPage() {
  return renderDestinationPage();
}
