// A W3C WebDriver client over `fetch`, holding only what the GUI E2E presses and reads.
//
// Hand-written rather than pulled from npm because WebDriver is JSON over HTTP and the calls this
// suite makes are the nine below — the same reason `src/lib/render.ts` is the whole component-test
// harness. TASK-105's AC #4 forbids a new production dependency; a devDependency would have passed
// it and still bought nothing here.
//
// **Reads go through `executeScript`, presses and typing go through element handles.** Svelte 5
// replaces nodes as state moves, so a handle taken to *read* a value later is a stale reference
// waiting to happen; a `document.querySelector` evaluated at read time cannot go stale. The two
// operations that must raise real events — click and send keys — have no such alternative, so they
// take a handle and use it immediately.

const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecc";

class WebDriverError extends Error {}

async function call(base, method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  if (text !== "") {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new WebDriverError(`${method} ${path} returned non-JSON: ${text.slice(0, 400)}`);
    }
  }
  if (!response.ok) {
    const value = payload?.value ?? {};
    throw new WebDriverError(
      `${method} ${path} failed (${response.status} ${value.error ?? "unknown"}): ${
        value.message ?? text.slice(0, 400)
      }`,
    );
  }
  return payload?.value ?? null;
}

/**
 * Open a session against a running `tauri-driver`.
 *
 * `application` is the Tauri binary itself, not a bundle: `tauri-driver` hands it to the native
 * driver as the browser binary. A release build embeds the frontend and carries `tauri.conf.json`'s
 * CSP, which is why the E2E runs against one rather than against `pnpm tauri dev` (decision-28 §4:
 * the CSP does not apply in dev, so nothing observed there says anything about the shipped form).
 */
export async function openSession(base, { application, args = [] }) {
  const value = await call(base, "POST", "/session", {
    capabilities: {
      alwaysMatch: { "tauri:options": { application, args } },
    },
  });
  const sessionId = value?.sessionId;
  if (typeof sessionId !== "string") {
    throw new WebDriverError(`the driver returned no sessionId: ${JSON.stringify(value)}`);
  }
  return new Session(base, sessionId);
}

class Session {
  constructor(base, id) {
    this.base = base;
    this.id = id;
  }

  #path(suffix) {
    return `/session/${this.id}${suffix}`;
  }

  /**
   * Evaluate `body` as a function body in the page. `args` reach it as `arguments`. The return value
   * has to be JSON — element handles are deliberately never returned this way, so that nothing in
   * this suite can hold one across a redraw.
   */
  async executeScript(body, args = []) {
    return await call(this.base, "POST", this.#path("/execute/sync"), { script: body, args });
  }

  async findAll(selector) {
    const found = await call(this.base, "POST", this.#path("/elements"), {
      using: "css selector",
      value: selector,
    });
    return (found ?? []).map((each) => each[ELEMENT_KEY]);
  }

  async find(selector) {
    const all = await this.findAll(selector);
    if (all.length === 0) {
      throw new WebDriverError(`no element matched ${selector}`);
    }
    return all[0];
  }

  async click(elementId) {
    await call(this.base, "POST", this.#path(`/element/${elementId}/click`), {});
  }

  async clear(elementId) {
    await call(this.base, "POST", this.#path(`/element/${elementId}/clear`), {});
  }

  async sendKeys(elementId, text) {
    await call(this.base, "POST", this.#path(`/element/${elementId}/value`), { text });
  }

  async close() {
    await call(this.base, "DELETE", this.#path(""));
  }
}

/** Text content of every match, in document order. Empty when nothing matches. */
export async function textsOf(session, selector) {
  return await session.executeScript(
    "return [...document.querySelectorAll(arguments[0])].map((each) => each.textContent.trim())",
    [selector],
  );
}

/** How many elements match. Separate from `textsOf` so a presence check reads as one. */
export async function countOf(session, selector) {
  return await session.executeScript(
    "return document.querySelectorAll(arguments[0]).length",
    [selector],
  );
}

/** A DOM property of the first match, or `null` when nothing matches. */
export async function propertyOf(session, selector, property) {
  return await session.executeScript(
    "const found = document.querySelector(arguments[0]); return found === null ? null : found[arguments[1]]",
    [selector, property],
  );
}

export { WebDriverError };
