import { RuntimeParametersForm } from '@/components/RuntimeParametersForm';
import { renderDestinationPage } from '@/lib/destination-page';
import { flag, parseParameters, type SearchParams } from '@/lib/page-options';

interface PageProps {
  searchParams?: Promise<SearchParams>;
}

export const dynamic = 'force-dynamic';

export default async function ExperiencePage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const preview =
    process.env.CPA_TOKEN?.trim() &&
    typeof sp.preview_session_id === 'string' &&
    sp.preview_session_id.trim();
  const parameterInput = typeof sp.parameters === 'string' ? sp.parameters : undefined;
  const showParameters = !preview && (flag(sp.parameter_demo) || parameterInput !== undefined);
  if (!preview && parameterInput !== undefined) {
    try {
      parseParameters(parameterInput);
    } catch {
      return (
        <>
          <RuntimeParametersForm parameters={parameterInput} searchParams={sp} />
          <p role="alert">Parameters must be a JSON object. Correct the value and refetch.</p>
        </>
      );
    }
  }
  return (
    <>
      {showParameters && (
        <RuntimeParametersForm parameters={parameterInput ?? '{}'} searchParams={sp} />
      )}
      {await renderDestinationPage()}
    </>
  );
}
