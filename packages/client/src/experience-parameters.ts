/** One collection order path; `-` selects descending order. Delivery validates the path. */
export type ExperienceParameterOrder =
  `fields.${string}` | `sys.${string}` | `-fields.${string}` | `-sys.${string}`;

/** Runtime values for one Record parameter. Nested records and arrays are not supported. */
export type ExperienceParameterRecord = Record<string, string | number>;

export type ExperienceParameterValue = string | number | ExperienceParameterRecord;

/** Unprefixed IDs declared in Experience.parameters and referenced as `$parameters/<id>`. */
export type ExperienceParameters = Record<string, ExperienceParameterValue>;

/**
 * Flatten values for the generated client's GET queryParams escape hatch.
 * An empty Record cannot be represented by query leaves: preserve it via POST.
 * Delivery owns name, requiredness, fallback and value validation.
 */
export function parameterQuery(
  parameters: ExperienceParameters | undefined
): Record<string, string | number> | undefined {
  const entries: [string, string | number][] = [];
  for (const [id, value] of Object.entries(parameters ?? {})) {
    // A dotted ID could masquerade as another parameter's Record leaf on GET.
    // Preserve the original name on POST and let delivery validate it.
    if (id.includes('.')) return undefined;
    if (typeof value === 'string' || typeof value === 'number') {
      entries.push([`parameter.${id}`, value]);
    } else {
      // Untyped callers can supply other JSON shapes. Use POST so delivery
      // sees their original value rather than a lossy query string coercion.
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const leaves = Object.entries(value);
      if (leaves.length === 0) return undefined;
      for (const [field, leaf] of leaves) {
        if (field.includes('.')) return undefined;
        if (typeof leaf !== 'string' && typeof leaf !== 'number') return undefined;
        entries.push([`parameter.${id}.${field}`, leaf]);
      }
    }
  }
  return Object.fromEntries(entries);
}
