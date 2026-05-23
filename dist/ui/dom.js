/** Tiny element factory. Use `text` for safe text content; never inject untrusted HTML. */
export function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === "class")
            node.className = v;
        else if (k === "text")
            node.textContent = v;
        else
            node.setAttribute(k, v);
    }
    for (const c of children)
        node.append(c);
    return node;
}
export function clear(node) {
    while (node.firstChild)
        node.removeChild(node.firstChild);
}
export function qs(sel, root = document) {
    const n = root.querySelector(sel);
    if (!n)
        throw new Error("Missing element: " + sel);
    return n;
}
//# sourceMappingURL=dom.js.map