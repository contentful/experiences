// Reference app: one browser asset for this renderer's imports. Consumers can
// import these dependencies directly through their own bundler; no facade is required.
export { documentToHtmlString } from '@contentful/rich-text-html-renderer';
export {
  getTrackingAttributes,
  TRACKING_CLICKABLE_ATTRIBUTE,
} from '@contentful/experiences-web/tracking-attributes';
// The Web UMD global is the ContentfulExperiences class only, so this pure guard
// for Destination redirect results comes from the installed package entry.
export { isDestinationRedirect } from '@contentful/experiences-web';
