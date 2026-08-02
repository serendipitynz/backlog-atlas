/**
 * Mounting a component for a test (TASK-91). The counterpart to `fixtures.ts`: not imported by the
 * app, and only the `*.component.test.ts` files consume it.
 *
 * Deliberately thin. Svelte 5 exports `mount`/`unmount`/`flushSync` itself, so what a testing
 * library would add here is a query API and a synthetic event layer — and this project needs
 * neither. The queries are `host.querySelector`, which is what the components' own selectors are
 * already written against (`Modal.svelte`'s FOCUSABLE list, for one). The events are built by hand
 * because doc-7 §2.1 puts an IME composition in the middle of the keyboard contract: a press during
 * composition must not fire, and macOS WebKit reports that press as `keyCode === 229`. A synthetic
 * `type()` cannot produce that pair, and a contract that cannot be stated cannot be fixed.
 */

import {
  createRawSnippet,
  flushSync,
  mount,
  unmount,
  type Component,
  type ComponentProps,
  type Snippet,
} from "svelte";

export interface Mounted {
  /** The element the component was mounted into. Every query in a test starts here. */
  readonly host: HTMLElement;
  destroy(): void;
}

/** What `cleanup` has to undo. */
const opened: Mounted[] = [];
let restoreLayout: (() => void) | null = null;
let restoreObserver: (() => void) | null = null;

/**
 * Report a box for elements that are rendered, so `getClientRects` answers in a test what it
 * answers in the app.
 *
 * jsdom runs no layout, so its `getClientRects` returns an empty list for *everything* — including a
 * plainly visible button. `Modal.svelte` filters its focus cycle by `getClientRects().length > 0`
 * (`FOCUSABLE` matches the controls that are present; this is what drops the ones that are not
 * rendered), so under stock jsdom that cycle is always empty and the modal falls back to focusing
 * the dialog box. Every modal test would then run a path the app never takes — which is the failure
 * m-1 TASK-56 already produced once: a menu that was never wired, past a green run.
 *
 * So this reproduces the *rule* the app's call depends on rather than geometry. An element is
 * rendered unless it, or something it sits inside, is `hidden`, inline `display: none`, or a closed
 * `details` it is not the `summary` of; those are the ways this codebase takes a control out of the
 * page. Nothing here measures size or position, and no test may assert on the numbers below.
 */
function stubLayout(): () => void {
  const proto = window.Element.prototype;
  const original = proto.getClientRects;
  proto.getClientRects = function (this: Element): DOMRectList {
    const list = rendered(this) ? [new DOMRect(0, 0, 100, 20)] : [];
    return Object.assign(list, {
      item: (index: number) => list[index] ?? null,
    }) as unknown as DOMRectList;
  };
  return () => {
    proto.getClientRects = original;
  };
}

/**
 * Give the page a `ResizeObserver` that never reports, so a component that measures itself mounts.
 *
 * jsdom has no such class at all, and `Swimlane.svelte` constructs one to keep the レーンヘッダ行 stuck
 * below the 列ヘッダ行's current height — without it, every test that mounts the app dies in that
 * effect. The stub observes nothing because there is nothing to observe: jsdom runs no layout, so no
 * element ever changes size, and a callback firing here would deliver the zeros of `stubLayout`'s
 * neighbours rather than a measurement. What the app does with the number is a matter for the screen
 * (受入条件 #1–#3 of TASK-61), and no test may assert on it — the same rule as `getClientRects`.
 */
function stubResizeObserver(): () => void {
  if ("ResizeObserver" in window) return () => {};
  class Stub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(window, "ResizeObserver", { value: Stub, configurable: true, writable: true });
  return () => {
    Reflect.deleteProperty(window, "ResizeObserver");
  };
}

function rendered(element: Element): boolean {
  if (!element.ownerDocument.body.contains(element)) return false;
  let child: Element = element;
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    if (node.hasAttribute("hidden")) return false;
    if (node instanceof HTMLElement && node.style.display === "none") return false;
    // A closed `details` renders its `summary` and hides the rest, which is the case doc-11 §5
    // relies on when it keeps a withheld control focusable inside an open one.
    if (
      node !== element &&
      node.tagName === "DETAILS" &&
      !(node as HTMLDetailsElement).open &&
      child.tagName !== "SUMMARY"
    ) {
      return false;
    }
    child = node;
  }
  return true;
}

/**
 * Mount `component` into a fresh host appended to the document, and apply the pending effects
 * before returning — so a test reads the DOM the user would see, not the one mid-render.
 */
// `any` in the constraint is Svelte's own: `Component`'s parameters are declared
// `Record<string, any>`, and narrowing them here would reject components whose props include a
// snippet or a callback. `ComponentProps<C>` still types the call site exactly.
export function render<C extends Component<any, any>>(
  component: C,
  props: ComponentProps<C>,
): Mounted {
  restoreLayout ??= stubLayout();
  restoreObserver ??= stubResizeObserver();
  const host = document.createElement("div");
  document.body.append(host);
  const instance = mount(component, { target: host, props });
  const handle: Mounted = {
    host,
    destroy() {
      unmount(instance);
      host.remove();
    },
  };
  opened.push(handle);
  flushSync();
  return handle;
}

/**
 * Undo everything `render` put in the document. Called from `afterEach` explicitly, rather than from
 * a setup file, so a component test reads as the whole of what it does.
 *
 * Unmounting matters more here than tidiness: the contracts being fixed are about what happens *as*
 * a panel is unmounted (doc-8 §6.3), and a component left mounted never runs its `$effect` teardown
 * — the one that gives focus back to the opener.
 */
export function cleanup(): void {
  while (opened.length > 0) opened.pop()?.destroy();
  restoreLayout?.();
  restoreLayout = null;
  restoreObserver?.();
  restoreObserver = null;
}

/**
 * Build the `children` snippet a component asks for, from static markup.
 *
 * Wrapped in a `div` because `createRawSnippet` mounts a single root element and silently drops the
 * siblings — a two-control snippet would otherwise render one control and the test would pass
 * against a form that is not the one it wrote. The wrapper takes no focus and matches no selector
 * the components query, so it changes nothing that is being fixed.
 */
export function snippet(html: string): Snippet {
  return createRawSnippet(() => ({ render: () => `<div>${html}</div>` }));
}

/**
 * Press a key on `target`. Bubbles and is cancelable, like the real thing, because the handlers
 * under test sit on ancestors and read `defaultPrevented`.
 *
 * `init` is where a composition is stated: `{ isComposing: true }` for the guard doc-7 §2.1
 * requires, `{ keyCode: 229 }` for the form macOS WebKit sends.
 */
export function press(target: Element, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
  );
  flushSync();
}

/** Click `target` and apply what the click changed. */
export function click(target: Element): void {
  (target as HTMLElement).click();
  flushSync();
}

/** Put `value` in a field the way typing would, so the component's `oninput` sees it. */
export function fill(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

/**
 * The one element matching `selector`. A test that means "the 保存 button" should fail rather than
 * silently take the first of two — the screens under test draw repeated controls per row.
 */
export function only<E extends Element>(host: ParentNode, selector: string): E {
  const found = [...host.querySelectorAll<E>(selector)];
  if (found.length !== 1) {
    throw new Error(`expected exactly one ${selector}, found ${found.length}`);
  }
  return found[0];
}

/**
 * `element`'s accessible name, as far as this app's controls need one: `aria-label` when it has one,
 * otherwise its text with the `aria-hidden` descendants left out.
 *
 * Needed because several controls print something beside their name that is decorative and marked as
 * such: a menu line appends the chord from the 割り当て一覧 (doc-7 §2.1), which differs between macOS and
 * the rest. Matching on `textContent` would tie a test to the platform it happened to run on.
 *
 * `aria-label` comes first because that is the order the accessible name computation has, and because
 * an アイコンのみのボタン (doc-11 §2.4) has no text at all — its figure is `aria-hidden`, so its name is
 * *only* the label, and a test that fell back to content would be matching the empty string.
 */
function announced(element: Element): string {
  const label = element.getAttribute("aria-label");
  if (label !== null) return label.trim();
  let text = "";
  for (const node of element.childNodes) {
    if (node.nodeType === node.TEXT_NODE) text += node.textContent ?? "";
    else if (node instanceof Element && node.getAttribute("aria-hidden") !== "true") {
      text += announced(node);
    }
  }
  return text.trim();
}

/** The one element matching `selector` whose announced name is `label`. */
export function byLabel<E extends Element>(host: ParentNode, selector: string, label: string): E {
  const found = [...host.querySelectorAll<E>(selector)].filter(
    (element) => announced(element) === label,
  );
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one ${selector} announced as "${label}", found ${found.length}`,
    );
  }
  return found[0];
}

/** The element whose visible text is `text`, where a selector would only restate the markup. */
export function byText<E extends Element>(host: ParentNode, selector: string, text: string): E {
  const found = [...host.querySelectorAll<E>(selector)].filter(
    (element) => element.textContent?.trim() === text,
  );
  if (found.length !== 1) {
    throw new Error(`expected exactly one ${selector} reading "${text}", found ${found.length}`);
  }
  return found[0];
}
