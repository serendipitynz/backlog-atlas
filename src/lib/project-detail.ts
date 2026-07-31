/**
 * プロジェクト詳細画面 (doc-10, TASK-55) のうち、1 プロジェクトそのものに関わる規則を純関数で持つ
 * モジュール。文書・マイルストーン・新規タスクの各フォームの規則は `manage.ts` が既に持っているので
 * 重複させず、ここが受け持つのは画面の骨格（区画切替・2 本の帯）と概要区画（台帳エントリ）である。
 *
 * ## Referent table (doc-10 の語 → ここの識別子)
 *
 * 命名より先に確定した表。`ledger.ts`・`manage.ts` と同じ体裁。
 *
 * | doc-10 | here | is |
 * |---|---|---|
 * | §1 区画切替 | [`DetailSection`] + [`DETAIL_SECTIONS`] | 概要・文書・マイルストーン・新規タスクの 4 項目。画面遷移ではなく同一画面内の表示切替 |
 * | §3 台帳読取専用帯 | [`LEDGER_READ_ONLY_BAND`] | 台帳ファイルが読み取り専用へ縮退している旨と、影響が概要区画に閉じること |
 * | §3 CLI 縮退帯 | [`cliDegradedBand`] | 対応 CLI を検出できない旨と、影響が文書・マイルストーン・新規タスクに閉じること |
 * | §4.1 送る属性を保存の直前に列挙する | [`SubmittedAttribute`] + [`submittedAttributes`] | 保存で `ledger_update` に載る属性を、属性名・現在値・送る値で並べたもの（送信属性一覧） |
 * | §4.1 slug は編集手段を提供しない | [`SLUG_IMMUTABLE_NOTE`] | 変更したいときに何をすることになるか、そのとき何が切れるか |
 * | §4.1 ルートを変えたときは Backlog ルートも併せて送る | [`rootMoveNote`] | 欄の直下に出す、どちらの値が送られるかの断り |
 * | §4.1 移動が成立すると編集セッションは閉じる | [`movesRoot`] | この更新が移動かどうか — 閉じる契機の判定 |
 * | §8 台帳読取専用では概要区画の入力と登録解除を無効化する | [`OVERVIEW_READ_ONLY_NOTE`] | 入力ごと止めていることを操作の近くで述べる文 |
 * | §4.2 別名が効くかの 3 態 + `NoDeclaredSet` | [`ALIAS_EFFECT_NOTES`] | 別名表 1 行の効き方。実装は 4 状態あるので 4 態で出す（下記） |
 * | §4.3 確認は slug の入力一致とする | [`unregisterBlocked`] | slug 入力一致。一致するまで実行を止め、止めている理由を返す |
 * | §8 台帳読取専用と CLI 縮退は独立 | [`overviewBlocked`] と [`cliDegradedBand`] が別々に効くこと | 片方が立っても他方の区画は動く |
 *
 * ## 別名表の態を 4 つにしている理由
 *
 * doc-10 §4.2 は 3 態（宣言あり／draft 専用／宣言なし→効果なし）を挙げるが、`interpret/status.rs` の
 * `StatusDeclaration` には 4 つ目 `NoDeclaredSet` がある。`config.yml` が statuses を 1 つも宣言して
 * いないルート（decision-4 が実測した geomyth）で、この状態では `map_status` が列対応を切らないため
 * **別名は効く**。3 態へ丸めると「宣言なし → 効果なし」が効く別名に付いてしまうので、実装の状態数に
 * 合わせて 4 態で出す。doc-10 §4.2 も同じ 4 態へ改訂してある。
 *
 * ここには書き込みが無く、出力は台帳コマンドの要求値と画面が出す文言だけである（doc-3 §2.1）。
 */

import { readinessReason } from "./edit";
import type { EntryEdit } from "./ledger";
import type { CliReadiness, ProjectEntry, UpdateRequest } from "./wire";

// --- 区画切替 (doc-10 §1/§3) -------------------------------------------------------------------

export type DetailSection = "overview" | "documents" | "milestones" | "newTask";

/** 左側に並べる 4 項目。順は doc-10 §3 の表の順で、書き込み先の遠い順ではない。 */
export const DETAIL_SECTIONS: readonly { id: DetailSection; label: string }[] = [
  { id: "overview", label: "概要" },
  { id: "documents", label: "文書" },
  { id: "milestones", label: "マイルストーン" },
  { id: "newTask", label: "新規タスク" },
] as const;

// --- 2 本の帯 (doc-10 §3/§8) -------------------------------------------------------------------

/**
 * 台帳読取専用 (doc-3 §2.2)。影響範囲を文中で名指しするのは、CLI 縮退帯と並んで立ったときに
 * 「両方だめになった」と読まれないようにするためである（doc-10 §3 の 2 本は互いに独立）。
 */
export const LEDGER_READ_ONLY_BAND =
  "台帳ファイルの schema_version がこのビルドより新しいため、読み取り専用で開いています。" +
  "概要区画の更新と登録解除はできません（doc-3 §2.2）。" +
  "文書・マイルストーン・新規タスクは台帳を書かないため、この縮退の影響を受けません。";

/**
 * CLI 縮退 (doc-5 §5)、または CLI の確認がまだ済んでいない旨。`null` は発行できる状態。
 * 台帳読取専用帯と同じく、影響が及ばない区画をその場で名指しする（doc-10 §3/§8）。
 */
export function cliDegradedBand(readiness: CliReadiness | null): string | null {
  const reason = readinessReason(readiness);
  if (reason === null) return null;
  return (
    `${reason}。文書・マイルストーン・新規タスクの発行はできません。` +
    "概要区画は Backlog CLI を使わないため、この縮退の影響を受けません。"
  );
}

// --- 概要区画: 送信属性一覧 (doc-10 §4.1) ------------------------------------------------------

/** 送信属性一覧の 1 行。`from` は台帳の現在値、`to` は保存で送る値。 */
export interface SubmittedAttribute {
  /** 台帳の属性名 (doc-3 §3)。TOML のキー名で書き、画面の見出し語に置き換えない。 */
  attribute: string;
  from: string;
  to: string;
}

/** 別名表を 1 行に読める形へ。空の表は「なし」であって空文字ではない（消えると差分が読めない）。 */
export function aliasSummary(table: Record<string, string> | undefined): string {
  const entries = Object.entries(table ?? {});
  if (entries.length === 0) return "なし";
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key} → ${value}`)
    .join(" / ");
}

/**
 * 保存で `ledger_update` に載る属性を並べる（doc-10 §4.1 送る属性を明示する）。要求値そのものから
 * 作るので、「画面が変えたつもりの属性」ではなく「実際に送られる属性」が並ぶ — `toUpdateRequest` が
 * 移動のときに両ルートを載せることも、ここに現れる。空配列は「変更なし」を意味する。
 */
export function submittedAttributes(
  entry: ProjectEntry,
  request: UpdateRequest,
): SubmittedAttribute[] {
  const attributes: SubmittedAttribute[] = [];
  if (request.project_root !== undefined) {
    attributes.push({
      attribute: "project_root",
      from: entry.project_root,
      to: request.project_root,
    });
  }
  if (request.backlog_root !== undefined) {
    attributes.push({
      attribute: "backlog_root",
      from: entry.backlog_root,
      to: request.backlog_root,
    });
  }
  if (request.redetect_git_remote === true) {
    // 送るのは「再判定せよ」という要求であって値ではない (doc-3 §4.3)。判定結果は台帳側が決めるので、
    // 送る値の欄には要求そのものを書く。
    attributes.push({
      attribute: "git_remote_present",
      from: entry.git_remote_present ? "あり" : "なし",
      to: "プロジェクトルートに対して再判定する",
    });
  }
  if (request.status_aliases !== undefined) {
    attributes.push({
      attribute: "status_aliases",
      from: aliasSummary(entry.status_aliases),
      to: aliasSummary(request.status_aliases),
    });
  }
  return attributes;
}

/**
 * この更新がプロジェクトの移動かどうか（doc-3 §4.3）。移動が成立すると、そのプロジェクトについて
 * 開いている編集セッションは閉じる（doc-10 §4.1）——「開いていたセッションが古い版を指している」
 * どころではなく、**別のルートのファイル**を指しているためである。文書の更新は文書 ID で送るので、
 * 新ルートに同じ ID の文書があれば、実行前照合は新ルートの最新読み取りに対して成立してしまい、旧
 * ルートの本文で（`--content` は全置換なので丸ごと）上書きできてしまう。
 *
 * `toUpdateRequest` は移動のとき両ルートを載せ、backlog_root だけの変更でも読み取り先は変わるので、
 * どちらか一方でも載っていれば移動として扱う。
 */
export function movesRoot(request: UpdateRequest): boolean {
  return request.project_root !== undefined || request.backlog_root !== undefined;
}

/** slug に入力欄を置かない理由と、変えたいときに何をすることになるか（doc-10 §4.1・doc-3 §3.1）。 */
export const SLUG_IMMUTABLE_NOTE =
  "slug は横断タスクID の左辺として全タスクの参照に使われるため、変更手段を提供しません（doc-3 §3.1）。" +
  "別の slug にするには登録を解除して登録し直すことになり、そのとき Git 履歴表示の同一性は切れます。";

/**
 * プロジェクトルートを変えたときに欄の直下へ出す断り（doc-10 §4.1）。既定は
 * `<新ルート>/backlog` だが、実際に送るのは欄に入っている値なので、その値を名指しする。
 * `null` は移動でないとき。
 */
export function rootMoveNote(entry: ProjectEntry, edit: EntryEdit): string | null {
  const projectRoot = edit.projectRoot.trim();
  if (projectRoot === "" || projectRoot === entry.project_root) return null;
  const backlogRoot = edit.backlogRoot.trim();
  return (
    `同一プロジェクトの移動として扱い、slug ${entry.slug} を保ったまま project_root と backlog_root の` +
    `両方を送ります（doc-3 §4.3）。backlog_root は既定の <新ルート>/backlog ではなく、いま欄にある ` +
    `${backlogRoot === "" ? "（空）" : backlogRoot} を送ります。` +
    "移動が成立すると、このプロジェクトについて開いている編集セッションは閉じます（doc-10 §4.1）。"
  );
}

// --- 概要区画: status 別名表の効き方 (doc-10 §4.2) ---------------------------------------------

/** `aliasKeyEffect` の返す 4 状態。`interpret::status` の `StatusDeclaration` と 1 対 1。 */
export type AliasEffect = "declared" | "draft" | "noDeclaredSet" | "undeclared";

export interface AliasEffectNote {
  label: string;
  note: string;
  /**
   * 別名を書いても対応づかない状態か。doc-10 §4.2 が縮退の族の色で示すよう求めるのはこの 1 態だけで、
   * 「効くが宣言で裏づけられていない」`noDeclaredSet` を巻き込まないための区別である。
   */
  ineffective: boolean;
}

export const ALIAS_EFFECT_NOTES: Record<AliasEffect, AliasEffectNote> = {
  declared: {
    label: "宣言あり",
    note: "config.yml の statuses にある status です。別名が効きます。",
    ineffective: false,
  },
  draft: {
    label: "draft 専用",
    note:
      "config.yml は宣言していませんが、既知の draft 状態として扱う値です（doc-4 §3.4）。別名が効きます。",
    ineffective: false,
  },
  noDeclaredSet: {
    label: "宣言集合なし",
    note:
      "config.yml が statuses を 1 つも宣言していないため、宣言済みかを判定できません" +
      "（decision-4 が実測した未初期化ルート）。宣言が矛盾しないので別名は効きます。",
    ineffective: false,
  },
  undeclared: {
    label: "宣言なし → 効果なし",
    note:
      "どこにも宣言が無い status です。別名を書いてもこの status のタスクは未対応区画に残ります" +
      "（decision-4）。台帳からは削除しません。",
    ineffective: true,
  },
};

// --- 概要区画: 登録解除 (doc-10 §4.3) ----------------------------------------------------------

/**
 * 台帳読取専用のとき、概要区画の**入力ごと**止めていることを操作の近くで述べる文（doc-10 §8）。
 * 画面上部の帯とは別に置く: doc-11 §5 が `disabled` を許すのは「操作の近くに常時表示する補助文」が
 * あるときで、画面の一番上の帯はその位置にない。帯と重複してよいことも同節が定めている。
 *
 * 入力まで止めるのは、押せない保存だけを残すと、書き換えられない値を編集でき、その入力が未保存入力
 * として数えられ、あとで「保存できなかった変更を破棄しますか」と尋ねる羽目になるためである。
 */
export const OVERVIEW_READ_ONLY_NOTE =
  "台帳が読み取り専用のため、この区画の入力・保存・登録解除はすべてできません（doc-3 §2.2）。" +
  "文書・マイルストーン・新規タスクは台帳を書かないので、そちらは操作できます。";

/** 登録解除が何を消し、何を消さないか（doc-3 §4.2）。削除ボタンの隣に置く断りではなく本文として出す。 */
export const UNREGISTER_SCOPE_NOTE =
  "登録解除は台帳エントリを 1 件消し、スイムレーンからこの行を外します。" +
  "対象プロジェクトの Backlog ルート・管理ファイル・Git リポジトリには触れません。" +
  "タスクの正本はそのまま残ります（doc-3 §4.2）。";

/**
 * 概要区画の更新を止めているものがあれば、その理由（doc-11 §5）。台帳読取専用だけが効き、CLI 縮退は
 * 効かない — 台帳操作は Backlog CLI を使わないためである（doc-10 §3/§8）。
 */
export function overviewBlocked(context: { readOnly: boolean; busy: boolean }): string | null {
  if (context.readOnly) {
    return "台帳が読み取り専用のため、台帳エントリの更新はできません（doc-3 §2.2）。";
  }
  return context.busy ? "台帳の更新を実行中です。完了するまで次の操作は始められません。" : null;
}

/**
 * 登録解除を止めているものがあれば、その理由（doc-10 §4.3・doc-11 §5）。障害の順に見る: 書けない台帳は
 * 何があっても止め、実行中の操作が次、最後が slug 入力一致。一致は前後空白を落として比べる（貼り付けに
 * 付いてくるだけの空白で拒み続けるのは、確認としての意味を持たないため）が、大文字小文字は落とさない
 * — slug の文字種は英小文字・数字・ハイフンだけで（doc-3 §3.1）、大小の違いは打ち間違いである。
 */
export function unregisterBlocked(
  typed: string,
  slug: string,
  context: { readOnly: boolean; busy: boolean },
): string | null {
  const blocked = overviewBlocked(context);
  if (blocked !== null) {
    return context.readOnly
      ? "台帳が読み取り専用のため、登録解除はできません（doc-3 §2.2）。"
      : blocked;
  }
  return typed.trim() === slug
    ? null
    : `確認のため、この欄に slug「${slug}」をそのまま入力してください。一致するまで実行できません。`;
}
