import {
  ANONYMOUS_ID_COOKIE,
  type ConsentState,
  type ExperiencesNodeRequest,
} from '@contentful/experiences-node';
import type { Response } from 'express';

function cookieValue(cookies: unknown, name: string): string | undefined {
  if (!cookies || typeof cookies !== 'object') return undefined;
  const value: unknown = Reflect.get(cookies, name);
  return typeof value === 'string' ? value : undefined;
}

function decision(value: string | undefined): boolean | undefined {
  return value === 'granted' ? true : value === 'denied' ? false : undefined;
}

// Consumer integration: the host reads the browser's separate consent mirrors.
// An identity cookie is never proof of permission to retain or reuse identity.
export function readVisitor(cookies: unknown) {
  const consent: ConsentState = {
    events: decision(cookieValue(cookies, 'experiences-hybrid-event-consent')),
    persistence: decision(cookieValue(cookies, 'experiences-hybrid-persistence-consent')),
  };
  const id = consent.persistence === true ? cookieValue(cookies, ANONYMOUS_ID_COOKIE) : undefined;
  return { consent, profile: id ? { id } : undefined };
}

export function writeIdentity(
  response: Response,
  request: ExperiencesNodeRequest,
  secure: boolean
) {
  const options = { path: '/', sameSite: 'lax' as const, secure, httpOnly: false };
  if (request.canPersistProfile && request.profile?.id) {
    response.cookie(ANONYMOUS_ID_COOKIE, request.profile.id, {
      ...options,
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
  } else {
    response.clearCookie(ANONYMOUS_ID_COOKIE, options);
  }
}
