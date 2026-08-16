---
id: decision-28
title: 画面が動く最小の CSP を有効化し、緩める source は実測が決めた 1 つに限る
date: '2026-08-12 20:21'
status: accepted
---
## Context

`src-tauri/tauri.conf.json` の `app.security.csp` が `null` のままである。起票の根拠は
`_sandbox/repository-implementation-findings-2026-08-01.md` のセキュリティ節で、そこは
「危険な HTML 挿入や外部 Web コンテンツを読み込む経路は確認していないので**単独の脆弱性とは判定
しない**が、そうした機能を足す前に有効化する必要がある」と述べている。**したがって本決定が閉じるのは
いま開いている穴ではなく、後から開く道である。**公開前が最後の安価な時点なのは、UI が固まった後なら
違反の原因が改修に混ざらないからである（TASK-98 の対応順の理由）。

**decision-25 は「後続への影響」で本タスクを名指しし、選択を 1 つ委譲していた** —
「`style-src` に `'unsafe-inline'` を入れる」か「作図結果 の色を捨てる」か。あちらは 整形表示 の PR で
測ったので、視野にあったのは mermaid だけだった。

2026-08-13 に出荷形（production ビルド・CSP は応答ヘッダ）で **6 画面 × 2 エンジン × 5 ポリシー**を
測り直した。playwright の WebKit（≒ WKWebView・WebKitGTK）と Chromium（≒ WebView2）、窓 1280×800。
まず doc-11 §14.5 の記録（`style-src 'self'` で違反 WebKit 111 件・Chromium 192 件、作図結果 の `fill` が
`rgb(236,236,255)` → `rgb(0,0,0)`）を同じ値で再現し、ハーネスの設定が正しいことを確かめてから測った。

**委譲された選択は成り立たない。編集部品 も同じ source を要求する。** `public/vendor/ace/ace.js` は
`importCssString` で `<style>` を作り（識別子の出現 7 のうち 1 つは定義で、呼び出しは 6 か所）、nonce を
受け取る経路を持たない（`ace.js` に `nonce` は 0 件）。`style-src 'self'` で測ると違反が両エンジンとも
4 件、`.ace_editor` が `relative` から `static` へ落ち、行高が 16px から WebKit 17px・Chromium 18px へ
ずれる。編集セッションを開くと `document.styleSheets.length` は 1 から 5 になり、止めると 1 のまま
である（**増えるのは 4 枚**）。**作図結果 の色を捨てても `'unsafe-inline'`
は 編集部品 のためになお要る**ので、decision-25 が並べた 2 つ目は選択肢ではない。**Ace は「将来足すもの」
ではなく decision-8 で既に入っている** — TASK-98 の AC #4 もその前提のまま書かれていた（AC を直し、
理由は Implementation Notes にある）。

**`'unsafe-inline'` が通す経路は 2 つあり、Atlas 自身はどちらも使っていない。** 同じ実測で、
`setAttribute("style", …)` は `style-src 'self'` の下で両エンジンとも止まり、
`style.cssText = …` と `style.setProperty(…)` は止まらなかった（CSSOM への書き込みは CSP の検査対象で
ないため）。画面の `style="--prose-max-width: …"`（doc-8 §2.1 の 48rem を運ぶ経路）が
`'unsafe-inline'` 無しでも効き続けるのはこのためで、**Svelte が属性ではなく CSSOM 経由で入れている**。
つまりこの 1 語は Atlas 自身のためではなく、mermaid と Ace の `<style>` 要素のために入る。

語と指示対象は `_sandbox/handoff/referent-table/referent-table-task-98.md` 第 1 版で先に固定した。
以下で使う **緩める source**（`default-src` の落ち先より広い側へ倒す source）・**経路の source**
（Tauri の IPC が通る宛先として framework 側の実装が要求する source）・**絞る宣言**（Atlas が持たない
能力を落ち先より狭く閉じる directive）・**書かない宣言**（書いても落ち先と同値になるため置かない
directive）・**黙って戻せる行**（消しても例外も空白も出ないため、消えたことが画面から分からない部分）は
その表の語である。

## Decision

### 1. 値

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src blob:; connect-src ipc: http://ipc.localhost; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'
```

**初版は 9 行で、`img-src` は 書かない宣言 の側にあった。2026-08-17 に 10 行へ改めた**（TASK-186。
doc-8 §9.5 が 添付画像 を描くと決めたため）。**この 9 行で、6 画面とも両エンジンで違反 0 件である。**
外部 CSS・インライン style 属性・作図結果 の色・
編集部品 の昇格はすべて健全なまま（`document.styleSheets.length` は地の 1 本に対し、作図で +3、Ace で +4）。

### 2. 行は 5 種別で、種別ごとに動かす主体が違う

- **緩める source は `style-src` の `'unsafe-inline'` 1 つだけ。**根拠は上の実測で、動かすのも実測である
  （mermaid と Ace の両方が `<style>` を使わなくなったと測れた回にだけ消せる）。**片方を測っただけで
  消さない** — decision-25 がそうしていた。

  **本決定の題の「1 つ」はこの行を指す。** 2026-08-17 以降、`default-src` の落ち先より広い側へ倒す
  source は**構造としては 2 つある** — 下の 機能の source がもう 1 つで、`blob:` は `'self'` ではない。
  **分けているのは動かす主体で、題が数えているのは実測が置いた source のほうである。** 数え直す回は
  「緩みが 2 つある」と「実測由来の緩みが 1 つある」を混ぜない — 前者は現在 2、後者は現在 1 である。
- **経路の source は `connect-src` の `ipc:` と `http://ipc.localhost` の 2 つ。**根拠は framework 側の
  実装で、Atlas の実測ではない（ハーネスの偽 IPC は同じ束の中の関数なので `fetch` を通らない）。
  `tauri/scripts/ipc-protocol.js` が `fetch(convertFileSrc(cmd, 'ipc'))` を呼び、`scripts/core.js` が
  macOS・Linux で `ipc://localhost/<cmd>`、Windows で `http://ipc.localhost/<cmd>` を組む。
  `tauri-utils-2.9.3/src/config.rs:2741` が同じ 2 つを設定例に載せている。
- **絞る宣言は 5 つ**（`object-src`・`frame-src`・`worker-src`・`base-uri`・`form-action` の `'none'`）。
  Atlas は plugin も iframe も worker も `<base>` も送信する form も 1 つも持たない。動かすのは
  **機能追加**であって実測ではない。**`base-uri` と `form-action` は `default-src` へ落ちない**ので、
  書かなければ無制限のまま残る — Atlas には `{@html}` が 1 か所ある（decision-25）ので、この 2 行は
  他の 3 行と違って落ち先の穴を塞いでいる。
- **機能の source は `img-src` の `blob:` 1 つ**（2026-08-17 に新設。TASK-186）。**Atlas 自身がその
  scheme の値を作るために要る source**で、動かす主体は実測でも framework でも 能力の不在 でもなく、
  **その機能そのもの**である — 添付画像 を描くのをやめた回に消え、それまでは何を測っても消せない。
  **`'self'` は書いていない** — Atlas は自前の画像を 1 枚も持たず（`<img>` 0 件、`url(` は vendored な
  `ace.js` の外に 0 件、favicon 無し）、要る source は自分が作るものだけである。**`data:` も書いていない** —
  本文が `![](data:image/png;base64,…)` と書いたものまで通ることになり、描く対象は 添付画像 だけだと
  決めた doc-8 §9.5 と食い違う。**この 1 行は `ace.js` の見え方を動かさない** — あの CSS は
  `url("data:image/png…")` の背景を持つが、`img-src` 不在のいまも `default-src 'self'` が拒んでおり、
  `blob:` だけを書いた状態でも拒み続ける。
- **書かない宣言は `font-src` 1 つ。**`'self'` と書いても `default-src 'self'` の落ち先と同値で、
  実効が 1 つも変わらない。**網羅して見せるために書かない** — 変わらない行が混ざると、変わる行との
  区別が読めなくなる。`app.scss` に `@font-face` は 1 つも無い。**`img-src` は 2026-08-17 まで
  こちら側にあった。**

### 3. 緩めるときは、この表の行を書き換える

| 足す機能 | 書き換える行 | 備考 |
|---|---|---|
| 外部の画像・フォント・スタイルを読む | `img-src` に origin を足し、`font-src` を**新設**し、`style-src` に origin を足す | `img-src` は 2026-08-17 に `blob:` で在る行になった（TASK-186）。**遠隔の画像はこの行を動かさずに済ませてある** — doc-8 §9.5 が描かずに 既定ブラウザ起動 へ渡すと決めたので、origin を足す必要が出るのはその決定を覆す回である |
| Atlas 自身が作った値を描く（`blob:`・`data:`） | その値を使う directive に scheme を足し、**機能の source として記録する** | 2026-08-17 の `img-src blob:` がこの型の 1 件目。実測では消せない行なので、種別を分けてある |
| iframe を使う（mermaid の `securityLevel: 'sandbox'` を含む） | `frame-src` | decision-25 は `'strict'` を採っており、`'sandbox'` はテーマ追随を失うので現状は選ばない |
| Web Worker を使う（Ace の構文 worker を有効にする場合を含む） | `worker-src`。blob から起こすなら `blob:` | `Editor.svelte` はいま `setUseWorker(false)` を渡している |
| WebAssembly を読む | `script-src` に `'wasm-unsafe-eval'` | 現在どの依存も要求していない（実測で違反 0 件） |
| IPC 以外の通信をする | `connect-src` | いま `'self'` すら入っていない — 経路の source の 2 つだけである |

**緩めた回は、出荷形で測り直す。** `pnpm tauri dev` では CSP は当たらない（`build.devUrl` があると文書は
Vite が配り、`manager/mod.rs` の `get_asset`／`csp()` を通らない）ので、dev で動いたことは根拠にならない。
手順は `_sandbox/csp-check/measure-csp.mjs` にある。

### 4. 全体を試験に置く。黙って戻せない行は 1 つだけである

**2026-08-17 まで、この方針に「消えれば画面が自分で言う」行は 1 つも無かった**（TASK-186 が例外を
足した。下記）。行を消す操作は常に**緩める**方向であり、
緩みは何も表に出ない — `object-src 'none'` を落とせば `default-src` へ落ち、`default-src` を落とせば
fetch 系が何も制限されなくなるが、**画面はどちらでも同じに見える**。`base-uri` と `form-action` に
至っては落ち先すら無く、書かなければ無制限のまま残る。見えるのは緩和を**外した**ときだけで、それも
間接的である（作図結果 が色を失い、編集部品 が配置を失い、IPC は `postMessage` へ落ちて動き続ける）。

**`img-src blob:` だけは違う。**この行を消すと `default-src 'self'` へ落ちて `blob:` が拒まれ、
**すべての 添付画像 が 状態の印 のまま残る**（doc-8 §9.5）。読み手は console を開かずにそれを見る。
**この 1 行は消すことが緩みではなく締めになる唯一の行でもある** — 他の 9 行と向きが逆なので、
「行を消す操作は常に緩める方向」は本節の他の行についての主張として読む。**それでも部分集合の話には
ならない** — 残る 9 行は依然として黙って戻せるので、**設定の形そのものが契約である**という結論は動かない。

**これは読みではなく実測である**（2026-08-17、`_sandbox/csp-check/measure-img-src.mjs`。出荷形＝応答
ヘッダ、WebKit と Chromium）。出荷値では `load` が上がって `naturalWidth` が 1、違反 0 件。
`img-src` を落とすと `error` が上がって `naturalWidth` は 0、違反 1 件。**`img-src 'self'` へ替えても
同じく `error` で違反 1 件**（行は在るのに 1 枚も描けない — §3 の表の 2 行目が「落とす」だけでなく
「替える」も数える理由がこれである）。**両エンジンで同値。**
**`error` が上がることまで測っているのは、`markdown-image.ts` がその事象で 状態の印 を戻すからである** —
上がらなければ、画面には描かれない `<img>` だけが残って、印は戻らない。

**したがって残りより優先して検査すべき部分集合は無く、設定の形そのものが契約である。**
`src-tauri/src/csp.rs` は 10 本の directive とその source を全部持ち、`font-src` が
**入っていない**ことも検査する。**これは設定の写しだが、写しであることが役目である** — 契約を変える
操作を必ず試験の変更として通し、その変更が本決定の改訂を促す。行ごとに「何が動かすか」（実測／経路／
不在／機能）と「失うと何が壊れるか」を持たせてあるので、落ちた試験が指すのは本決定のどの節かまで出る。
解析には Tauri 自身の `Csp` を通す — 実際にヘッダへ載るのは framework がこの文字列から作ったもので、
別に書いたパーサは設定と一致したまま framework とだけ食い違いうる。

**17 種類の変異を当てて全部落ちることを確かめた**（`_sandbox/csp-check/mutate.py`。**2026-08-17 に
再測。初版は 14 種類だった**）: `null` へ戻す、10 本それぞれを落とす、`object-src` を `'self'` へ緩める、
`img-src` を `'self'` へ替える、`img-src` に `data:` を足す、`font-src` を足す、空白を 2 つにする。
**「`img-src` を足す」という変異は消えた** — あれは 書かない宣言 を検査するものだったので、
`img-src` が在る行になった時点で意味を失う。代わりに入ったのが上の 3 つで、**在る行に対しては
「落とす」だけでなく「別の source へ替える」も要る**（`'self'` へ替えると 添付画像 が 1 枚も描けなくなる
のに、行そのものは在り続ける）。

### 5. `style-src-attr` では閉じられない（実測で却下）

**`'unsafe-inline'` が要るのは `<style>` 要素の側だけなので、属性の側は `style-src-attr 'none'` で
閉じられるはず** — PR #106 のレビューがそう指摘し、Atlas 自身が属性を使っていない以上、筋は通っている
（本決定の Context もそう述べている）。**測ると成り立たなかった。**

`style-src-attr 'none'` は両エンジンとも現に効く（`setAttribute("style", …)` が止まる）。ところが
**mermaid が SVG へ書き出す `style` 属性まで一緒に止まる** — 出力は `innerHTML` で入るので属性は
パーサを通り、この directive の対象になる。作図 1 つで違反が WebKit 105 件・Chromium 183 件、
`style` 属性を持つ 25 要素の**宣言 53 個が 0 個しか適用されず**、ラベルが `display: table-cell` から
`block` へ、`white-space: nowrap` から `normal` へ落ちて、**図が 204×278 から 464×632 へ膨らむ**
（両エンジン同値）。色は `<style>` 側が持っているので残るが、配置は壊れる。

**したがって属性の側を閉じる道は、作図結果 を捨てる道と同じである。**閉じられるようになるのは、
作図の実装が SVG を属性なしで書くようになった回だけで、そのときは本節ごと測り直す。

## Consequences

- 望ましい帰結
  - **外部オリジンを読む機能は、書き足す前に必ずこの 1 行を通る。**起票が求めていたのはこれで、
    「そうした機能を足す前に有効化する」がここで満たされる。**2026-08-17 の 添付画像 がその 1 件目に
    なった**（TASK-186）— そして通した結果、**外部オリジンは 1 つも足さずに済んだ**。doc-8 §9.5 が
    遠隔の画像を描かずに 既定ブラウザ起動 へ渡すと決めたためで、**この行が実際に効いたのは
    「緩めさせなかった」形である。**
  - **AC #4 の答えが値そのものになる。**絞る宣言 の 5 行が、将来どの能力を足すときに何を緩めるかを
    directive 名で述べている。散文の一覧と違い、緩め忘れれば動かないので古くならない。
  - **`img-src blob:` は、Atlas が自分で作った値だけを描かせる。**本文が書いた `data:` の画像も、
    遠隔の画像も、CSP の側で落ちる — **画面の分類と CSP が同じことを別の機構で言っている**ので、
    doc-8 §9.5 の分岐に穴が空いても外部へ通信は出ない。
- 費用・制約
  - **`'unsafe-inline'` は `style-src` 全体に効く。**この 1 語は mermaid と Ace のために入るが、
    Atlas 自身のコードが `setAttribute("style", …)` や実行時の `<style>` を使ってよいことにもなる。
    **実測時点で Atlas はどちらも使っていない**（`'unsafe-inline'` 無しでも全画面 0 件だった）ので、
    この語が守っているのは vendored な 2 つだけである。
  - **経路の source は Atlas が測っていない。**間違っていても画面は動く（`postMessage` へ落ちる）ので、
    気づく機構は `csp.rs` の試験と、ビルドしたアプリの console しかない。
  - **測った作図は flowchart 1 種だけである。**sequence・gantt・architecture などが別の source を
    要求しないことは確かめていない。作図の種類が増えて描かれない報告が出たら、まずここを疑う。
  - `pnpm tauri dev` に CSP は当たらないので、**開発中に違反が出ないことは何の保証にもならない。**
- 後続への影響
  - **TASK-102（パブリック化と v0.1.0 公開）**は、CSP が入った状態のビルドを公開する。本決定は
    公開前に済ませる項目として起票されたものなので、ここで閉じる。
  - **TASK-105（GUI E2E。m-3）**は、通す経路に 整形表示 と 編集セッション を含む。**E2E を出荷形で
    走らせるなら CSP ごと通る**ので、上の実測が E2E に吸収できるかをそこで判断してよい。
    **添付画像 を 1 枚通す経路も入れられる** — `img-src blob:` は出荷形でしか効かないので、
    §4 の「消えれば画面が自分で言う」唯一の行を実際に見られるのは、この経路か実機の目視だけである。
  - **decision-25 の「TASK-98 の選択は 2 つ」は本決定が閉じる。**反転ではなく、片方が成り立たないと
    実測で分かったことによる確定である。doc-11 §14.5 の同じ記述も本 PR で直した。
