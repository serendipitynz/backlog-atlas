---
id: TASK-100
title: macOS の署名と notarization を通す
status: To Do
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-01 00:38'
labels:
  - release
  - 'kind:chore'
milestone: m-2
dependencies: []
priority: high
ordinal: 100000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
macOS アプリとして配布するために Developer ID Application 証明書での署名と notarization を通す。~/Projects/_snz/mallow の scripts/setup-ci-signing-secrets.sh と .github/workflows/release.yml で同じことを済ませているので、その構成を範にする。APPLE_* シークレットが設定されているときだけ署名・notarize し、無いときは未署名でビルドが通る形にする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ローカルで署名済み・notarize 済みの .app / .dmg が作れる
- [ ] #2 CI で使うシークレットの一覧と設定手順がスクリプトまたは文書として残っている
- [ ] #3 Gatekeeper を通ることが、ダウンロード経路（quarantine 属性つき）で確認されている
- [ ] #4 シークレットが無い環境でもビルド自体は成功する
<!-- AC:END -->
