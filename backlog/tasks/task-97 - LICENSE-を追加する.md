---
id: TASK-97
title: LICENSE を追加する
status: In Review
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-13 03:53'
labels:
  - release
  - docs
  - 'kind:writing'
milestone: m-2
dependencies: []
priority: high
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
リポジトリに LICENSE が無い。ライセンス表記の無い公開リポジトリは再利用条件が不明なままになるので、公開前に置く。ライセンスを選び、README（和英）にも表記し、src/lib/icons/ へ取り込む lucide の SVG など第三者素材の帰属も必要なら記載する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 LICENSE がリポジトリルートにある
- [x] #2 README.md と README.ja.md にライセンス表記がある
- [x] #3 第三者素材（lucide アイコンなど）の帰属が必要かどうか判断され、必要なら記載されている
<!-- AC:END -->
