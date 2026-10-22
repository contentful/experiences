export function cloneTemplate(name) {
  return document.getElementById(`tpl-${name}`).content.cloneNode(true);
}
