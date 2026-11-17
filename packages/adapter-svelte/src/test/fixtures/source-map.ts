type Leaf = { kind: string; id: string };

export function minimalSourceMap({
  experienceId = 'exp-a',
  node = 'n',
  leaf = { kind: 'Component', id: 'probe' },
}: { experienceId?: string; node?: string; leaf?: Leaf } = {}) {
  return {
    version: 1,
    variants: [{ type: 'personalization', id: 'default' }],
    spaces: [],
    environments: [],
    locales: [],
    entries: [],
    assets: [],
    layers: [{ kind: 'Experience', id: experienceId, variants: [0] }, leaf],
    dataAssemblies: [],
    nodes: { [node]: { layers: [1, 0], scope: 0, contentProperties: [] } },
  };
}
