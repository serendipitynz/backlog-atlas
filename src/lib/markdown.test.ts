import { describe, expect, it } from "vitest";
// `?raw` rather than a filesystem read: this project has no `@types/node`, and the string is what
// the assertion is about either way.
import bodyComponent from "../components/Body.svelte?raw";
import { FIGURE_DRAWN_CLASS } from "./markdown-figure";
import { msg } from "./messages";
import {
  BODY_FIGURE_CLASS,
  BODY_IMAGE_CLASS,
  BODY_IMAGE_MARK_CLASS,
  BODY_IMAGE_REFERENCE_ATTRIBUTE,
  BODY_LINK_CLASS,
  BODY_LINK_URL_ATTRIBUTE,
  BODY_TASK_CLASS,
  BODY_TASK_MARK_CLASS,
  bodyImagePlan,
  bodyLinkTarget,
  bodyView,
} from "./markdown";

/** The HTML for a 本文, or a failure if 整形 did not happen — every test here expects the former. */
function html(source: string): string {
  const view = bodyView(source);
  if (view.kind !== "formatted") {
    throw new Error("整形表示 になっていない");
  }
  return view.html;
}

describe("整形表示 の記法 (doc-8 §9.2)", () => {
  it("draws the notations the 台帳 actually uses", () => {
    // The measured set (decision-25): emphasis, inline code, headings, GFM tables, task lists, fences,
    // links. Asserted together because what matters is that one pass covers them, not each in isolation.
    const out = html(
      [
        "# 見出し",
        "",
        "**強い**と `コード`。",
        "",
        "| a | b |",
        "|---|---|",
        "| 1 | 2 |",
        "",
        "> 引用",
        "",
        "```rust",
        "let x = 1;",
        "```",
      ].join("\n"),
    );
    expect(out).toContain("<h1>見出し</h1>");
    expect(out).toContain("<strong>強い</strong>");
    expect(out).toContain("<code>コード</code>");
    expect(out).toContain("<table>");
    expect(out).toContain("<blockquote>");
    expect(out).toContain('<code class="language-rust">');
  });

  it("escapes raw HTML instead of letting it become part of the screen", () => {
    // 実測 2026-08-11: every raw tag in the 台帳's 184 files sits in prose *about* that tag. Escaping is
    // what keeps `<details>` a word; interpreting it would make a disclosure widget out of a sentence.
    const out = html("段落の中の <details> と <span>、それに <script>alert(1)</script>。");
    expect(out).toContain("&lt;details&gt;");
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("<details>");
    expect(out).not.toContain("<script>");
  });

  it("never renders an image itself — every 本文画像 leaves this module as its 状態の印", () => {
    // The `<img>` is `markdown-image.ts`'s, put in only once bytes have arrived (doc-8 §9.2). What
    // comes out of here is the failure state, which is what a reader sees when they do not.
    const out = html("![a](/assets/x.png) ![b](https://e.test/y.png) ![c](./z.png) ![](/assets/w.png)");
    expect(out).not.toContain("<img");
  });
});

describe("本文画像 (doc-8 §9.2)", () => {
  it("sorts a src into 添付画像 / 遠隔 / neither", () => {
    expect(bodyImagePlan("/assets/TASK-82.png")).toEqual({
      kind: "attachment",
      reference: "/assets/TASK-82.png",
    });
    expect(bodyImagePlan("/assets/shots/a.png")).toEqual({
      kind: "attachment",
      reference: "/assets/shots/a.png",
    });
    expect(bodyImagePlan("https://example.test/a.png")).toEqual({
      kind: "remote",
      url: "https://example.test/a.png",
    });
    expect(bodyImagePlan("http://example.test/a.png")).toEqual({
      kind: "remote",
      url: "http://example.test/a.png",
    });
    // Backlog CLI resolves none of these either — its browser mode answers 404 to anything without
    // the `/assets/` prefix — so Atlas drawing one would show what the other tool does not.
    for (const neither of [
      "./relative.png",
      "assets/no-leading-slash.png",
      "../assets/up.png",
      "data:image/png;base64,AAAA",
      "file:///etc/passwd",
      "",
    ]) {
      expect(bodyImagePlan(neither)).toEqual({ kind: "neither" });
    }
  });

  it("carries a 添付画像's reference unchanged, for the boundary to resolve", () => {
    const out = html("![図の説明](/assets/TASK-82.png)");
    expect(out).toContain(`${BODY_IMAGE_REFERENCE_ATTRIBUTE}="/assets/TASK-82.png"`);
    expect(out).toContain(BODY_IMAGE_CLASS);
    expect(out).toContain("図の説明");
  });

  it("marks an alt-less 本文画像 too — AC #4, and both images in this 台帳 are alt-less", () => {
    const out = html("![](/assets/TASK-82.png)");
    // The 状態の印 is the whole of what says a picture was named here. doc-8 §9.2 used to put the alt
    // on screen and nothing else, which for this exact 本文 put nothing on screen at all.
    expect(out).toContain(BODY_IMAGE_CLASS);
    expect(out).toContain("<svg");
    expect(out).toContain(`${BODY_IMAGE_REFERENCE_ATTRIBUTE}="/assets/TASK-82.png"`);
  });

  it("gives the 状態の印 a name a screen reader reaches — doc-11 §2.4", () => {
    const out = html("![](/assets/TASK-82.png)");
    // `iconMarkup` marks the figure `aria-hidden`, so without a role of its own the wrapper has no
    // content left and a label on it is not announced (doc-11 §2.4 says so in as many words, and
    // §14.4's タスクリスト の印 already takes this shape). With an alt-less image — which is every
    // image in this 台帳 — the alternative is silence, the state AC #4 exists to end.
    expect(out).toContain(`class="${BODY_IMAGE_MARK_CLASS}" role="img" aria-label=`);
    expect(out).toContain(msg().state.imageNotDrawn);
  });

  it("keeps the alt readable beside that name rather than replacing it", () => {
    const out = html("![図の説明](/assets/TASK-82.png)");
    // The label is on the inner element: `aria-label` on the outer span would replace its contents,
    // so the 本文's own alt would stop being announced.
    expect(out).toContain("図の説明</span>");
    expect(out).toContain('role="img"');
  });

  it("draws a 遠隔 image as a pressable 本文リンク and never fetches it", () => {
    const out = html("![](https://example.test/a.png)");
    // The owner's decision (2026-08-17): not drawn, but openable — so the 台帳 still reaches no
    // network on its own, and the reader can see the picture on a press they made.
    expect(out).toContain(`${BODY_LINK_URL_ATTRIBUTE}="https://example.test/a.png"`);
    expect(out).toContain('role="link"');
    expect(out).toContain('tabindex="0"');
    expect(out).not.toContain(`${BODY_IMAGE_REFERENCE_ATTRIBUTE}=`);
    // With no alt there would otherwise be nothing to press, so the URL is the label.
    expect(out).toContain("https://example.test/a.png");
  });

  it("gives neither a reference nor a link to a src it will not resolve", () => {
    const out = html("![説明](./relative.png)");
    expect(out).toContain(BODY_IMAGE_CLASS);
    expect(out).toContain("説明");
    expect(out).not.toContain(`${BODY_IMAGE_REFERENCE_ATTRIBUTE}=`);
    expect(out).not.toContain(BODY_LINK_URL_ATTRIBUTE);
  });

  it("undoes markdown-it's percent-encoding, the way Backlog CLI does", () => {
    // markdown-it normalises what it parsed, so the reference arrives here escaped while the file on
    // disk carries the characters. The CLI decodes at the same point; without this, every 添付画像
    // whose name is not plain ASCII would be reported absent.
    // `<…>` is CommonMark's form for a src with a space in it; a bare space is not an image at all.
    const out = html("![](</assets/図 1.png>)");
    expect(out).toContain(`${BODY_IMAGE_REFERENCE_ATTRIBUTE}="/assets/図 1.png"`);
    expect(bodyImagePlan("/assets/%E5%9B%B3.png")).toEqual({
      kind: "attachment",
      reference: "/assets/図.png",
    });
    // Decoded *before* the checks, so an escaped traversal is a traversal by the time it is judged.
    expect(bodyImagePlan("/assets/%2e%2e/config.yml")).toEqual({
      kind: "attachment",
      reference: "/assets/../config.yml",
    });
    // A malformed escape names no file, so it is not a 添付画像 at all.
    expect(bodyImagePlan("/assets/%zz.png")).toEqual({ kind: "neither" });
  });

  it("leaves no attribute a reference or a URL could close", () => {
    const out = html('![](/assets/"onerror=x".png) ![](https://e.test/"onerror=x".png)');
    expect(out).not.toContain('onerror=x".png"');
    // markdown-it escapes the quote to `%22` on its own; what this holds is that neither value
    // reaches the output as a bare `"`, whichever of the two mechanisms got there first.
    expect(out).not.toMatch(/data-body-(image|link)="[^"]*"[^ >]/);
  });
});

describe("本文リンク (doc-8 §9.3)", () => {
  it("opens http and https, case-insensitively, and nothing else", () => {
    for (const openable of ["http://example.com", "https://example.com/a?b=c", "HTTPS://example.com"]) {
      expect(bodyLinkTarget(openable)).toBe(openable);
    }
    for (const inert of [
      "file:///etc/passwd",
      "mailto:someone@example.com",
      "javascript:alert(1)",
      "./relative.md",
      "#heading",
      "example.com",
      "https://",
      "httpx://example.com",
    ]) {
      expect(bodyLinkTarget(inert)).toBeNull();
    }
  });

  it("hands the URL over byte for byte", () => {
    // The boundary is given this value (decision-25), so a normalised copy would make what the screen
    // shows and what the OS receives two different strings.
    const raw = "https://example.com/a%20b?q=1&r=2#frag";
    expect(bodyLinkTarget(raw)).toBe(raw);
  });

  it("draws an openable link with no href, and the URL in an attribute the engine ignores", () => {
    const out = html("[原文](https://example.com/spec) を見る");
    expect(out).toContain(`class="${BODY_LINK_CLASS}"`);
    expect(out).toContain(`${BODY_LINK_URL_ATTRIBUTE}="https://example.com/spec"`);
    expect(out).toContain("原文");
    // **No href.** It is what makes the engine treat this as a link, and then every way the engine has of
    // following one takes the window with it — 目視 2026-08-11 found the context menu's「リンクを開く」
    // leaving Atlas with no back control to return by (doc-8 §9.3).
    expect(out).not.toContain("href=");
    // Announced and reachable all the same: the engine gives a non-anchor neither, so both are asked for.
    expect(out).toContain('role="link"');
    expect(out).toContain('tabindex="0"');
    // The URL a reader can no longer copy from the engine's own menu.
    expect(out).toContain('title="https://example.com/spec"');
  });

  it("puts no href anywhere in a 本文, whatever it contains", () => {
    // The rule, not the one case: a single `href` anywhere in the output is a link the engine will
    // follow, and the whole point of dropping them is that no path through the engine can navigate.
    const out = html(
      [
        "[書いたリンク](https://example.com/a) と 裸の https://example.com/b、",
        "それに [開かない相手](./local.md) と ![画像](./x.png)。",
        "",
        "| 表の中 | [リンク](https://example.com/c) |",
        "|---|---|",
        "| a | b |",
      ].join("\n"),
    );
    expect(out).not.toContain("href=");
    expect([...out.matchAll(new RegExp(BODY_LINK_URL_ATTRIBUTE, "g"))]).toHaveLength(3);
  });

  it("leaves the text of a link it will not open, without drawing a link", () => {
    for (const source of [
      "[設定ファイル](file:///etc/passwd) を開く",
      "[連絡](mailto:someone@example.com)",
      "[罠](javascript:alert(1))",
      "[隣の文書](./doc-3.md)",
      "[見出しへ](#section)",
    ]) {
      const out = html(source);
      expect(out).not.toContain("<a ");
      expect(out).not.toContain("</a>");
    }
    // The words survive — that is what dropping the tags rather than the token does.
    expect(html("[隣の文書](./doc-3.md)")).toContain("隣の文書");
  });

  it("judges a bare URL by the same rule as a written-out link", () => {
    // linkify runs after the inline pass, so a rule that only saw authored links would let this through.
    const linkified = html("詳しくは https://example.com/x を見る");
    expect(linkified).toContain(`class="${BODY_LINK_CLASS}"`);
    expect(linkified).not.toContain("href=");
    expect(html("設定は file:///etc/hosts にある")).not.toContain("<a ");
  });

  it("keeps a link's own text when several links sit in one paragraph", () => {
    // The dropped close tag has to be the dropped open tag's, not the next one's.
    const out = html("[外](https://example.com) と [中](./local.md) と [外2](https://example.org)");
    expect([...out.matchAll(/<a /g)]).toHaveLength(2);
    expect([...out.matchAll(/<\/a>/g)]).toHaveLength(2);
    expect(out).toContain("中");
  });
});

describe("タスクリスト (doc-11 §14.4)", () => {
  it("draws the 状態の印 as the figure ACCEPTANCE CRITERIA uses, not as a checkbox", () => {
    const out = html("- [x] 済み\n- [ ] 未\n");
    expect(out).not.toContain("<input");
    expect(out).toContain(`class="${BODY_TASK_MARK_CLASS}"`);
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="完了"');
    expect(out).toContain('aria-label="未完了"');
    // The same two lucide figures the AC 項目 draws (`square-check` / `square`), so the same state reads
    // the same way on both surfaces.
    expect(out).toContain('<rect width="18" height="18" x="3" y="3" rx="2"/>');
    expect(out).toContain('<path d="m9 12 2 2 4-4"/>');
  });

  it("marks the item and nothing above it", () => {
    const out = html("- [x] 済み\n- [ ] 未\n");
    expect([...out.matchAll(new RegExp(`class="${BODY_TASK_CLASS}"`, "g"))]).toHaveLength(2);
    // **Not the enclosing list.** A class there is what took the marker off an ordinary sibling as well
    // (doc-11 §14.4), so the `<ul>` must carry nothing.
    expect(out).toMatch(/<ul>\n/);
  });

  it("leaves an ordinary item in a mixed list untouched", () => {
    // The case the list-level class broke: one task item and one plain item in the same list. The plain
    // one must stay an ordinary `<li>` — with its bullet, which only its lack of a class can preserve.
    const out = html("- [x] 済み\n- ふつうの項目\n");
    const items = [...out.matchAll(/<li( class="([^"]*)")?>/g)].map((m) => m[2] ?? "");
    expect(items).toEqual([BODY_TASK_CLASS, ""]);
  });

  it("keeps a nested list inside a task item as a block of its own", () => {
    // `display: flex` on the item put a nested list beside the item's text; the markup that has to hold
    // for the CSS fix to be possible is that the child list is still a child of the task `<li>`.
    const out = html("- [x] 親\n  - 子\n");
    expect(out).toMatch(new RegExp(`<li class="${BODY_TASK_CLASS}">[\\s\\S]*<ul>`));
  });

  it("leaves an ordinary list, and an item that only looks like one, alone", () => {
    const plain = html("- ふつうの項目\n- もう 1 つ\n");
    expect(plain).not.toContain(BODY_TASK_CLASS);
    expect(plain).not.toContain(BODY_TASK_MARK_CLASS);
    // A marker that inline parsing already turned into something else is not a task item.
    expect(html("- [リンク](https://example.com) から始まる項目")).not.toContain(BODY_TASK_MARK_CLASS);
  });
});

describe("作図フェンス (doc-8 §9.2, doc-11 §14.5)", () => {
  it("is a readable code fence, marked for the 作図結果 to replace", () => {
    const out = html("```mermaid\ngraph TD;\n  A-->B;\n```\n");
    expect(out).toContain(`<pre class="${BODY_FIGURE_CLASS}">`);
    // The source is what a reader sees until — or unless — a diagram is drawn over it.
    expect(out).toContain("graph TD;");
    expect(out).toContain("A--&gt;B;");
  });

  it("marks only a fence that names mermaid", () => {
    expect(html("```mermaid\ngraph TD;\n```\n")).toContain(BODY_FIGURE_CLASS);
    expect(html("```MERMAID\ngraph TD;\n```\n")).toContain(BODY_FIGURE_CLASS);
    expect(html("```rust\nlet x = 1;\n```\n")).not.toContain(BODY_FIGURE_CLASS);
    expect(html("```\ngraph TD;\n```\n")).not.toContain(BODY_FIGURE_CLASS);
  });
});

describe("bodyView", () => {
  it("renders an empty 本文 as nothing rather than failing", () => {
    expect(bodyView("")).toEqual({ kind: "formatted", html: "" });
  });

  it("keeps the newlines of a hard-wrapped paragraph inside one paragraph", () => {
    // Markdown joins soft-wrapped lines; the previous そのまま表示 kept them apart. Stated here because
    // it is the one visible difference a reader of an existing 本文 meets first.
    const out = html("1 行目\n2 行目\n");
    expect([...out.matchAll(/<p>/g)]).toHaveLength(1);
  });
});

describe("整形表示 の見え方 (doc-11 §14)", () => {
  it("styles every class the pipeline emits", () => {
    // A stylesheet cannot read these constants, so this is what holds the two spellings together: a
    // renamed class with no rule behind it would draw an unstyled 本文 and pass every test above.
    for (const emitted of [
      BODY_LINK_CLASS,
      BODY_TASK_CLASS,
      BODY_TASK_MARK_CLASS,
      FIGURE_DRAWN_CLASS,
    ]) {
      expect(bodyComponent).toContain(`:global(`);
      expect(bodyComponent).toContain(emitted);
    }
    // 作図フェンス is styled by the `pre` rule rather than by its own, so its class needs no selector —
    // what it does need is to keep being a `<pre>`, which `markdown.test.ts` asserts above.
    expect(bodyView("```mermaid\ngraph TD;\n```\n")).toMatchObject({ kind: "formatted" });
  });
});
