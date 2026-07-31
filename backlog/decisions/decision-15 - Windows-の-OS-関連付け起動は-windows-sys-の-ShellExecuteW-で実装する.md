---
id: decision-15
title: Windows の OS 関連付け起動は windows-sys の ShellExecuteW で実装する
date: '2026-08-01 00:05'
status: accepted
---
## Context

doc-8 §7 は外部エディタ経路に 2 方式を置いた。起動指定（アプリ設定・`$VISUAL`・`$EDITOR`）で
開く方式と、**OS の関連付け起動**、すなわちプラットフォームが拡張子に関連付けたアプリケーション
へ管理ファイルを手渡す方式である。TASK-37 はこのうち macOS（`open`）と freedesktop
（`xdg-open --`）を実装したが、Windows 分だけを空けた。本 ADR はその Windows 分を何で実装するかを
決める。

用語は doc-8 §7 に従う。本 ADR で導入する新語は **コマンド行の再解釈** と **関連付け起動の表**
の 2 語で、初出はそれぞれ以下に置く。

**コマンド行の再解釈** とは、渡した文字列が子プロセスによってコマンド行として読み直され、
`&` `^` `%…%` が構文として働く事象を指す。`Command::args` が保証するのは argv 境界を子へ
渡すところまでで、子がコマンドインタプリタになった時点でその境界は子の内側では保たれない。

Windows で TASK-37 が採れる手段は `cmd /c start` しかなく、これはコマンド行の再解釈を起こす。
管理ファイル名はディスクから読まれる値である（走査は管理ディレクトリ下の任意の `.md` を受け、
何が書いたかを問わない）。したがって `a&calc.md` という名前のファイルを開こうとすると `calc` が
走り得る。これは AGENTS の「シェル文字列へ連結せず固定引数配列で実行する」を、最も破ってはいけない
場所で破ることになる。よって TASK-37 は Windows で方式ごと理由付きで無効化し、`$VISUAL`／`$EDITOR`
だけを残した。閉じるべき欠落として TASK-44 を起こしてある。

正しい手段は `ShellExecuteW` 相当だが、Win32 バインディングも Tauri の opener プラグインも新規
本番依存であり、AGENTS「Dependencies」の依存ゲートの対象である。判断は 2026-08-01 の TASK-44
着手時に、着手前にユーザーへ候補・選定理由・導入範囲を提示して承認を得たうえで行った。

満たすべき要件は次である。

- 関連付け先の解決を OS に委ね、コマンド行の再解釈を起こさないこと。パスは関数引数または
  argv 要素として渡り、構文として読まれる余地が無いこと（AC #1・#3）。
- 新規本番依存を最小に留めること（AGENTS「Prefer minimal dependencies」）。
- 導入範囲を局所に閉じられること。Windows 以外のプラットフォームのビルドを変えないこと。
- **このマシンでコンパイルできない部分を最小にできること。** 本プロジェクトは macOS で開発され、
  Windows ターゲットのビルドは開発機で常に行えるとは限らない。Windows 分岐が大きいほど、
  検証されないまま出荷される面積が増える。

評価軸は上記の要件と、`unsafe` を自前で持つかどうかの 2 面である。

## Decision

**`windows-sys` の `ShellExecuteW`** を Windows の関連付け起動として採用する。宣言は Windows
限定のターゲット依存に置く。

```toml
[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.61", features = [
  "Win32_Foundation",            # HWND / HINSTANCE
  "Win32_System_Com",            # CoInitializeEx
  "Win32_UI_Shell",              # ShellExecuteW
  "Win32_UI_WindowsAndMessaging" # SW_SHOWNORMAL
] }
```

呼び出しは `lpFile` にパスの NUL 終端ワイド文字列を渡し、他のポインタ引数をすべて null に置く形に
固定する。`lpFile` は関数引数であってコマンド行の一部ではないため、名前に含まれる `&` `^` `%…%` は
*ファイル名の文字* として OS へ届く。コマンド行が存在しないので、再解釈される対象が無い。

導入範囲は `editor::SystemLauncher::shell_execute` の 1 関数に閉じる。どのプラットフォームがどの
関連付け起動を使うかは **関連付け起動の表**（`editor::association_launcher_of`）が持つ。関連付け
起動の表とは、プラットフォームから関連付け起動への対応を、`cfg` ではなく引数で選べる値として持つ
関数を指す。`Platform::current()` だけがビルド自身のターゲットを読み、それ以外はすべて値を通る。
`Launcher` trait も `cfg` で分けず `spawn` と `shell_execute` の 2 メソッドを持つため、macOS 上の
単体テストが「Windows の関連付け起動は `shell_execute` へ行き、`spawn` へは決して行かない」を
偽物の launcher に対して主張できる。**Windows でしか検査できないのは `ShellExecuteW` の呼び出し
そのものだけ**になる。

`ShellExecuteW` の前に `CoInitializeEx(NULL, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE)`
を呼ぶ。`ShellExecuteW` は関連付け先の解決を COM 経由で行い、API はアパートメントが初期化済みで
あることを前提としている（STA を要求するシェル拡張があるため、モードは API のドキュメントが挙げる
この組み合わせに従う）。`commands::task_file_open` は `#[tauri::command(async)]` であり、main thread
ではなくランタイムのワーカースレッドで走るため、初期化を自前で行わなければ「COM を必要としない
ハンドラのときだけ動く」呼び出しになる。OLE1 DDE を切るのは、`ShellExecute` が応答しない相手を
待って止まり得る唯一の経路がそこだからである。

**初期化は必ず返す。** 成功した `CoInitializeEx`（新規スレッドでの `S_OK`、既に初期化済みの
スレッドでの `S_FALSE`）はスレッドごとの初期化カウントを上げ、それを下げるのは `CoUninitialize`
だけである。走るのは *共有* ワーカースレッドなので、返さなければ 1 回の起動ごとにそのスレッドの
カウントが 1 ずつ残り、アパートメントは解体されなくなる。よって `ComApartment` guard を置き、
Drop で対応する `CoUninitialize` を呼ぶ。`RPC_E_CHANGED_MODE`（そのスレッドが既に別のアパートメント
モデルで初期化されている）は失敗 HRESULT でカウントを上げないため、この guard は何も返さない —
返せば自分が作っていない初期化を下げることになる。この場合も起動は続行する。`ShellExecuteW` が
求めるのは初期化済みのアパートメントであり、それは在るからで、失敗し得るのは STA を明示的に
要求するシェル拡張だけである。開くのを拒む方が悪い答えになる。guard は `PhantomData<*const ()>`
で `Send` を落とす。下げる対象は *呼んだスレッドの* カウントなので、スレッドを跨いだ guard は
別のスレッドのカウントを下げてしまう。

失敗の判定は戻り値で行う。`ShellExecuteW` が返す `HINSTANCE` はハンドルではなく、32 を超えれば
成功、32 以下なら **その値自体が** エラーコードである（`GetLastError` ではない）。26〜32 の
`SE_ERR_*` は Win32 エラーコードではなく別系列のため、`io::Error::from_raw_os_error` に渡すと
利用者が最も出会う失敗の名前を誤る（31 は「この拡張子に関連付けられたアプリケーションが無い」
であって「デバイスが機能していない」ではない）。よって `SE_ERR_*` は自前の文面へ写し、それ以外は
OS の文面を使う。

### 採用理由

- **新規クレートが 0 本である。** `windows-sys` 0.61 は `tauri` の依存木を通じて既に
  `Cargo.lock` に在る。上の 4 feature は、既にビルド木にあるクレートのうちコンパイルされる範囲を
  広げるだけで、木にクレートを足さない。Microsoft 自身のバインディングなので新規ベンダも増えない。
- **導入範囲が 1 関数で、他プラットフォームのビルドを変えない。** ターゲット依存なので macOS・
  Linux の依存木は変わらず、`open`・`xdg-open` 経路も変わらない。
- **検証されない面積が最小になる。** 関連付け起動の表とディスパッチを値にしたことで、macOS 上の
  `cargo test` が「Windows は `ShellExecuteW` を使い `cmd` を使わない」「パスが 1 個の値として
  渡る」「起動指定方式は全プラットフォームで同じ」を主張する。他候補はこの分岐をクレートの内側に
  持つため、同じ主張が自プロジェクトのテストからは書けない。
- **COM 初期化とスレッドの扱いを自分で決められる。** `#[tauri::command(async)]` が main thread を
  使わないという本プロジェクト固有の事実に対して、採用候補のうち明示的に手当てできるのはこれだけ
  である（下表）。

代償は `unsafe` の FFI 呼び出しを自前で持つことである。`SystemLauncher::shell_execute` と
`ComApartment` の 3 呼び出しに閉じ、安全性の前提（`lpFile` が NUL 終端であること、パスの生存期間が
呼び出しを越えること、他の引数が null を受け付けること、`CoUninitialize` が成功した初期化に対して
同じスレッドで 1 回だけ呼ばれること）は `SAFETY` コメントに書いた。最後の 1 つは、guard の
`Send` を落として型で担保している。

### 却下した候補と却下理由

| 候補 | 却下理由 |
|---|---|
| `open` クレート（`shellexecute-on-windows` feature 付き） | `ShellExecuteExW` を呼ぶので要件そのものは満たすが、新規クレートを 1 本増やし、新規ベンダになる。加えて feature を落とすと `powershell.exe -Command`／`explorer.exe` 経路へ黙って化ける実装であり、要件の中心（コマンド行の再解釈を起こさない）が feature 指定の維持に依存する。ファイル経路では `CoInitialize` を呼ばない実装のため、`#[tauri::command(async)]` のワーカースレッドから呼ぶ本プロジェクトの事情に手当てできない。 |
| `tauri-plugin-opener` | 内部で上記 `open` を feature 有効で使うので要件は満たし、公式 Tauri プラグインなので新規ベンダも増えない（`tauri-plugin-dialog` と同じ扱い）。しかし新規クレートは 2 本（プラグイン本体と `open`）で、使うのは `open_path` 1 関数だけであり、残りのコマンド・スコープ・JS 側は死蔵する。`CoInitialize` の事情は `open` と同じ。ビルド木を最も増やす代わりに得られるものが、`open` を直接使う場合と変わらない。 |
| `cmd /c start` を引数の検査で安全にする（依存ゼロ） | 検査で塞ぐ対象は `cmd.exe` のコマンド行文法であり、`&` `^` `|` `%…%` `"` の相互作用と遅延展開まで正しく写す必要がある。管理ファイル名は利用者が任意に付けられる値なので、検査を通す名前と拒む名前の線を Atlas が引くことになり、doc-4 の「読めるものは読む」に反して *開けないタスク* を作る。パスを引数として渡せる API が在るのに、文法を再実装する理由が無い。 |
| Windows でも方式を無効化したままにする（現状維持） | doc-8 §7 が 2 方式を置いた理由は「環境変数がプロセスへ届かない起動経路（Finder・ランチャー）がある」ことであり、Windows のエクスプローラ起動はまさにその経路である。Windows の利用者だけが起動指定を必ず設定しなければならない状態が残る。 |

## Consequences

- 望ましい帰結
  - doc-8 §7 の 2 方式が、本プロジェクトがビルドする全プラットフォームで揃う。関連付け起動が
    無いプラットフォームは無くなったので、`EditorReadiness.association` は `Option` を落として
    `String` になり、`NO_ASSOCIATION_LAUNCHER` の無効化理由は消える（TASK-44 AC #4）。
    doc-5 §5 の「withheld な操作は理由を述べる」は、方式が withheld でなくなったことで
    この箇所には掛からなくなる。
  - 画面が `ShellExecuteW` という名前を出す。「シェル経由で開いた」と「シェル API で開いた」を
    利用者が区別できることが、この方式を出荷できる根拠そのものなので、名前は Win32 の呼び出し名の
    まま出す（`ShellExecuteW で開く` / `ShellExecuteW … <このタスクのファイル>`）。
  - 起動失敗の案内が方式ごとに分かれる。`EditorError::LaunchFailed` が `method` を運ぶように
    なったため、関連付けの失敗（`.md` に登録が無い）に対して起動指定を見に行かせることがなくなる。
- 費用・制約
  - `unsafe` の FFI が入る。`editor` はこれまで `unsafe` を持たなかった。
  - **`ShellExecuteW` の呼び出し自体は Windows でしか実行検査できない。** 表とディスパッチは
    macOS 上のテストが押さえるが、`lpFile` の符号化・戻り値の判定・COM 初期化が実際に働くかは
    Windows 上での確認に依る。TASK-44 AC #3 の実機確認がその確認である。
  - `windows-sys` の版を `tauri` の依存木と別に固定する。`tauri` が 0.62 へ上がった時点で
    ビルド木に 2 版が並び得る。同一クレートの版並列は既に `Cargo.lock` にあり（0.45・0.59・
    0.60・0.61）新しい事象ではないが、この宣言も追随の対象になる。
  - `SE_ERR_*` の文面を自前で持つ。コードと文面の対応は Win32 の仕様に依るので、
    `shell_execute_error` が唯一の写し場所である。
- 後続への影響
  - 新しいプラットフォームを扱う段になったら、`Platform` に値を足すことになり、
    `association_launcher_of` の網羅的な `match` がその関連付け起動の決定を迫る。他の
    プラットフォームの手段を黙って継ぐことはできない。
  - `Launcher` trait は `spawn` と `shell_execute` の 2 本を持つ。プロセスでない起動手段を
    さらに足すときは、この trait にメソッドを足し、`OsCall` に値を足す。`plan` と `open` が
    同じ `Planned` から読む構造は保つこと — 画面が述べる起動と実際に行う呼び出しが別の場所で
    決まると、`ShellExecuteW` と表示しながら spawn する状態を作れてしまう。
