interface RuntimeParametersFormProps {
  parameters: string;
  searchParams: Record<string, string | string[] | undefined>;
}

export function RuntimeParametersForm({ parameters, searchParams }: RuntimeParametersFormProps) {
  return (
    <form method="get" style={{ padding: '1rem', border: '1px solid #ccc', marginBottom: '1rem' }}>
      <h2>Runtime Experience parameters</h2>
      <p>Edit the declared parameter values, then refetch to render the new content.</p>
      {Object.entries(searchParams).flatMap(([name, value]) =>
        name === 'parameters' || name === 'parameter_demo' || value === undefined
          ? []
          : (Array.isArray(value) ? value : [value]).map((item, index) => (
              <input key={`${name}-${index}`} type="hidden" name={name} value={item} />
            ))
      )}
      <input type="hidden" name="parameter_demo" value="true" />
      <label htmlFor="runtime-parameters">Parameters (JSON object)</label>
      <textarea
        id="runtime-parameters"
        name="parameters"
        defaultValue={parameters}
        required
        rows={5}
        style={{ display: 'block', width: '100%', fontFamily: 'monospace', margin: '0.5rem 0' }}
      />
      <p>
        Scalar example: <code>{'{"categorySlug":"culture"}'}</code>
        <br />
        Collection example: <code>{'{"featuredPosts":{"limit":6,"order":"-fields.title"}}'}</code>
      </p>
      <p>Use IDs declared by your Experience. Collection order is one fields.* or sys.* path.</p>
      <button type="submit">Refetch Experience</button>
    </form>
  );
}
