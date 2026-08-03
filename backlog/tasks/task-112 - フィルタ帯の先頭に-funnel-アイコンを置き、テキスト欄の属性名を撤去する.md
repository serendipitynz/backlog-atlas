---
id: TASK-112
title: フィルタ帯の先頭に funnel アイコンを置き、テキスト欄の属性名を撤去する
status: To Do
assignee: []
created_date: '2026-08-03 05:57'
labels:
  - ui
  - swimlane
  - 'kind:feature'
milestone: m-2
dependencies:
  - TASK-68
priority: medium
ordinal: 68500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
フィルタ帯の先頭にはテキスト検索欄があり、その属性名として「テキスト」が入力欄の左に出ている（TASK-68 が入力欄の上から左へ移した位置）。「テキスト」という語は何を絞り込むのかを述べておらず、画面を見た利用者に伝わらない。

帯の先頭に lucide の funnel を 1 つ置き、それを**帯全体（絞り込み）の目印**とする。「テキスト」の可視文言は撤去し、入力欄が何を受け取るかは placeholder「横断タスクID・title」が担う。文字が消えると入力欄が名前を失うので、読み上げ用に `aria-label` を置く。

**funnel を入力欄のラベルにしない**のは、漏斗が指すのは絞り込み全般であって「テキスト」ではないためである。入力欄の位置に置くと「この入力欄＝絞り込み」と読め、隣の「＋ 絞り込み」やトークン群と指示対象が重なる。帯そのものの目印にすれば図形と指示対象が一致する。ユーザーが 2026-08-03 に 3 案（帯全体の目印／テキスト欄のラベルとして funnel／テキスト欄には search を使う）から 1 案目を選択した。

**決定先行の判定が要る。** doc-7 §5.2 は「選択中の条件は絞り込みトークンとして帯に並べる」と帯の中身を定めるが、帯の**先頭に何を置くか**は定めていない。doc-11 §2.4 のアイコン規則は「アイコンのみのボタン」を対象に書かれており、**押せない目印としてのアイコン**を扱っていない（`aria-label` 必須・`aria-hidden` 常時、という 2 つの規則がボタン前提で書かれている）。どちらの doc をどう改訂するかは着手時に判定する。

**写し元**は lucide-react v1.17.0（ISC）の `dist/esm/icons/funnel.mjs`。`__iconNode` は `path` 1 本なので `IconShape` に新しいメンバーは要らず、`drawnShape` の網羅 switch は不変のままでよい（2026-08-03 に確認）。所在は `~/Projects/_ai_group/joinsure-ai-demo-insurance-advisor/node_modules/lucide-react/`。

**ついでに直す出典の不正確さ**: `src/lib/icons/lucide.ts` の冒頭は写し元を「lucide v1.17.0」と書いているが、実際に写したのは **lucide-react** v1.17.0 の同名ファイルである（`menu.mjs` の `__iconNode` がモジュール内の `ICONS.menu` と一致することを 2026-08-03 に確認した）。アイコンデータは両パッケージで同一なので図形は正しいが、出典はパッケージ名まで正確に書く（TASK-97 が ISC 告知を扱うときに読む記述でもある）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 帯の先頭に lucide funnel のアイコンが 1 つ出ており、押せる操作ではない（aria-hidden を持ち、doc-11 §2.4 の 1em・currentColor の規則に従う）
- [ ] #2 「テキスト」の可視文言が帯から消えており、テキスト入力欄が aria-label で名前を持つ（文字が無くなっても入力欄の用途が読み上げから分かる）
- [ ] #3 帯の高さが TASK-68 の 1 行（--bar-control）のままで、アイコンが他の控えと同じ上下中心に揃っている。実エンジンで測って数値を Implementation Notes に書く
- [ ] #4 src/lib/icons/lucide.ts の出典記述が、実際に写したパッケージ（lucide-react v1.17.0）を名指ししている
- [ ] #5 帯の先頭に押せない目印を置くことの根拠が doc に書かれている（doc-7 §5.2 か doc-11 §2.4。どちらへ書くかは着手時の決定先行判定で決める）
<!-- AC:END -->
