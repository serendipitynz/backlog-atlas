---
id: TASK-100
title: macOS の署名と notarization を通す
status: Done
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-13 12:17'
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
- [x] #1 ローカルで署名済み・notarize 済みの .app / .dmg が作れる
- [x] #2 CI で使うシークレットの一覧と設定手順がスクリプトまたは文書として残っている
- [x] #3 Gatekeeper を通ることが、ダウンロード経路（quarantine 属性つき）で確認されている
- [x] #4 シークレットが無い環境でもビルド自体は成功する
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**成果物は 3 本のスクリプトと、AGENTS 和英の「macOS の署名と notarization」節である。**
`scripts/macos-sign-build.sh`（署名・notarize してビルドする）、`scripts/macos-verify-gatekeeper.sh`
（できた成果物が Gatekeeper を通るかを検査する）、`scripts/setup-ci-signing-secrets.sh`（CI の
シークレット 6 件を登録する）。範は `~/Projects/_snz/mallow` の同名 2 本と、その AGENTS の
「Releasing (macOS signing)」節である。

**手順の置き場を AGENTS にしたのは、署名が所有者の実行手順だからである。** README の
「ソースからのビルド」は資格情報を 1 つも要求しない未署名の経路のままで、そこは変えていない。

**署名 ID は `Developer ID Application: Yoko Otani (9EYB4D9GGQ)`**（2026-08-13 に所有者が確定）。
この Mac にある Developer ID Application はこれ 1 つで、mallow (`net.serenebach.mallow`) も同じ
証明書で出荷している。**Gatekeeper と `codesign` が示す開発者名は "Yoko Otani" になり、LICENSE の
"Takuya Otani / SerendipityNZ Ltd." とも identifier の `com.serendipitynz.backlog-atlas` とも
名義は揃わない。**

**実測（2026-08-13）**:

- **AC #1**: `./scripts/macos-sign-build.sh` が exit 0。`.app` は
  `Authority=Developer ID Application: Yoko Otani (9EYB4D9GGQ)`・`flags=0x10000(runtime)`・
  `Identifier=com.serendipitynz.backlog-atlas` で、notarization は `Accepted`
  （id `64b9cb96-734b-4c2b-9a30-c71ae31c4973`）。`.dmg` は本スクリプトが後から notarize して
  staple した（id `15f20ea5-f7e1-4a02-b4ba-9e1ea8795b15`、`Accepted`）。
- **AC #3**: `./scripts/macos-verify-gatekeeper.sh` が exit 0。`.app` は `spctl -a -t execute` が
  `accepted / source=Notarized Developer ID`、`.dmg` は
  `spctl -a -t open --context context:primary-signature` が同じ判定を返す。**quarantine 属性を
  付けた `.dmg` の複製を mount し、中の `.app` を判定させた**ところも accepted だった。
  `xcrun stapler validate` は両方とも通るので、判定に通信は要らない。
- **AC #4**: `APPLE_*` を 1 つも持たない環境で `pnpm tauri build` が exit 0。できた `.app` は
  adhoc（`flags=0x20002(adhoc,linker-signed)`）で、`.dmg` に ticket は無い。**ビルドログには署名も
  notarization も 1 行も出ない** — 署名 ID が無いので notarization まで進まないためである。
- **@tauri-apps/cli 2.11.4 は `.dmg` を notarize しない。** 出荷される `cli.darwin-arm64.node` の
  中で、CLI が `bundle_dmg.sh` へ渡す引数列は `--volname --icon --app-drop-link --window-size
  --window-pos --background --volicon --eula …（略）… --skip-jenkins` で、同スクリプトが持つ
  `--notarize` はそこに無い。**署名ビルドのログがこれを裏づけた** — `.app` には `Notarizing …` と
  `Stapling app...` が出るが、`.dmg` には `Signing …` しか出ない（署名だけはする）。
- **`bundle.macOS.hardenedRuntime` の既定は true**（tauri-utils 2.9.3 の `config.rs`。serde の
  `default = "default_true"` と `Default` 実装の両方が true）。`tauri.conf.json` に足す設定は無い。
- **notarization の資格情報は 2 組のどちらでもよい** — `APPLE_ID` ＋ `APPLE_PASSWORD` ＋
  `APPLE_TEAM_ID` か、`APPLE_API_KEY` ＋ `APPLE_API_ISSUER` ＋ `APPLE_API_KEY_PATH`（同じ
  バイナリのエラー文字列がこの 2 組を名指ししている）。**Atlas は前者を採る** — `.p12` を書き出す
  CI 手順が既に前者を運ぶので、後者を併記すると 1 つのファイルに 2 つの資格情報の形が並び、
  どちらを使うかを決める基準がどこにも無くなる。

**検査が落ちることを先に確かめた**:

- `macos-verify-gatekeeper.sh` は、本 repo の未署名成果物に対して FAIL 4 件で exit 1、mallow の
  署名済み・notarize 済み成果物に対して exit 0 だった。
- `setup-ci-signing-secrets.sh` は `gh` のスタブと使い捨ての自己署名 `.p12` で 4 分岐を通した。
  正しいパスワードで common name（`Developer ID Application: Test Name (ABCDE12345)`）を導出して
  6 件を登録、誤ったパスワードで exit 1、`Apple Development:` の証明書で warning、`gh auth status`
  が失敗する環境では**シークレットを 1 件も書かずに** exit 1。**本物のシークレットは登録していない。**
- `macos-sign-build.sh` は `.env.signing` 不在・識別子が keychain に無い・値が空、の 3 経路で
  `pnpm tauri build` へ入る前に exit 1 することを確かめた。

**測っていないもの**:

- **Finder から初回起動して警告が出ないこと。** 目視でしか確かめられない（この環境は
  `screencapture` を持たない）。工具の判定は `accepted / source=Notarized Developer ID` まで
  取れている。
- **CI での実行。** シークレットを読むワークフローがまだ無い（TASK-101）ので、
  `setup-ci-signing-secrets.sh` を本物の `gh` に対して走らせていない。
- **Windows・Linux のバンドルは未署名のままである。** 本タスクの範囲は macOS だけで、
  他 2 つの OS で利用者が何を見るかは測っていない。
<!-- SECTION:NOTES:END -->
