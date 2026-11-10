import { EventBuilder, withEventConsent } from '@contentful/experiences-runtime';

/** The explicit server consent belongs to this batch, independently of browser admission. */
export function serverEventBuilder(consent: boolean): EventBuilder {
  return new EventBuilder({
    channel: 'server',
    library: { name: 'test', version: '1' },
    getConsent: () => consent,
  });
}

/** Only ordinary valid batches use this fixture; malformed ordering stays visible in its test. */
export function preparedEvents(builder: EventBuilder, consent: boolean, withTrack = true) {
  return [
    ...(withTrack ? [builder.buildTrack({ event: 'prepared' })] : []),
    builder.buildPageView(),
  ].map((event) => withEventConsent(event, consent));
}
