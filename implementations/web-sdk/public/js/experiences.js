import { documentToHtmlString } from '/dist/rich-text.js';

function renderCard(node, identity) {
  const card = document.createElement('article');
  card.className = 'entry-card';
  card.dataset.testid = `content-${identity}`;
  if (node.nodeId) card.dataset.nodeId = node.nodeId;

  const props = {
    ...node.props.design,
    ...node.props.content,
    ...node.props.resolved,
    ...node.slots,
  };
  const heading = document.createElement('h3');
  heading.textContent = props.title ?? '';
  const text = document.createElement('p');
  text.dataset.testid = `experience-text-${identity}`;
  text.textContent = props.text ?? '';
  card.append(heading, text);

  if (props.richText?.document) {
    const richText = document.createElement('div');
    richText.className = 'rich-text';
    richText.innerHTML = documentToHtmlString(props.richText.document);
    card.appendChild(richText);
  }
  return card;
}

// These are DOM renderers, separate from the empty SDK resolver registrations.
const renderers = {
  component: { codedComponent: renderCard },
  experienceTemplate: { codedExperienceTemplate: renderCard },
};

function renderNode(node, identity, parentSlot) {
  const renderer = renderers[node.registration.kind]?.[node.registration.id];
  let card;
  if (renderer) {
    card = renderer(node, identity);
  } else {
    card = document.createElement('article');
    card.className = 'entry-card';
    card.textContent = `Unregistered ${node.registration.kind}: ${node.registration.id}`;
  }
  if (parentSlot !== undefined) {
    card.classList.add('entry-card--slotted');
    const badge = document.createElement('span');
    badge.className = 'entry-card__badge entry-card__badge--slot';
    badge.textContent = `Slot: ${parentSlot}`;
    card.prepend(badge);
  }
  for (const [name, children] of Object.entries(node.slots)) {
    const slot = document.createElement('div');
    slot.className = 'entry-card__nested-children';
    slot.dataset.slot = name;
    children.forEach((child, index) =>
      slot.appendChild(renderNode(child, `${identity}-${name}-${index}`, name))
    );
    card.appendChild(slot);
  }
  return card;
}

export function renderExperience(plan, experienceId, section) {
  const container = document.createElement('section');
  container.className = 'entry-grid';
  container.dataset.experienceId = experienceId;
  container.dataset.testid = `${section}-experience-${experienceId}`;
  const header = document.createElement('div');
  header.className = 'entry-card__ids';
  const label = document.createElement('span');
  label.className = 'entry-card__id-label';
  label.textContent = 'Experience';
  const value = document.createElement('span');
  value.className = 'entry-card__id-value';
  value.textContent = experienceId;
  header.append(label, value);
  container.appendChild(header);
  if (plan.nodes.length === 0) {
    const empty = document.createElement('p');
    empty.dataset.testid = `${section}-experience-empty`;
    empty.textContent = 'This Experience has no content.';
    container.appendChild(empty);
  } else {
    plan.nodes.forEach((node, index) =>
      container.appendChild(renderNode(node, `${section}-${experienceId}-${index}`))
    );
  }
  return container;
}
