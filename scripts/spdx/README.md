# Standard licence texts

`generate-third-party-licenses.mjs` falls back to these when a dependency declares a
licence but publishes no text of its own. Nineteen crates in the current tree do that —
the `objc2` and `unic` families, `selectors`, `tauri-plugin`, `alloc-stdlib`,
`webview2-com`, `dlopen2`, `libappindicator-sys` — and their `Cargo.toml` carries an SPDX
expression and nothing else.

**These files are the SPDX license list's own text, fetched on 2026-08-14 from
`https://raw.githubusercontent.com/spdx/license-list-data/main/text/<identifier>.txt`.**
Nothing here is transcribed by hand, and no file is edited after fetching — a filename is
an SPDX identifier and its contents are that identifier's published text, which is the
only thing the generator promises about them.

Two of the five were checked against copies that arrived by an unrelated route, to
confirm that what SPDX publishes is the same text the ecosystem ships:

- **MPL-2.0** — identical, word for word, to the copy in Servo's `cssparser` crate and to
  `dompurify`'s on the npm side (those two are byte-identical to each other). The only
  difference from either is `https` for `http` in the Exhibit A URL, which is SPDX
  carrying the current form.
- **Apache-2.0** — identical to the copy 24 crates ship as `LICENSE-APACHE`, except that
  the appendix's placeholder brackets are `[]` here and `{}` there. `[]` is the form
  apache.org publishes; the crates carry a variant.

`MIT`, `BSD-3-Clause`, and `Zlib` are template texts, so they keep SPDX's placeholders
(`<year>`, `<copyright holders>`, `<owner>`) rather than naming anyone. A package that
publishes no notice names no copyright holder either, and inventing one would be worse
than leaving the field as the licence itself leaves it. The generator labels every such
entry `(standard text; this package publishes none)` so a reader is never shown a
placeholder without being told why it is one.

**Adding a file here is a deliberate act, not a fix for a failing run.** The generator
stops and names the identifier when a dependency declares a licence it has no text for.
That stop is the point: a new identifier means the tree took on a licence nobody has
looked at, and the right response is to look at it before adding the text.
