// Guest and host are independent surfaces inside one document. Prefixing at
// the CSS transform boundary preserves today's cascade order and specificity
// while making a generic selector such as `.field` incapable of crossing from
// one surface into the other.

const scopes = new Map([
  ['guest.css', '.guest'],
  ['host.css', '.hostdesk'],
]);

function scopedSelector(selector, root) {
  return selector
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      if (trimmed.startsWith(root) || trimmed.startsWith(`:where(${root})`)) return trimmed;
      return `:where(${root}) ${trimmed}`;
    })
    .join(', ');
}

const surfaceOwnership = {
  postcssPlugin: 'steeple-surface-ownership',
  Rule(rule) {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    const filename = rule.source?.input?.file?.split('/').at(-1);
    const root = scopes.get(filename);
    if (root) rule.selector = scopedSelector(rule.selector, root);
  },
};

export default { plugins: [surfaceOwnership] };
