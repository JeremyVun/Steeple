// Tiny DOM helpers. The interface is hand-built markup — semantic elements,
// no templating library, no innerHTML for anything derived from data.

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }

  append(node, children);
  return node;
}

export function append(node, children) {
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function replaceChildren(node, children) {
  node.textContent = '';
  return append(node, children);
}

/** The steeple mark: the roofline and spire from the brand favicon. */
export function steepleMark(size = 20) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M16 2 21 14 25 14 25 17 23 17 23 30 19 30 19 24a3 3 0 0 0-6 0v6H9V17H7v-3h4Z');
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

/** A labelled block: micro eyebrow above content. */
export function section(label, children, className = '') {
  return el('section', { class: `block ${className}`.trim() }, [
    el('h3', { class: 'eyebrow', text: label }),
    ...(Array.isArray(children) ? children : [children]),
  ]);
}

export function chipList(items, className = 'chip') {
  return el(
    'ul',
    { class: 'chips' },
    items.map((item) => el('li', { class: className, text: item }))
  );
}
