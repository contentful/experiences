import {
  documentToHtmlString,
  getTrackingAttributes,
  TRACKING_CLICKABLE_ATTRIBUTE,
} from '/dist/rich-text.js';
import { referenceNode } from '/dist/shared.js';
import { cloneTemplate } from './templates.js';

// Output adapter: fixed markup comes from the HTML response; the shared module
// prepares data only. CMS text uses text APIs, Rich Text its Contentful renderer.
function renderNode(node, identity, context, slotName) {
  const p = referenceNode(node, identity, context.section === 'manual');
  const card = cloneTemplate('card').firstElementChild;
  if (slotName !== undefined) {
    card.classList.add('entry-card--slotted');
    const badge = document.createElement('span');
    badge.className = 'entry-card__badge entry-card__badge--slot';
    badge.textContent = `Slot: ${slotName}`;
    card.prepend(badge);
  }
  const attributes = {
    ...p.attributes,
    ...(context.section === 'auto' ? getTrackingAttributes(node.attribution) : {}),
  };
  for (const [name, value] of Object.entries(attributes)) card.setAttribute(name, value);
  if (context.section === 'auto' && p.clickable)
    card.setAttribute(TRACKING_CLICKABLE_ATTRIBUTE, 'true');
  const title = card.querySelector('h3');
  const text = card.querySelector('p');
  const richText = card.querySelector('.rich-text');
  if (p.registered) {
    title.textContent = p.props.title ?? '';
    text.dataset.testid = `experience-text-${identity}`;
    text.textContent = p.props.text ?? '';
  } else {
    title.remove();
    text.textContent = `Unregistered ${node.registration.kind}: ${node.registration.id}`;
  }
  if (p.registered && p.props.richText?.document)
    richText.innerHTML = documentToHtmlString(p.props.richText.document);
  else richText.remove();
  if (p.manualRoot) context.onManualRoot(card, p.manualRoot);
  for (const [name, children] of Object.entries(node.slots)) {
    const slot = document.createElement('div');
    slot.className = 'entry-card__nested-children';
    slot.dataset.slot = name;
    children.forEach((child, index) =>
      slot.appendChild(renderNode(child, `${identity}-${name}-${index}`, context, name))
    );
    card.appendChild(slot);
  }
  return card;
}

export function renderExperience(plan, experienceId, section, { onManualRoot } = {}) {
  const container = cloneTemplate('experience').firstElementChild;
  container.dataset.experienceId = experienceId;
  container.dataset.testid = `${section}-experience-${experienceId}`;
  if (section === 'auto')
    for (const [name, value] of Object.entries(getTrackingAttributes(plan.attribution)))
      container.setAttribute(name, value);
  container.querySelector('.entry-card__id-value').textContent = experienceId;
  // Never disclose upstream diagnostic strings; retain useful partial content.
  const partial = container.querySelector('[data-partial]');
  if (plan.deliveryDiagnostics?.length) {
    partial.hidden = false;
    partial.dataset.testid = `${section}-experience-partial`;
    partial.textContent = `Some content could not be resolved (${plan.deliveryDiagnostics.length} delivery issues).`;
  } else partial.remove();
  const empty = container.querySelector('[data-empty]');
  if (!plan.nodes.length) empty.dataset.testid = `${section}-experience-empty`;
  else {
    empty.remove();
    plan.nodes.forEach((node, index) =>
      container.appendChild(
        renderNode(node, `${section}-${experienceId}-${index}`, { section, onManualRoot })
      )
    );
  }
  return container;
}
