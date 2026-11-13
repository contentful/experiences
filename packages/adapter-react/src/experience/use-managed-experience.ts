'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type {
  ExperienceRequest,
  FetchByDestinationNodeOptions,
  FetchByDestinationPathOptions,
  FetchExperienceOptions,
  FetchResolveOptions,
} from '@contentful/experiences-web';
import { RuntimeContext } from '../runtime/context.js';
import { useRequestContext } from '../runtime/request-context.js';
import { useObservableState } from '../runtime/use-experiences-state.js';
import type { Config } from '../registry/types.js';
import type { SuppliedExperienceProps } from './experience.js';
import {
  SourceController,
  type ExperienceRedirect,
  type ManagedExperienceSnapshot,
} from './source-controller.js';

export type { ExperienceRedirect } from './source-controller.js';

export interface ExperienceNotifications {
  /** Current usable presentation, after React commits it. */
  readonly onExperienceResolved?: (
    result: ManagedExperienceResult & { readonly data: PortableRenderPlan }
  ) => void;
  /** Current error, including errors alongside retained usable content. */
  readonly onExperienceError?: (error: Error, result: ManagedExperienceResult) => void;
  /**
   * Current Destination redirect, after React commits it. The SDK never navigates:
   * route the visitor (or re-select the new path) at the application/router boundary.
   */
  readonly onExperienceRedirect?: (
    redirect: ExperienceRedirect,
    result: ManagedExperienceResult
  ) => void;
}

type Never<Keys extends PropertyKey> = { readonly [Key in Keys]?: never };

/** Select an Experience by id; the only selector with locale, parameters, extensions and preview. */
export type ExperienceIdSelector = FetchExperienceOptions &
  Never<'destinationId' | 'path' | 'nodeId'>;
/** Select the Experience a Destination serves at an absolute path. Space-scoped, no locale. */
export type DestinationPathSelector = FetchByDestinationPathOptions &
  Never<'experienceId' | 'nodeId' | 'locale' | 'parameters' | 'extensions'>;
/** Select the Experience a Destination node serves. Space-scoped, no locale. */
export type DestinationNodeSelector = FetchByDestinationNodeOptions &
  Never<'experienceId' | 'path' | 'locale' | 'parameters' | 'extensions'>;
/** Which content a managed source loads: by Experience id, Destination path or Destination node. */
export type ExperienceSelector =
  ExperienceIdSelector | DestinationPathSelector | DestinationNodeSelector;

export interface ManagedExperienceSourceOptions extends ExperienceNotifications {
  readonly config: Config;
  readonly initialPlan?: PortableRenderPlan;
  /** Terminal error for this descriptor; binds preview without a startup refetch. */
  readonly initialError?: Error;
  /** Server-seeded Destination redirect for this descriptor; adopted without a startup fetch. */
  readonly initialRedirect?: ExperienceRedirect;
  readonly resolveOptions?: Omit<FetchResolveOptions, 'config'>;
}

export type ManagedExperienceOptions = ExperienceSelector & ManagedExperienceSourceOptions;

/** Every key that selects or seeds managed loading; supplied plans set none of them. */
export type ManagedExperienceKey =
  | 'experienceId'
  | 'destinationId'
  | 'path'
  | 'nodeId'
  | 'locale'
  | 'parameters'
  | 'personalization'
  | 'extensions'
  | 'initialPlan'
  | 'initialError'
  | 'initialRedirect'
  | 'resolveOptions';

export interface ManagedExperienceResult extends ManagedExperienceSnapshot {
  refresh(): Promise<void>;
  retry(): Promise<void>;
}

const noRefresh = async (): Promise<void> => {};

/** Shared commit notifications; callback replacement and StrictMode do not repeat a presentation. */
function useExperienceNotifications(
  result: ManagedExperienceResult,
  { onExperienceResolved, onExperienceError, onExperienceRedirect }: ExperienceNotifications,
  isCurrent: () => boolean
): void {
  const reported = useRef<{ data?: PortableRenderPlan; error?: Error; redirect?: object }>({});
  useEffect(() => {
    if (!isCurrent()) return;
    const { data, error, redirect } = result;
    const changedData = data !== undefined && reported.current.data !== data;
    const changedError = error !== undefined && reported.current.error !== error;
    const changedRedirect = redirect !== undefined && reported.current.redirect !== redirect;
    reported.current = { data, error, redirect };
    if (changedData) onExperienceResolved?.({ ...result, data });
    // A resolution callback can synchronously unmount or supersede this owner.
    if (changedError && isCurrent()) onExperienceError?.(error, result);
    if (changedRedirect && isCurrent()) onExperienceRedirect?.(redirect, result);
  });
}

/** Whether the props select managed loading rather than supplied presentation. */
export function isManagedExperience(
  options: ManagedExperienceOptions | SuppliedExperienceProps
): options is ManagedExperienceOptions {
  return options.experienceId !== undefined || options.destinationId !== undefined;
}

/** Select only transport fields; presentation props never enter SDK descriptors. */
function selectRequest(options: ManagedExperienceOptions): ExperienceRequest {
  if (options.experienceId !== undefined)
    return {
      experienceId: options.experienceId,
      locale: options.locale,
      parameters: options.parameters,
      personalization: options.personalization,
      extensions: options.extensions,
    };
  return options.nodeId !== undefined
    ? {
        destinationId: options.destinationId,
        nodeId: options.nodeId,
        personalization: options.personalization,
      }
    : {
        destinationId: options.destinationId,
        path: options.path!,
        personalization: options.personalization,
      };
}

/** Resolve managed content after commit, preserving an application-supplied initial plan. */
export function useManagedExperience(options: ManagedExperienceOptions): ManagedExperienceResult {
  return useExperienceSource(options);
}

/** Internal source selection keeps one controller and renderer mounted across mode changes. */
export function useExperienceSource(
  options: ManagedExperienceOptions | SuppliedExperienceProps
): ManagedExperienceResult {
  const context = useContext(RuntimeContext);
  const managed = isManagedExperience(options);
  if (managed && !context)
    throw new Error('Experiences hooks require an ExperiencesRoot or ExperiencesProvider.');
  const requestContext = useRequestContext();
  const locale = useObservableState(managed ? context?.sdk.states.locale : undefined);
  const suppliedData = managed ? undefined : (options.experience ?? undefined);
  const suppliedStatus = suppliedData ? 'success' : 'idle';
  const [controller] = useState(
    () =>
      new SourceController(
        managed ? options.initialPlan : suppliedData,
        managed ? options.initialError : undefined,
        managed ? options.initialRedirect : undefined
      )
  );
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot());

  useEffect(() => {
    controller.setSnapshotListener(setSnapshot);
    return () => {
      controller.setSnapshotListener(undefined);
      controller.disconnect();
    };
  }, [controller]);

  // Deliberately passive: ancestor activation and route guards install during layout.
  // The controller compares effective values, so fresh equivalent objects do not refetch.
  useEffect(() => {
    if (!isManagedExperience(options)) {
      controller.updateSupplied(suppliedData);
      return;
    }
    const { config, initialPlan, initialError, initialRedirect, resolveOptions } = options;
    const request = selectRequest(options);
    const liveSdk = context?.isLive ? context.sdk : undefined;
    const previewRequest = liveSdk?.isPreview === true;
    controller.updateOptions({
      seedRequest: request,
      effectiveLocale: 'experienceId' in request ? (request.locale ?? locale) : undefined,
      // Destinations accept no locale or general extensions: their requests stay as selected.
      request:
        'experienceId' in request
          ? {
              ...request,
              // Session-owned locale and parameters remain server-controlled.
              locale: request.locale ?? (previewRequest ? undefined : locale),
              extensions: previewRequest
                ? request.extensions
                : { ...request.extensions, sourceMap: request.extensions?.sourceMap ?? {} },
            }
          : request,
      resolve: { ...resolveOptions, config },
      initialPlan,
      initialError,
      initialRedirect,
      requestContext,
      sdk: liveSdk,
    });
  });

  const presentation: ManagedExperienceSnapshot =
    !managed &&
    (snapshot.data !== suppliedData ||
      snapshot.error !== undefined ||
      snapshot.redirect !== undefined ||
      snapshot.status !== suppliedStatus)
      ? {
          status: suppliedStatus,
          data: suppliedData,
          error: undefined,
        }
      : snapshot;
  const result = {
    ...presentation,
    refresh: managed ? controller.refresh : noRefresh,
    retry: managed ? controller.retry : noRefresh,
  };
  useExperienceNotifications(result, options, () => controller.isCurrentSnapshot(presentation));
  return result;
}
