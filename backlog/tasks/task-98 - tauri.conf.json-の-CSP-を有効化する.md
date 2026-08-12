---
id: TASK-98
title: tauri.conf.json の CSP を有効化する
status: In Review
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-12 21:00'
labels:
  - release
  - security
  - 'kind:chore'
milestone: m-2
dependencies: []
priority: high
ordinal: 98000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
app.security.csp が null である。現在のコードから危険な HTML 挿入や外部 Web コンテンツを読み込む経路は確認されておらず単独の脆弱性とは判定されていないが、そうした機能を足す前に有効化する必要がある。公開前が最後の安価な時点なので今行う。タスク由来 URL を文字列として表示している現在の描き方を壊さない範囲で、必要最小の CSP を定める。_sandbox/repository-implementation-findings-2026-08-01.md のセキュリティ節。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 app.security.csp に明示的な値が入っている
- [ ] #2 有効化後に全画面が動作し、コンソールに CSP 違反が出ない
- [x] #3 選んだ CSP の各ディレクティブの理由が記録されている
- [x] #4 将来 iframe・Worker・外部オリジンの読み込みなどを足す場合に、CSP のどの行を緩める必要があるかが書かれている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
採った値と各行の理由は decision-28、作図結果 側の実測は doc-11 §14.5 が持つ。ここに書くのは、測った範囲と測っていない範囲である。

## 実測 (2026-08-13)

出荷形 (`_sandbox/app-check` を production ビルドし、CSP を応答ヘッダで配る) で **6 画面 × 2 エンジン × 6 ポリシー**。playwright の WebKit (≒ WKWebView・WebKitGTK) と Chromium (≒ WebView2)、窓 1280×800。手順は `_sandbox/csp-check/measure-csp.mjs`、値は `csp.json`、まとめは `summary.md`。

- **先に TASK-142 の記録を再現した** — `style-src 'self'` で違反 WebKit 111 件・Chromium 192 件、作図結果 の `fill` が `rgb(236,236,255)` → `rgb(0,0,0)`。ハーネスの設定が正しいことを確かめてから測っている。
- **採った値では 6 画面とも両エンジンで違反 0 件**。スイムレーン・タスク詳細 (作図あり／なし)・編集セッション・プロジェクト詳細・設定モーダル。`document.styleSheets.length` は地の 1 本に対し、作図で 4、Ace で 5 (止まれば 1 に落ちるので、「対象が無かった」と「止まった」を分けられる)。
- **編集部品 の Ace も `'unsafe-inline'` を要求した** — 違反 4 件、`.ace_editor` が `relative` から `static` へ落ち、行高が 16px から WebKit 17px・Chromium 18px へずれる。これで decision-25 が残した 2 択の片方 (作図結果 の色を捨てる) が消えた。
- **`setAttribute("style", …)` は止まり、`style.cssText` と `style.setProperty` は止まらない** (`probe-attr.mjs`、両エンジン)。画面の `--prose-max-width` が `'unsafe-inline'` 無しでも効き続けるのはこのためで、Svelte が属性ではなく CSSOM 経由で入れている。
- **`style-src-attr 'none'` は使えない** (PR #106 の 1R [P2] を測って却下。`probe-attr-none.mjs`)。両エンジンとも directive は効くが、**mermaid が SVG へ書き出す `style` 属性まで止まる** — 作図 1 つで違反 105 (WK) / 183 (Cr)、25 要素の宣言 53 個が 0 個しか適用されず、ラベルが `table-cell`→`block`・`nowrap`→`normal`、図が 204×278 → 464×632 になる。decision-28 §5。

## 測っていないもの

- **IPC の `connect-src`**。ハーネスの偽 IPC は同じ束の中の関数なので `fetch` を通らない。根拠は tauri 2.11.5 の実装 (`scripts/ipc-protocol.js` の `fetch(convertFileSrc(cmd, 'ipc'))`、`scripts/core.js` の宛先の組み立て) と `tauri-utils-2.9.3/src/config.rs:2741` の設定例。**間違っていても画面は動く** (`window.ipc.postMessage` へ自動で落ちる) ので、気づく手は `csp.rs` の試験とビルドしたアプリの console しかない。
- **作図の種類**。測ったのは flowchart 1 種だけで、sequence・gantt・architecture 等は測っていない。
- **実機の webview**。playwright のエンジンは同系であって同一ではない。
- **`pnpm tauri dev` に CSP は当たらない** (`build.devUrl` があると文書は Vite が配り、`manager/mod.rs` の `get_asset`／`csp()` を通らない)。dev で違反が出ないことは何の根拠にもならないので、目視の依頼もビルド後のアプリに対して行う。

## AC #4 の文言を直した

起票時の AC #4 は「将来 Ace や外部コンテンツを足す場合に何を緩める必要があるか」と書いていたが、**Ace は decision-8 で既に入っており** (`public/vendor/ace/`)、しかも本タスクの実測でその Ace が `'unsafe-inline'` を要求する側だと分かった。前提が古いまま満たしたことにすると AC が何を求めていたのか後から読めなくなるので、「将来 iframe・Worker・外部オリジンの読み込みなどを足す場合に、CSP のどの行を緩める必要があるか」へ直した。答えは decision-28 §3 の表である。

## 試験

`src-tauri/src/csp.rs` は **方針の全体**を検査する — 9 本の directive の集合、各 directive の source、意図的に書かない 2 本 (`img-src`・`font-src`) の不在、そして空 source が生まれていないこと。解析は Tauri 自身の `Csp` に通す (実際にヘッダへ載るのは framework がこの文字列から作ったものなので)。

**初版は「消えても画面が何も言わない 3 つだけ」を検査していた。これは誤りで、PR #106 の 1R [P2] で指摘された** — directive を消す操作は常に緩める方向で、緩みは何も表に出ない。`object-src` を消せば `default-src` へ落ち、`default-src` を消せば fetch 系が無制限になるが、画面はどちらでも同じに見える。`base-uri` と `form-action` には落ち先すら無い。**除外してよい行は 1 本も無かった。**

**変異 14 種を当てて 14 件とも落ちることを確かめた** (`_sandbox/csp-check/mutate.py`): `null` へ戻す、9 本それぞれを落とす、`object-src` を `'self'` へ緩める、`img-src` を足す、空白を 2 つにする。**この検査を bash の `${var/pat/}` で書いてはいけない** — パターン内の `'` が引用符として除去され、`; base-uri 'none'` が一致せず、**変異していない設定でテストを回して「通った」と記録する** (1R の対応中に実際にそうなった)。
<!-- SECTION:NOTES:END -->
