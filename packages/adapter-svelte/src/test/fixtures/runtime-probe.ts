import type { WebExperiencesRuntime } from '@contentful/experiences-web';
import type { ExperiencesActions, ExperiencesState } from '../../runtime/context.svelte.js';
import type { RuntimeOwner } from '../../runtime/owner-controller.svelte.js';

export type RuntimeProbeCapture = (context: {
  runtime: WebExperiencesRuntime;
  state: ExperiencesState;
  actions: ExperiencesActions;
  owner: RuntimeOwner;
}) => void;
