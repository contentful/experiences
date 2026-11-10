import type { ChangeArray, VariableChange } from '@contentful/experiences-runtime';

/** A selected flag with explicit attribution, reusable across state and preview tests. */
export function flagChanges(
  value: VariableChange['value'] = true,
  experienceId = 'experiment',
  variantIndex = 1
): ChangeArray {
  return [{ type: 'Variable', key: 'banner', value, meta: { experienceId, variantIndex } }];
}
