---
id: TASK-82
title: メニューをタイトルバーへ統合できるか判断する
status: In Review
assignee: []
created_date: '2026-07-31 23:32'
updated_date: '2026-08-14 13:54'
labels:
  - ui
  - swimlane
  - 'kind:research'
milestone: m-3
dependencies: []
priority: low
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
スイムレーンのメニューをアプリのタイトルバーへ統合できないか調べる。Tauri で行うには decorations:false にして自前のタイトルバーを描くことになり、macOS・Windows・Linux の 3 環境ぶんのウィンドウ操作（ドラッグ移動・最大化・閉じる・信号機ボタンの位置）を自前で持つ必要がある。TASK-66 で「プロジェクト別スイムレーン」見出し横に件数を出す代替を満たしているため公開阻害ではない。調査の結果として実装しない判断も成果とする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 3 環境それぞれの実装コストと副作用（OS 標準のウィンドウ操作が失われる範囲）が書かれている
- [x] #2 統合する／しないの判断と理由が記録されている
- [x] #3 統合する場合の実装タスクが起票されている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 判断 (AC #2)

**帯への統合を採る。手段は OS ごとに分け、自前装飾はどこでも採らない。** 正本は decision-31 で、
判断の全文と改訂される契約の一覧はそちらが持つ。要点は 3 つ。

- 固定ヘッダの行を無くし、画面名は廃止・総件数はタイトルバー・☰ はその画面の最上段の帯の右端へ。
- macOS は重ね型（`titleBarStyle: "Overlay"`）、Windows・Linux は窓の題を書き替える。
- 自前装飾（`decorations: false`）は採らない。**失う窓操作が 3 OS とも 0 になるのはこの選択の帰結である。**

置き場はユーザーが 2026-08-15 に確定した（モックは `_sandbox/assets/TASK-82.png`）。**☰ を帯に置かず
フィルタ帯へ降ろすという指定が判断の形を変えた** — 帯に押せるものが無くなると、Windows・Linux で
自前装飾を採らずに済む経路（窓の題）が成立する。語は
`_sandbox/handoff/referent-table/referent-table-task-82.md` 初版で本文より先に固定した。

## 3 環境の実装費用と副作用 (AC #1)

実測基準版は macOS 26.5.2 (Build 25F84)・backingScaleFactor 1.0、tauri 2.11.5・tauri-utils 2.9.3・
tauri-runtime-wry 2.11.4・tao 0.35.3・wry 0.55.1。**Windows・Linux は実機で測っていない** —
下表のその 2 列はソースから読み取った事実である。

| | macOS（重ね型） | Windows（自前装飾を採った場合） | Linux（同） |
|---|---|---|---|
| 失う窓操作 | 0 | 最小化・最大化・閉じるの控え、Win11 の配置候補（`HTMAXBUTTON` を返す手段が Tauri に無い）、窓の題の文字 | WM の枠とその右クリック窓メニュー、変形中のカーソル（縁のホバー時のカーソルは tao が出すので失わない。tao の FIXME は `begin_resize_drag` の後だけを指す）、影と角丸（`shadow` は Linux 未対応） |
| 残る窓操作 | 信号機・縁つかみ変形・拡大・全画面すべて OS のまま | 縁つかみ変形（tao が `WM_NCHITTEST` を自前判定。非最大化・非全画面時）、ドラッグ中の Aero Snap、ダブルクリック最大化、`shadow: true` の 1px 枠と Win11 角丸 | 縁つかみ変形（`hit_test` ＋ `begin_resize_drag`、X11・Wayland 両方）、縁のホバー時のカーソル、移動、ダブルクリック最大化 |
| 書くもの | `data-tauri-drag-region` ＋ 権限 1 つ、信号機帯 78 px の左空け | 上に加えて窓操作の控え 3 つ ＋ 権限 4 つ | 同左 |
| 契約の衝突 | 無い（信号機は OS が描くのでアプリの控えではない） | 固定ヘッダが OS の窓操作を持ち、doc-7 §2.1 の「常設する操作はメニューだけ」「粒度の違う操作を混ぜない」と衝突 | 同左 |

**採った形では自前装飾を使わないので、失う窓操作は 3 OS とも 0 である。** 上表の Windows・Linux 列は
「採らなかった手段の費用」であって、この実装が払うものではない。

### 測った数

- **取り戻す高さ 32.0 pt** — `NSWindow.frameRect(forContentRect:styleMask:)` に 1200×800 と
  `[.titled, .closable, .miniaturizable, .resizable]` を渡すと frame が 1200×832 を返す。
  **固定ヘッダの 46.83 px とは足せない** — 帯そのものがその 32.0 pt のところへ載る。
- **信号機帯は右端 69 pt・窓上端から 9〜23 pt** — `standardWindowButton` の 3 つが 14×14 pt で
  x=9・32・55。
- **固定ヘッダ 46.83 px / フィルタ帯 36.16 px / グリッド開始 y=82.98 px** — WebKit・1200×800・
  地 110%、`_sandbox/app-check/` に本物の `App.svelte` を載せて測った。高さを決めているのは
  ☰ の 28.02 px と上下 8.8 px である。**この寸法のまま 36.16 px の帯へは入らないので、移設先では
  ☰ が `--bar-control` を取る**（decision-31）。
- **帯の左を 78 px 空けても 1200 px 幅で溢れない**（`scrollWidth` = `clientWidth` = 1200）。
  画面名・総件数・☰ を並べたままの値なので、☰ を降ろした後はこれより余裕がある。
- **重ね型は設定値 1 つの差** — tauri は macOS の窓を既に `fullSizeContentView` で作っており
  （`TitleBarStyle::Visible` でも通す。devtools の回避策）、`Overlay` が変えるのは
  `titlebarAppearsTransparent` だけ。Swift で同じ窓を組むと、frame と内容が同じ 1200×800 で
  `contentLayoutRect` だけが 1200×768 を返す。
- **要る権限 2 つはどちらも `core:default` に無い** — 既定集合は `allow-title`（取得）と
  `allow-internal-toggle-maximize` までで、`allow-start-dragging` と `allow-set-title` は含まれない。

### 未測定のまま残るもの

**測ったのは寸法だけで、窓操作はどれも動かしていない。** 残るのは 5 つ — Windows・Linux の実機確認、
macOS の帯をつかむ移動とダブルクリック拡大、全画面の出入りで信号機帯の inset が保たれること、
**macOS の全画面中の帯の見え方**（信号機が隠れる間、左に空けた 78 px が何も避けていない状態になる）、
macOS の窓の題が中央寄せになること。**「不可能」ではなく測っていないだけである。** 全部 TASK-176 の
受入条件が引き取る。

## 起票 (AC #3)

- **TASK-176** 固定ヘッダを廃し、総件数をタイトルバーへ・メニューを各画面の最上段の帯へ移す（m-3。
  ユーザーが 2026-08-15 に次リリース基準の例外として m-3 を指定 — 厳密には基準は m-4 だが、変える
  画面文を TASK-103 の抽出より前に済ませるため）。
- **TASK-175** フィルタ帯の 直前の 1 つを戻す と 既定に戻す をアイコンのみのボタンにする（m-3。
  同日にユーザーが依頼した別件で、TASK-176 より前に置く）。

**TASK-149（窓の大きさ）の手段選定はこの判断に制約されない** — 自前装飾を採らないので、窓装飾は
3 OS とも OS のままである。対応順が #10 をこの行の後ろに置いていた理由はこれで解消した。

## PR #120 のレビューで動いたもの

**1 巡目で [P1] 1 件・[P2] 4 件・[P3] 4 件、すべて妥当だったので反論せず直した。** 記録に残す価値が
あるのは次の 3 つである。

- **改訂される契約の列挙が足りていなかった**（[P1]）。初版は 5 つと数えたが、grep で数え直すと
  doc-3 §4・doc-7 §2.3 の図・§5.2 の総計の置き場・doc-10 §2 と末尾の参照・doc-11 §4 の ⑥ が
  現在形で固定ヘッダを述べていた。**列挙を伸ばすだけでは同じ誤りを繰り返すので、TASK-176 の受入条件は
  列挙ではなく grep で数え直せる条件で書いた。**
- **Linux が「変形カーソルの表示」を失うという初版の記述は、根拠にした FIXME が支えていなかった**
  （[P2]）。tao は装飾なしの窓でも `motion-notify` で縁のカーソルを出しており、FIXME が言っているのは
  `begin_resize_drag` を呼んだ後のカーソルだけである。**失うのは変形中のカーソルに限る。**
- **☰ を 1 プロジェクトの帯へ置くこと自体が、自前装飾を退ける理由に使った粒度の規則に触れていた**
  （[P2]）。**逸脱として理由付きで記録する形に改めた**（decision-31 の Consequences、doc-10 §2 が
  記録先）。
<!-- SECTION:NOTES:END -->
