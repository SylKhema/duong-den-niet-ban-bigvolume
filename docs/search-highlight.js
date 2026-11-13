const searchHighlight = (() => {
  let selected;
  let marks = [];

  function fold(value) {
    return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd');
  }

  function matches(text, query) {
    const needle = fold(query);
    if (!needle) return [];
    let normalized = '';
    let offset = 0;
    const offsets = [];
    for (const character of text) {
      const next = offset + character.length;
      const folded = fold(character);
      normalized += folded;
      for (let i = 0; i < folded.length; i++) offsets.push({ start: offset, end: next });
      if (!folded && offsets.length) offsets.at(-1).end = next;
      offset = next;
    }
    const ranges = [];
    for (let index = normalized.indexOf(needle); index >= 0; index = normalized.indexOf(needle, index + needle.length)) {
      ranges.push([offsets[index].start, offsets[index + needle.length - 1].end]);
    }
    return ranges;
  }

  function snippet(text, query, limit, escape, format = escape) {
    const first = matches(text, query)[0];
    const start = first ? Math.max(0, first[0] - Math.floor(limit / 3)) : 0;
    const end = Math.min(text.length, Math.max(start + limit, first?.[1] ?? 0));
    const excerpt = text.slice(start, end);
    let previous = 0;
    let output = start ? '…' : '';
    for (const [from, to] of matches(excerpt, query)) {
      output += format(excerpt.slice(previous, from)) + '<mark class="search-match">' +
        escape(excerpt.slice(from, to)) + '</mark>';
      previous = to;
    }
    return output + format(excerpt.slice(previous)) + (end < text.length ? '…' : '');
  }

  function clear() {
    selected = undefined;
    for (const mark of marks) {
      const parent = mark.parentNode;
      if (parent) {
        mark.replaceWith(document.createTextNode(mark.textContent));
        parent.normalize();
      }
    }
    marks = [];
  }

  function select(hash, query = '') {
    clear();
    selected = { hash, query: query.trim() };
  }

  function locate(target, scope = target) {
    if (!target || !scope) return target;
    if (selected?.hash !== location.hash) {
      clear();
      return target;
    }
    if (marks.length && marks[0].isConnected) return marks[0];
    const query = selected.query;
    const nodes = [];
    let text = '';
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement.closest('button, .source-line, .sourcebar, .paragraph-anchor, [hidden]')) continue;
      nodes.push({ node, start: text.length });
      text += node.data;
    }
    const ranges = matches(text, query);
    let nodeIndex = 0;
    for (const [start, end] of ranges) {
      while (nodeIndex < nodes.length && nodes[nodeIndex].start + nodes[nodeIndex].node.data.length <= start) nodeIndex++;
      for (let i = nodeIndex; i < nodes.length && nodes[i].start < end; i++) {
        const { node, start: offset } = nodes[i];
        const from = Math.max(0, start - offset);
        const to = Math.min(node.data.length, end - offset);
        const mark = document.createElement('mark');
        mark.className = 'search-match';
        mark.textContent = node.data.slice(from, to);
        const remainder = document.createTextNode(node.data.slice(to));
        node.replaceWith(document.createTextNode(node.data.slice(0, from)), mark, remainder);
        nodes[i] = { node: remainder, start: offset + to };
        marks.push(mark);
      }
    }
    return marks[0] || target;
  }

  return { snippet, select, locate, clear };
})();
