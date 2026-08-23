// フロントエンド側の 規模計測 (TASK-94, decision-42).
//
// Times the exact chain `App.svelte` re-runs when a snapshot arrives — `buildSwimlane`, the flatMap
// that collects every task, `collectFacets`, `swimlaneTotals` — over payloads of a chosen size.
// Nothing is asserted; the output is numbers.
//
// The real modules are loaded through Vite's `ssrLoadModule` rather than by Node directly: this
// tree's TypeScript uses extensionless imports (`moduleResolution: "bundler"`), which Node's
// resolver rejects even with its type stripping. `configFile: false` keeps the app's `vite.config.ts`
// out of it — that config is tuned for `tauri dev` (fixed port, Rust watch exclusions) and none of
// its settings reach a module graph with no `.svelte` in it.

import { createServer } from "vite";

/**
 * Ledger sizes × tasks per root. The second axis is the one App.svelte's chain is linear in.
 *
 * **The 200-task rows mirror `scale.rs`'s `ROOT_COUNTS` × `TASKS_PER_ROOT` exactly**, so that a read
 * time and a recompute time can be compared as a pair. Without that, the only way to put the two
 * halves side by side is across different workloads, and a ratio taken from such a pair says nothing
 * — which is a claim decision-42 made once before this list covered 3 and 20 roots. Change one sweep
 * and change the other.
 */
const SCALES = [
  { roots: 1, perRoot: 200 },
  { roots: 3, perRoot: 200 },
  { roots: 5, perRoot: 200 },
  { roots: 10, perRoot: 200 },
  { roots: 20, perRoot: 200 },
  { roots: 1, perRoot: 1_000 },
  { roots: 1, perRoot: 4_000 },
  { roots: 10, perRoot: 1_000 },
  { roots: 20, perRoot: 1_000 },
];

/**
 * The median of this many timed passes is reported, not the minimum. Unlike the read side, where
 * every source of noise adds time to a fixed amount of work, this chain allocates: the first passes
 * pay for a cold heap and JIT, and the minimum would report a state the app's first draw is never in.
 */
const RUNS = 7;

/**
 * The body every synthetic task carries, at the size the Rust half writes into its own files. It is
 * what makes the two halves' payload sizes comparable: `Task.description` is the bulk of a snapshot,
 * and a fixture that left it `null` would report a parse of a payload five times smaller than the
 * one the read side just measured itself producing.
 */
const BODY_BYTES = 2_000;
const BODY = "本文の 1 行。filler for the synthetic snapshot, wide enough to carry multibyte text.\n";

const COLUMNS = ["todo", "inProgress", "inReview", "done"];
const STATUSES = ["To Do", "In Progress", "In Review", "Done"];
const PRIORITIES = ["high", "medium", "low", null];

async function loadModules() {
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: "warn",
    server: { middlewareMode: true },
  });
  const [swimlane, filter, fixtures] = await Promise.all([
    server.ssrLoadModule("/src/lib/swimlane.ts"),
    server.ssrLoadModule("/src/lib/filter.ts"),
    server.ssrLoadModule("/src/lib/fixtures.ts"),
  ]);
  return { server, swimlane, filter, fixtures };
}

/**
 * One project's tasks, varied across every attribute the chain actually branches on: the column
 * placement, the sort keys (priority, ordinal, updated date) and the facet values (labels, types,
 * assignees). A thousand identical cards would measure a Map with one key in it.
 */
function tasksFor(fixtures, slug, count) {
  const description = BODY.repeat(Math.floor(BODY_BYTES / BODY.length) + 1);
  const views = [];
  for (let i = 1; i <= count; i++) {
    views.push(
      fixtures.taskView({
        id: `TASK-${i}`,
        project: slug,
        title: `計測用タスク ${i}`,
        column: COLUMNS[i % 4],
        status: STATUSES[i % 4],
        priority: PRIORITIES[i % 4],
        ordinal: i * 1_000,
        labels: [`label-${i % 7}`, "performance"],
        types: [fixtures.type(`kind-${i % 5}`)],
        assignee: [`user-${i % 3}`],
        updatedDate: `2026-08-${String((i % 28) + 1).padStart(2, "0")} 00:00`,
        description,
        acceptanceCriteria: [
          { number: 1, checked: false, text: "first" },
          { number: 2, checked: true, text: "second" },
        ],
      }),
    );
  }
  return views;
}

const NEVER_INCONSISTENT = () => false;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function timed(runs, body) {
  const times = [];
  for (let run = 0; run < runs; run++) {
    const started = performance.now();
    body();
    times.push(performance.now() - started);
  }
  return median(times);
}

function measure({ swimlane, filter, fixtures }, { roots, perRoot }) {
  const order = [];
  const loads = new Map();
  for (let r = 0; r < roots; r++) {
    const slug = `p${r}`;
    order.push(slug);
    loads.set(slug, fixtures.loaded(slug, tasksFor(fixtures, slug, perRoot)));
  }
  const input = {
    order,
    loads,
    hidden: new Set(),
    filter: filter.DEFAULT_FILTER,
    cardOrder: "priority_desc",
    inconsistent: NEVER_INCONSISTENT,
  };

  const recompute = timed(RUNS, () => {
    const rows = swimlane.buildSwimlane(input);
    const views = [...loads.values()].flatMap((load) =>
      load.state === "loaded" ? load.project.tasks : [],
    );
    filter.collectFacets(views, NEVER_INCONSISTENT);
    swimlane.swimlaneTotals(rows, order.length);
  });

  // The parse the WebView pays before any of the above can run. It is a floor on what the boundary
  // costs, not a measurement of the boundary: the IPC transfer itself is not measured anywhere here.
  const payload = JSON.stringify([...loads.values()].map((load) => load.project));
  const parse = timed(RUNS, () => JSON.parse(payload));

  return { total: roots * perRoot, recompute, parse, payloadKb: Math.round(payload.length / 1024) };
}

export async function measureFrontend() {
  const { server, ...modules } = await loadModules();
  try {
    console.log("--- フロントエンド再計算時間 (Node/V8。WebKit では測っていない) ---");
    for (const scale of SCALES) {
      const { total, recompute, parse, payloadKb } = measure(modules, scale);
      console.log(
        `roots=${String(scale.roots).padEnd(3)} perRoot=${String(scale.perRoot).padEnd(5)}` +
          ` tasks=${String(total).padEnd(6)} recompute=${recompute.toFixed(2).padStart(7)}ms` +
          ` jsonParse=${parse.toFixed(2).padStart(7)}ms payload=${String(payloadKb).padStart(6)}KB`,
      );
    }
  } finally {
    await server.close();
  }
}
