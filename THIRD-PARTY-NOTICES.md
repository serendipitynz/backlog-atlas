# Third-party notices

Backlog Atlas itself is under the MIT License ([LICENSE](LICENSE)). This file covers
material by other authors.

## Material vendored in this repository

Two things are in this tree rather than resolved from a package manager, so their notices
travel with it — and neither would be found by an inventory built from the lockfiles.

### Ace

`public/vendor/ace/ace.js` is the Ace editor, served verbatim and loaded at runtime by
`src/lib/ace.ts` (the reasoning is in that file's header and decision-8). It ships inside
the app, so its notice ships with it. The upstream `LICENSE` sits beside it at
`public/vendor/ace/LICENSE` and is reproduced here:

Source: <https://github.com/ajaxorg/ace>

```
Copyright (c) 2010, Ajax.org B.V.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
    * Neither the name of Ajax.org B.V. nor the
      names of its contributors may be used to endorse or promote products
      derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### Lucide

`src/lib/icons/lucide.ts` holds the geometry of about twenty Lucide figures, written out
rather than pulled in as a dependency (the reason is in that file's header). The figures
are copied, not redrawn, so Lucide's notice travels with this repository.

Lucide's own `LICENSE` is reproduced in full below. It carries two notices — the ISC
licence for Lucide, and the MIT licence for the icons Lucide derives from Feather — and
Atlas copies figures from both groups.

Source: <https://github.com/lucide-icons/lucide>

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle,
arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left,
arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right,
arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right,
chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle,
clipboard, clock, code, columns, command, compass, corner-down-left,
corner-down-right, corner-left-down, corner-left-up, corner-right-down,
corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle,
divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones,
help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in,
log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus,
monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation,
octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss,
search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2,
tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle,
x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Dependencies resolved at build time

The remaining third-party code is not in this repository. It is fetched by `pnpm` and
`cargo` when the app is built, and each package keeps its own licence — the resolved set
is `pnpm-lock.yaml` and `src-tauri/Cargo.lock`. The notices those licences require in a
**distributed binary** are not generated yet; that is tracked as its own task (TASK-159) and
belongs with the release artifacts rather than with this file.

**A generated inventory does not replace the section above.** Ace and Lucide are in the tree
rather than in a lockfile, so a tool that reads `pnpm-lock.yaml` and `Cargo.lock` will not
list either. Whatever TASK-159 generates has to be combined with this file, not substituted
for it.

## The Backlog CLI

Backlog Atlas launches the Backlog CLI (`backlog.md`, MIT) as a child process. It is
neither bundled nor redistributed — the user installs it themselves — so no notice of
theirs ships with Atlas.
