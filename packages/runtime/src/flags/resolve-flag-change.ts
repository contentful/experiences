import { VariableChange, type Json } from '@contentful/optimization-api-client/api-schemas';

/** Resolve the last valid matching flag, retaining its exposure metadata. */
export function resolveFlagChange(
  name: string,
  changes?: readonly unknown[]
): (Omit<VariableChange, 'value'> & { value: Json }) | undefined {
  for (let index = (changes?.length ?? 0) - 1; index >= 0; index--) {
    const candidate = changes?.[index];
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      !('type' in candidate) ||
      candidate.type !== 'Variable' ||
      !('key' in candidate) ||
      candidate.key !== name
    )
      continue;
    const parsed = VariableChange.safeParse(candidate);
    if (!parsed.success) continue;

    const { value } = parsed.data;
    const actualValue =
      typeof value === 'object' &&
      value !== null &&
      'value' in value &&
      typeof value.value === 'object'
        ? value.value
        : value;
    return { ...parsed.data, value: actualValue };
  }
  return undefined;
}
