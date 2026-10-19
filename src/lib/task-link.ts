/**
 * タスクリンク (doc-3 §8), the screen's half: from what the Rust side resolved to the one task to open,
 * or the sentence saying why there is none.
 */

import { msg } from "./messages";
import type { TaskRef } from "./workspace-controller";
import type { ProjectLoad, TaskLinkResolution } from "./wire";

export type TaskLinkStep =
  | { state: "open"; ref: TaskRef }
  | { state: "refused"; reason: () => string };

/**
 * `loadOf` is the read the grid draws. The id is matched without regard to case, as doc-3 §5.2 matches
 * a task prefix; two files with the same id open the first in read order, which is what pressing either
 * card does (doc-4 §7).
 */
export function taskLinkStep(
  resolution: TaskLinkResolution,
  loadOf: (slug: string) => ProjectLoad | undefined,
): TaskLinkStep {
  switch (resolution.state) {
    case "malformed":
      return { state: "refused", reason: () => msg().shell.taskLinkMalformed(resolution.url) };
    case "unregistered":
      return { state: "refused", reason: () => msg().shell.taskLinkUnregistered(resolution.root) };
    case "resolved": {
      const { slug, taskId } = resolution;
      const load = loadOf(slug);
      if (load?.state !== "loaded") {
        return { state: "refused", reason: () => msg().shell.taskLinkUnread(slug, taskId) };
      }
      const wanted = taskId.toUpperCase();
      const view = load.project.tasks.find((candidate) => candidate.task.id?.toUpperCase() === wanted);
      if (view === undefined) {
        return { state: "refused", reason: () => msg().shell.taskLinkNotFound(slug, taskId) };
      }
      return { state: "open", ref: { slug, sourcePath: view.task.sourcePath } };
    }
  }
}
