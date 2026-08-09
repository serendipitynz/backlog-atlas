/**
 * Sequencing for アプリ設定 writes (decision-13, doc-8 §2.2). `settings.toml` is one document and every
 * write sends the whole of it, while the screen has more than one writer: the 設定画面's 保存, and the
 * controls that store a choice as its 既定 the moment it is made — the 詳細配置 switch (doc-8 §2.2) and
 * the 帯's 並び順 (doc-7 §5.4) — each of them pressable while that form sits open over the same screen.
 * The count is deliberately not written down: the shape below holds for any number of them, and a
 * number here would go stale the next time one is added without anything failing.
 *
 * Writers each sending *their own* snapshot is last-write-wins on the fields none of them was
 * editing: a placement switch issued while a form save is in flight carries the pre-save values back
 * to disk, and the reverse order puts the old placement back. Merging what comes *back* cannot undo
 * that — the value is already written — so a write is expressed as a **change against whatever is
 * current**, and the changes are run one at a time, each seeing the previous one's result.
 *
 * Kept out of the component for the reason `history-read.ts` is: ordering is what has to be tested, and
 * that needs controllable promises. The shell supplies the state it lives in through
 * [`SettingsWriterPorts`].
 */

import { isDirty } from "./settings";
import type { AppSettings, LoadedSettings } from "./wire";

/** What one write does to the settings in force. Runs at issue time, not at call time. */
export type SettingsChange = (current: AppSettings) => AppSettings;

export interface SettingsWriterPorts {
  /** The settings in force right now — read after the previous write has been adopted. */
  peek: () => AppSettings | null;
  save: (settings: AppSettings) => Promise<LoadedSettings>;
  /** Take the written values as the ones now in force, so the next change starts from them. */
  adopt: (loaded: LoadedSettings) => void;
  /** Render a rejection as text — the boundary's typed failures, not an `Error`. */
  describeError: (error: unknown) => string;
}

/** Said when a write is asked for before the first read has answered; nothing is written. */
export const SETTINGS_NOT_READ = "設定をまだ読み込めていないため、保存していません";

/**
 * A writer that runs changes in the order they were issued, each against the current values. Resolves
 * with the failure's text, or `null` when the write went through — including when the change turned out
 * to be a no-op, which is a success with nothing to do rather than a refusal (the 詳細配置 switch calls
 * this on every press, including the one that only re-affirms the 既定 already stored).
 */
export function createSettingsWriter(
  ports: SettingsWriterPorts,
): (change: SettingsChange) => Promise<string | null> {
  let queue: Promise<void> = Promise.resolve();
  return function write(change: SettingsChange): Promise<string | null> {
    const issued = queue.then(async (): Promise<string | null> => {
      const current = ports.peek();
      if (current === null) return SETTINGS_NOT_READ;
      const next = change(current);
      if (!isDirty(next, current)) return null;
      try {
        ports.adopt(await ports.save(next));
        return null;
      } catch (error) {
        return ports.describeError(error);
      }
    });
    // The queue has to survive a failed write, so both outcomes map to a resolved void — otherwise one
    // rejected save would leave every later write chained behind a rejection and never issued.
    queue = issued.then(
      () => undefined,
      () => undefined,
    );
    return issued;
  };
}
