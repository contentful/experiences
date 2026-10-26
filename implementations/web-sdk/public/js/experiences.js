import {
  documentToHtmlString,
  getTrackingAttributes,
  TRACKING_CLICKABLE_ATTRIBUTE,
} from '/dist/rich-text.js';
import { cloneTemplate } from './templates.js';

// Reference app: coded registrations share this deliberately small renderer.
// Consumers render their own components/content; HTML templates are a presentation
// choice, and title/text/richText follow these bindings. Keep plain values in text APIs.
function renderCard(node, identity) {
  const card = cloneTemplate('card').firstElementChild;
  // Maintainer: stable selectors identify rendered output; SDK tracking ignores them.
  card.dataset.testid = `content-${identity}`;
  if (node.nodeId) card.dataset.nodeId = node.nodeId;

  const props = {
    ...node.props.design,
    ...node.props.content,
    ...node.props.resolved,
    ...node.slots,
  };
  card.querySelector('h3').textContent = props.title ?? '';
  const text = card.querySelector('p');
  text.dataset.testid = `experience-text-${identity}`;
  text.textContent = props.text ?? '';
  const richText = card.querySelector('.rich-text');
  if (props.richText?.document) {
    richText.innerHTML = documentToHtmlString(props.richText.document);
  } else richText.remove();
  return card;
}

// Consumer integration: distinguish component and Experience Template registrations.
// This app's DOM registry is separate from the SDK's resolveData registrations.
const renderers = {
  component: { codedComponent: renderCard },
  experienceTemplate: { codedExperienceTemplate: renderCard },
};

function renderUnknown(node) {
  const card = document.createElement('article');
  card.className = 'entry-card';
  card.textContent = `Unregistered ${node.registration.kind}: ${node.registration.id}`;
  return card;
}

// Reference app: the slot badge/accent explains the delivered hierarchy visually.
function markSlot(card, name) {
  card.classList.add('entry-card--slotted');
  const badge = document.createElement('span');
  badge.className = 'entry-card__badge entry-card__badge--slot';
  badge.textContent = `Slot: ${name}`;
  card.prepend(badge);
}

// Consumer integration, when tracking automatically: stamp actual scope roots using the
// public helper. Only Fragment roots opt into clicks; child content inherits the
// SDK's scope resolution. data-testid attributes play no role here.
function stampAutomaticTracking(card, roots) {
  const attributes = getTrackingAttributes({ roots });
  for (const [name, value] of Object.entries(attributes)) card.setAttribute(name, value);
  if (roots.some((scope) => scope.entityKind === 'ExperienceFragment')) {
    card.setAttribute(TRACKING_CLICKABLE_ATTRIBUTE, 'true');
  }
}

function prepareTracking(card, roots, context) {
  if (context.section === 'auto') stampAutomaticTracking(card, roots);
  else if (roots.length) {
    // Consumer integration: one explicit element registration carries one target.
    // Use its innermost delivered scope; automatic tracking retains every root key.
    context.onManualRoot(card, roots.at(-1));
  }
}

function appendSlots(card, slots, identity, context) {
  for (const [name, children] of Object.entries(slots)) {
    // Consumer integration: recurse through delivered named slots; flat siblings stay flat.
    const slot = document.createElement('div');
    slot.className = 'entry-card__nested-children';
    slot.dataset.slot = name;
    children.forEach((child, index) =>
      slot.appendChild(renderNode(child, `${identity}-${name}-${index}`, context, name))
    );
    card.appendChild(slot);
  }
}

function renderNode(node, identity, context, parentSlot) {
  const renderer = renderers[node.registration.kind]?.[node.registration.id] ?? renderUnknown;
  const card = renderer(node, identity);
  if (parentSlot !== undefined) markSlot(card, parentSlot);
  prepareTracking(card, node.attribution?.roots ?? [], context);
  appendSlots(card, node.slots, identity, context);
  return card;
}

export function renderExperience(plan, experienceId, section, { onManualRoot } = {}) {
  const context = { section, onManualRoot };
  const container = cloneTemplate('experience').firstElementChild;
  // Consumer integration: each rendered plan container supplies its attribution once.
  // The SDK discovers its roots and distinguishes repeated presentations by this DOM
  // boundary; consumers need no lookup, namespace, session or tracking teardown.
  if (section === 'auto') {
    for (const [name, value] of Object.entries(getTrackingAttributes(plan.attribution)))
      container.setAttribute(name, value);
  }
  container.dataset.experienceId = experienceId;
  container.dataset.testid = `${section}-experience-${experienceId}`;
  container.querySelector('.entry-card__id-value').textContent = experienceId;
  const empty = container.querySelector('p');
  if (plan.nodes.length === 0) {
    empty.dataset.testid = `${section}-experience-empty`;
  } else {
    empty.remove();
    plan.nodes.forEach((node, index) =>
      container.appendChild(renderNode(node, `${section}-${experienceId}-${index}`, context))
    );
  }
  return container;
}
