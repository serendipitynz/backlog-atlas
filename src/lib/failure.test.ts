/**
 * 失敗理由符号 → 文 (decision-35 §3), which is the half of this change a recorded payload cannot
 * hold: `wire-fixture.test.ts` anchors the tokens and their value types to Rust, and this file holds
 * what the screen makes of them.
 *
 * **The rule under test is the split**, not the individual sentences. A code whose reason is what the
 * OS or the program said shows that statement; the rest take their sentence from the 文言表 and add a
 * non-empty `detail` after it. Getting that backwards is invisible to tsc and to the fixtures.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  bodyLinkRefusalText,
  launchRefusalText,
  lookupFailureText,
  probeFailureText,
  remoteReadFailureText,
} from "./failure";
import { setLanguage } from "./messages";

afterEach(() => setLanguage("ja"));

describe("OS や外部プログラムが述べた理由は、そのまま出て訳されない", () => {
  it("shows what the OS said and adds no sentence of its own", () => {
    // Atlas prefixing this would say the same thing twice: the caller's frame already names the
    // launch that failed.
    expect(launchRefusalText({ reason: "osRefused" }, "No such file or directory")).toBe(
      "No such file or directory",
    );
    expect(launchRefusalText({ reason: "exited" }, "exit status: 3")).toBe("exit status: 3");
  });

  it("keeps that statement in English display too — it is not Atlas's text", () => {
    setLanguage("en");
    expect(launchRefusalText({ reason: "osRefused" }, "許可がありません")).toBe("許可がありません");
  });

  it("falls back to the 文言表 when the program said nothing", () => {
    // A program can exit non-zero writing nothing to stderr. The branch cannot be removed, only
    // placed — and decision-35 §3 places it here rather than in the crate.
    expect(probeFailureText({ reason: "exited" }, "")).toBe("実行に失敗しました");
    expect(probeFailureText({ reason: "exited" }, "gh: not logged in")).toBe("gh: not logged in");
    expect(remoteReadFailureText({ reason: "gitFailed" }, "")).toBe("git の実行に失敗しました");
    expect(lookupFailureText({ reason: "queryFailed" }, "")).toBe("gh の実行に失敗しました");
  });

  it("does not read an empty string as a missing value elsewhere", () => {
    // `"0"` is a `detail` a falsy test would swallow, and an exit status is exactly where one
    // could appear.
    expect(probeFailureText({ reason: "exited" }, "0")).toBe("0");
  });
});

describe("それ以外の符号は 文言表 の文を出し、detail を括弧で添える", () => {
  it("adds the diagnostic text only when there is one", () => {
    expect(probeFailureText({ reason: "noResponse" }, "")).toBe("応答がありません");
    expect(probeFailureText({ reason: "noResponse" }, "killed")).toBe("応答がありません（killed）");
  });

  it("names the value the screen has to quote back", () => {
    expect(remoteReadFailureText({ reason: "remoteUrlEmpty", name: "upstream" }, "")).toContain(
      "upstream",
    );
    expect(lookupFailureText({ reason: "invalidReference", value: ".." }, "")).toContain("..");
    expect(probeFailureText({ reason: "spawnFailed", program: "/opt/gh" }, "")).toContain("/opt/gh");
  });

  it("names the bound the boundary reached rather than one held here", () => {
    // The deadline is the boundary's to choose (decision-19), so this must read the payload — a
    // number spelled on this side would go on being shown after the crate's changed.
    expect(lookupFailureText({ reason: "timedOut", afterSecs: 15 }, "")).toContain("15");
    expect(lookupFailureText({ reason: "timedOut", afterSecs: 45 }, "")).toContain("45");
  });
});

describe("ShellExecuteW の符号は数で届き、表はこちらが持つ", () => {
  it("tells the eight apart, and says the number for anything else", () => {
    const codes = [0, 26, 27, 28, 29, 30, 31, 32];
    const texts = codes.map((code) => launchRefusalText({ reason: "shellExecute", code }, ""));
    expect(new Set(texts).size).toBe(codes.length);
    // 31 is the one a user actually meets: nothing is registered for `.md`.
    expect(launchRefusalText({ reason: "shellExecute", code: 31 }, "")).toContain("SE_ERR_NOASSOC");
    expect(launchRefusalText({ reason: "shellExecute", code: 99 }, "")).toContain("99");
  });

  it("writes an HRESULT the way a Windows reader looks it up", () => {
    // The API returns it as a negative `i32`; `-2147417850` appears in no documentation.
    expect(launchRefusalText({ reason: "comInit", hresult: 0x8001_0106 | 0 }, "")).toContain(
      "0x80010106",
    );
    expect(launchRefusalText({ reason: "comInit", hresult: 0 }, "")).toContain("0x00000000");
  });
});

describe("本文リンク の符号は起動側の符号を入れ子で持つ", () => {
  it("names the program and states the launch's own reason", () => {
    const text = bodyLinkRefusalText(
      { reason: "launchFailed", program: "xdg-open", launch: { reason: "exited" } },
      "exit status: 3",
    );
    expect(text).toContain("xdg-open");
    expect(text).toContain("exit status: 3");
  });

  it("states the two refusals the boundary makes before any launch", () => {
    expect(bodyLinkRefusalText({ reason: "schemeNotAllowed" }, "")).toContain("https://");
    expect(bodyLinkRefusalText({ reason: "controlCharacter" }, "")).toContain("制御文字");
  });
});

describe("表示言語 を切り替えると、こちらが持つ文だけが入れ替わる", () => {
  it("words the same code in the other language", () => {
    const ja = probeFailureText({ reason: "noResponse" }, "");
    setLanguage("en");
    const en = probeFailureText({ reason: "noResponse" }, "");
    expect(en).not.toBe(ja);
    expect(en).toBe("No response");
  });

  it("leaves the Win32 identifiers alone in both", () => {
    // `SE_ERR_NOASSOC` is what a reader searches Microsoft's documentation with, so it is not a
    // word to translate — decision-35 §5's identifiers, inside a sentence that is translated.
    const ja = launchRefusalText({ reason: "shellExecute", code: 31 }, "");
    setLanguage("en");
    const en = launchRefusalText({ reason: "shellExecute", code: 31 }, "");
    expect(ja).not.toBe(en);
    expect(ja).toContain("SE_ERR_NOASSOC");
    expect(en).toContain("SE_ERR_NOASSOC");
  });
});
