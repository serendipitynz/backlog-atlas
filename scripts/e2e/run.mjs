// 代表的な利用者操作をアプリ全体で通す GUI E2E (TASK-105).
//
// One route, driven through the shipped binary: 登録 → スイムレーン表示 → タスク詳細 → 編集保存 →
// 再読込. What it holds that no other test in this tree can is the whole stack at once — the real
// WebView, the real Rust commands, the real Backlog CLI, and the real アプリ設定ディレクトリ. The
// component tests stop at Svelte's `mount`, and `cargo test` stops below the IPC boundary.
//
// **再読込 here is a restart, not the in-app 再読み込み.** The claim worth making is that the edit and
// the ledger entry survive the process, which is the one an in-app re-read cannot make.
//
// Run it with `pnpm run e2e`, after `pnpm run build && cargo build --release`. It needs
// `tauri-driver` on PATH and a Backlog CLI on PATH, and it does not run on macOS — see
// `environment.mjs`.

import {
  FIXTURE_TASKS,
  atlasBinary,
  buildFixture,
  fixtureCarriesTitle,
  removeFixture,
  setConfigAside,
  startDriver,
} from "./environment.mjs";
import { countOf, openSession, propertyOf, textsOf } from "./webdriver.mjs";

const PORT = 4444;
const NATIVE_PORT = 4445;
const EDITED_TITLE = "E2E が書き換えた題";

const EMPTY_LEDGER_ENTRY = "main.screen p.status button.link";
const REGISTER_DIALOG = '[role="dialog"]';
const REGISTER_FIELDS = '[role="dialog"] label .field input[type="text"]';
const REGISTER_SUBMIT = '[role="dialog"] .issue .row button.primary';
const LANE_HEAD = ".lane-head";
const CARD = "button.card";
const DETAIL = "aside.detail";
const DETAIL_TITLE = "aside.detail .title-line h2";
const DETAIL_EDIT = "aside.detail .title-line .entry button.primary";
const DETAIL_TITLE_FIELD = 'aside.detail .title-line label.field input[type="text"]';
const DETAIL_SAVE = "aside.detail .issue .issue-actions button.primary";
const DETAIL_BODY_EMPHASIS = "aside.detail .body-block strong";

function step(message) {
  console.log(`→ ${message}`);
}

/**
 * Poll `predicate` until it is true. Every wait in this file goes through it rather than through the
 * driver's implicit timeout: the implicit one covers "an element appeared" and nothing else, while
 * the states this route turns on are also "the modal closed", "the session ended", "the text
 * changed". `description` is what the failure says, so it names the state, not the selector.
 */
async function waitUntil(description, predicate, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) {
        return;
      }
      last = null;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const tail = last === null ? "" : ` (last error: ${last.message})`;
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${description}${tail}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/** Index of the first card whose text carries `title`, or -1. */
async function cardIndexFor(session, title) {
  const texts = await textsOf(session, CARD);
  return texts.findIndex((text) => text.includes(title));
}

async function registerFixture(session, fixture) {
  step("登録: the empty ledger names the way in");
  await waitUntil("the empty-ledger prompt", async () => (await countOf(session, EMPTY_LEDGER_ENTRY)) === 1);
  await session.click(await session.find(EMPTY_LEDGER_ENTRY));

  await waitUntil("the 登録 form", async () => (await countOf(session, REGISTER_FIELDS)) >= 3);
  const fields = await session.findAll(REGISTER_FIELDS);
  await session.sendKeys(fields[0], fixture.projectRoot);
  await session.sendKeys(fields[2], fixture.slug);

  // The submit control is withheld until the form has something to issue (doc-11 §11), so pressing it
  // before that would issue nothing and this would fail further down with a less useful sentence.
  await waitUntil(
    "登録 to stop being withheld",
    async () => (await propertyOf(session, REGISTER_SUBMIT, "ariaDisabled")) !== "true",
  );
  await session.click(await session.find(REGISTER_SUBMIT));

  await waitUntil("the 登録 form to close", async () => (await countOf(session, REGISTER_DIALOG)) === 0);
}

async function expectSwimlane(session, expectedTitles) {
  step("スイムレーン表示: the registered root draws its row and its cards");
  await waitUntil("the project's row", async () => (await countOf(session, LANE_HEAD)) >= 1);
  await waitUntil(
    `cards for ${expectedTitles.join(" / ")}`,
    async () => {
      const texts = await textsOf(session, CARD);
      return expectedTitles.every((title) => texts.some((text) => text.includes(title)));
    },
  );
}

async function openDetail(session, title) {
  step(`タスク詳細: opening ${title}`);
  const index = await cardIndexFor(session, title);
  assert(index >= 0, `no card carried ${title}`);
  const cards = await session.findAll(CARD);
  await session.click(cards[index]);

  await waitUntil("the detail panel", async () => (await countOf(session, DETAIL)) === 1);
  const heading = await textsOf(session, DETAIL_TITLE);
  assert(heading[0] === title, `the panel's heading was ${JSON.stringify(heading[0])}, not ${title}`);

  // 整形表示 (decision-25) on the shipped form: the fixture's `**強調**` has to have become an element,
  // not the four asterisks. Nothing below the IPC boundary can state this — the renderer is in the
  // WebView — and the CSP that governs it is only in force outside `pnpm tauri dev` (decision-28).
  await waitUntil(
    "the body's Markdown to have been rendered",
    async () => (await countOf(session, DETAIL_BODY_EMPHASIS)) >= 1,
  );
}

async function editAndSave(session, fixture) {
  step("編集保存: 編集 → rewrite the title → 保存");
  await session.click(await session.find(DETAIL_EDIT));
  await waitUntil("the title field", async () => (await countOf(session, DETAIL_TITLE_FIELD)) === 1);

  const field = await session.find(DETAIL_TITLE_FIELD);
  await session.clear(field);
  await session.sendKeys(field, EDITED_TITLE);

  await waitUntil(
    "保存 to stop being withheld",
    async () => (await propertyOf(session, DETAIL_SAVE, "ariaDisabled")) !== "true",
  );
  await session.click(await session.find(DETAIL_SAVE));

  // A save that lands ends the 編集セッション (doc-8 §6.3), which puts the heading back — so the
  // heading carrying the new title is the screen saying the write went through, not this test
  // assuming it did.
  await waitUntil("the 編集セッション to end with the new title", async () => {
    const heading = await textsOf(session, DETAIL_TITLE);
    return heading.length === 1 && heading[0] === EDITED_TITLE;
  });

  // And the same fact read from outside Atlas: the managed file itself, through the CLI. The screen
  // and the file are two different claims, and only the second one says the update adapter ran.
  assert(
    fixtureCarriesTitle(fixture, EDITED_TITLE),
    `the fixture's tasks do not carry ${EDITED_TITLE}; the screen ended the session but nothing reached the Backlog CLI`,
  );
}

async function expectSurvivesRestart(driver, binary, fixture) {
  step("再読込: the app is restarted and asked for the same things again");
  const session = await openSession(driver.base, { application: binary });
  try {
    await waitUntil("the restored row", async () => (await countOf(session, LANE_HEAD)) >= 1);
    assert(
      (await countOf(session, EMPTY_LEDGER_ENTRY)) === 0,
      "the ledger came up empty, so the 登録 did not survive the restart",
    );
    await waitUntil("a card carrying the edited title", async () => {
      const texts = await textsOf(session, CARD);
      return texts.some((text) => text.includes(EDITED_TITLE));
    });
    assert(
      fixtureCarriesTitle(fixture, EDITED_TITLE),
      `${EDITED_TITLE} is no longer in the fixture after the restart`,
    );
  } finally {
    await session.close();
  }
}

async function main() {
  const binary = atlasBinary();
  const fixture = buildFixture();
  const restoreConfig = setConfigAside();
  let driver = null;
  try {
    driver = await startDriver({ port: PORT, nativePort: NATIVE_PORT });
    const session = await openSession(driver.base, { application: binary });
    try {
      await registerFixture(session, fixture);
      await expectSwimlane(
        session,
        FIXTURE_TASKS.map((task) => task.title),
      );
      await openDetail(session, FIXTURE_TASKS[0].title);
      await editAndSave(session, fixture);
    } finally {
      await session.close();
    }
    await expectSurvivesRestart(driver, binary, fixture);
  } finally {
    if (driver !== null) {
      driver.stop();
    }
    restoreConfig();
    removeFixture(fixture);
  }
  console.log("✓ 登録 → スイムレーン → タスク詳細 → 編集保存 → 再読込 passed");
}

await main();
