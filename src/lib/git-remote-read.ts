/**
 * Sequencing for the 概要区画's remote 現在値 (doc-10 §4.1). The value is asked of the boundary, so
 * two reads can be in flight at once — the screen starts one when the entry changes, and 再検出する
 * starts another after its write lands. Whichever finishes last would otherwise be what the line
 * shows, and that is not the same as whichever was asked last.
 *
 * What the line promises is narrow: it is what Git says about this entry's project root *now*. A
 * read that was superseded describes a moment the screen has left — and after a 再検出 the stale
 * answer is precisely the one the user pressed the control to get rid of, so it would look like the
 * re-detection did nothing.
 *
 * Comparing the answer against the entry the screen currently holds is not enough, which is why a
 * token decides. Two reads of the *same* slug and root both pass such a comparison, and that is the
 * ordinary case here rather than an exotic one: the effect's read and the post-再検出 read are both
 * about the entry on screen. A root comparison also cannot tell A → B → A apart from A → A.
 *
 * Kept out of the component for the reason `slug-preview.ts` and `history-read.ts` are: the ordering
 * can only be pinned by resolving two calls in a chosen order, and AGENTS' テスト節 holds component
 * tests to 画面横断契約 rather than per-screen coverage.
 */

import type { GitRemoteRead } from "./wire";

export interface GitRemoteReadPorts {
  /** `gitRemoteRead` — never rejects; a failed read is a `GitRemoteRead` state (decision-6). */
  read: (slug: string) => Promise<GitRemoteRead>;
  /** Put a value on the line. `null` is 未取得 — not 不在, which is a state of its own. */
  show: (read: GitRemoteRead | null) => void;
}

export interface GitRemoteReader {
  /** Ask about one entry. Supersedes whatever is in flight, and shows 未取得 while it runs. */
  load: (slug: string) => Promise<void>;
}

/**
 * A reader that stamps every call and shows only the newest call's answer.
 *
 * A rejection leaves the line at 未取得 rather than turning into 読取不能. The ports' `read` is
 * documented not to reject — the shell turns a boundary failure into `unreadable` with the
 * boundary's own words — so a rejection reaching here is something else again, and inventing a
 * remote state from it would put a claim about the root on screen that nothing observed.
 */
export function createGitRemoteReader(ports: GitRemoteReadPorts): GitRemoteReader {
  let calls = 0;

  return {
    async load(slug: string): Promise<void> {
      ports.show(null);
      const token = ++calls;
      let read: GitRemoteRead;
      try {
        read = await ports.read(slug);
      } catch {
        return;
      }
      if (token !== calls) return;
      ports.show(read);
    },
  };
}
