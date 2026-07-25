/**
 * How a task card names its task (doc-7 §3, doc-3 §5.3). Split out from `swimlane.ts` because
 * both the grid and the filter need it, and a shared identity is exactly the thing that must
 * not be defined twice — the text filter matches what the card shows.
 */

import type { TaskView } from "./wire";

/**
 * 横断タスクID (doc-3 §5.1/§5.3) — always slug-prefixed, because this screen is cross-project.
 * `null` for a 解析不能 file, which has no id to build one from (doc-4 §5).
 */
export function crossTaskId(view: TaskView): string | null {
  const { project, id } = view.task;
  return id === null ? null : `${project}:${id}`;
}

/** The task file's name — the only stable handle a 解析不能 task has (doc-4 §5). */
export function sourceFileName(view: TaskView): string {
  const path = view.task.sourcePath;
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut === -1 ? path : path.slice(cut + 1);
}

/** What the card shows as its identifier, and what the text filter matches against. */
export function cardIdentity(view: TaskView): string {
  return crossTaskId(view) ?? sourceFileName(view);
}
