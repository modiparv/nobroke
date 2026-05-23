type Attrs = Record<string, string>;
type Child = Node | string;

/** Tiny element factory. Use `text` for safe text content; never inject untrusted HTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function qs<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const n = root.querySelector(sel);
  if (!n) throw new Error("Missing element: " + sel);
  return n as T;
}
