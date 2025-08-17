import type {Definition} from "./define.js";
import {inspect, inspectError, getExpanded} from "./inspect.js";
import {mapAssets} from "./stdlib/assets.js";

export type DisplayState = {
  /** the HTML element in which to render this cell’s display */
  root: HTMLDivElement;
  /** for inspected values, any expanded paths; see getExpanded */
  expanded: (number[][] | undefined)[];
};

export function display(state: DisplayState, value: unknown): void {
  const {root, expanded} = state;
  const node = isDisplayable(value, root) ? value : inspect(value, expanded[root.childNodes.length]); // prettier-ignore
  displayNode(state, node);
}

function displayNode(state: DisplayState, node: Node): void {
  if (node.nodeType === 11) {
    let child: ChildNode | null;
    while ((child = node.firstChild)) {
      state.root.appendChild(child);
    }
  } else {
    state.root.appendChild(node);
  }
}

function displayError(state: DisplayState, value: unknown): void {
  displayNode(state, inspectError(value));
}

// Note: Element.prototype is instanceof Node, but cannot be inserted! This
// excludes DocumentFragment since appending a fragment “dissolves” (mutates)
// the fragment, and we wish for the inspector to not have side-effects.
function isDisplayable(value: unknown, root: HTMLDivElement): value is Node {
  return (
    (value instanceof Element || value instanceof Text) &&
    value instanceof value.constructor &&
    (!value.parentNode || root.contains(value))
  );
}

export function clear(state: DisplayState): void {
  state.expanded = Array.from(state.root.childNodes, getExpanded);
  while (state.root.lastChild) state.root.lastChild.remove();
}

export function observe(state: DisplayState, {autodisplay, assets}: Definition) {
  return {
    _error: false,
    _node: state.root, // _node for visibility promise
    pending() {
      if (this._error) {
        this._error = false;
        clear(state);
      }
    },
    fulfilled(value: unknown) {
      if (autodisplay) {
        clear(state);
        if (assets && value instanceof Element) mapAssets(value, assets);
        display(state, value);
      }
    },
    rejected(error: unknown) {
      console.error(error);
      this._error = true;
      clear(state);
      displayError(state, error);
    }
  };
}
