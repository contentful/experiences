/**
 * Local ambient declaration for the optional peer subpath
 * `@contentful/optimization-react-web/experiences-adapter`. The peer is not
 * installed in the workspace, so this declaration is the only type surface
 * `packages/adapter-react` sees for the module. It is intentionally minimal —
 * mirrors just the exports this package consumes.
 *
 * When the peer package is installed by a consumer, its real declarations
 * take precedence via module resolution.
 */
declare module '@contentful/optimization-react-web/experiences-adapter' {
  export interface ResolvedNodeMetadata {
    entityId: string;
    entityKind: 'Experience' | 'Fragment';
    optimizationId: string;
    variantId: string;
    variantIndex: number;
    parentExperienceId?: string;
  }

  export interface ExperiencesOptimizationAdapter {
    useNodeBinding: (
      nodeId: string,
      sourceMap: unknown,
    ) => {
      ref: (element: HTMLElement | null) => void;
      resolved: ResolvedNodeMetadata | null;
    };
    attachInteractionRuntime: (opts: {
      views: boolean;
      clicks: boolean;
      hovers: boolean;
    }) => () => void;
  }

  export function getExperiencesAdapter(optimization: unknown): ExperiencesOptimizationAdapter;
}
