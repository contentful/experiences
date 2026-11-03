import type { AppProps } from 'next/app';
import type { PagesReferenceProps } from '../pages-server';
import type { SingleExperienceProps } from './pages/single-experience';
import { NextjsPagesRouterRequestRoot } from '@contentful/experiences-nextjs/pages-router';
import { PagesBrowserRoot } from '../components/BrowserRoot';
import '../theme.css';

export default function App({
  Component,
  pageProps,
}: AppProps<PagesReferenceProps | SingleExperienceProps>) {
  if (!pageProps.environment) return <Component {...pageProps} />;
  if ('singleExperience' in pageProps) {
    const { spaceId, environmentId, locale, delivery } = pageProps.environment.web;
    return (
      <NextjsPagesRouterRequestRoot
        spaceId={spaceId}
        environmentId={environmentId}
        locale={locale}
        browser={{ delivery, isPreview: false }}
        result={pageProps.experiences}
      >
        <Component {...pageProps} />
      </NextjsPagesRouterRequestRoot>
    );
  }
  if (pageProps.serverOnly && !pageProps.analytics)
    return (
      <div className="app-shell">
        <nav className="app-nav">
          <a href="/pages?mode=server-only&analytics=off">Home</a>
          <a href="/pages/page-two?mode=server-only&analytics=off">Page Two</a>
          <a href="/pages">Hybrid rendering</a>
        </nav>
        <main className="app-main">
          <Component {...pageProps} />
        </main>
      </div>
    );
  return (
    <PagesBrowserRoot environment={pageProps.environment} result={pageProps.experiences}>
      <Component {...pageProps} />
    </PagesBrowserRoot>
  );
}
