import { describe, expect, it } from "vitest";
import { loaded, taskView, unreadable } from "./fixtures";
import { setLanguage } from "./messages";
import { taskLinkStep, type TaskLinkStep } from "./task-link";
import type { ProjectLoad, TaskLinkResolution } from "./wire";

setLanguage("ja");

const URL = "backlog-atlas://task?root=%2Fwork%2Fatlas&id=TASK-2";

function resolved(taskId: string, slug = "atlas"): TaskLinkResolution {
  return { state: "resolved", url: URL, slug, taskId };
}

function over(...loads: ProjectLoad[]): (slug: string) => ProjectLoad | undefined {
  return (slug) =>
    loads.find((load) => (load.state === "loaded" ? load.project.slug : load.slug) === slug);
}

function reasonOf(step: TaskLinkStep): string {
  if (step.state !== "refused") {
    throw new Error(`expected a refusal, got ${JSON.stringify(step)}`);
  }
  return step.reason();
}

const FIRST = taskView({ id: "TASK-1" });
const SECOND = taskView({ id: "TASK-2" });

describe("タスクリンクから開くタスク (doc-3 §8)", () => {
  it("登録済みプロジェクトの読取結果から、その id のタスクを開く", () => {
    expect(taskLinkStep(resolved("TASK-2"), over(loaded("atlas", [FIRST, SECOND])))).toEqual({
      state: "open",
      ref: { slug: "atlas", sourcePath: SECOND.task.sourcePath },
    });
  });

  it("id は大文字小文字を区別せずに照合する", () => {
    const step = taskLinkStep(resolved("task-2"), over(loaded("atlas", [FIRST, SECOND])));
    expect(step.state === "open" && step.ref.sourcePath).toBe(SECOND.task.sourcePath);
  });

  it("同じ id が 2 件あれば、読み取り順で先のほうを開く", () => {
    const later = taskView({ id: "TASK-2", sourcePath: "backlog/tasks/task-2 - later.md" });
    const step = taskLinkStep(resolved("TASK-2"), over(loaded("atlas", [SECOND, later])));
    expect(step.state === "open" && step.ref.sourcePath).toBe(SECOND.task.sourcePath);
  });

  it("4 つの開けない理由は、それぞれ利用者がリンクと照らせる値を名指す", () => {
    expect(reasonOf(taskLinkStep({ state: "malformed", url: URL }, over()))).toContain(URL);
    expect(
      reasonOf(taskLinkStep({ state: "unregistered", url: URL, root: "/elsewhere" }, over())),
    ).toContain("/elsewhere");

    const unread = reasonOf(taskLinkStep(resolved("TASK-2"), over(unreadable("atlas"))));
    expect(unread).toContain("atlas");
    expect(unread).toContain("TASK-2");
    // Registered by hand after the read: the screen has no read for it at all.
    expect(reasonOf(taskLinkStep(resolved("TASK-2"), over()))).toBe(unread);

    const missing = reasonOf(taskLinkStep(resolved("TASK-9"), over(loaded("atlas", [FIRST]))));
    expect(missing).toContain("atlas");
    expect(missing).toContain("TASK-9");
    expect(missing).not.toBe(unread);
  });

  it("解析不能のファイル（id が無い）は、どの id とも一致しない", () => {
    const broken = taskView({ id: null, sourcePath: "backlog/tasks/broken.md" });
    expect(taskLinkStep(resolved("TASK-1"), over(loaded("atlas", [broken]))).state).toBe(
      "refused",
    );
  });
});
