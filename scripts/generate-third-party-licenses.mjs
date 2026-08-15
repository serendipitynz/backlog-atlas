#!/usr/bin/env node
// Generate THIRD-PARTY-LICENSES.txt — the notice that ships with a built bundle.
//
// Run it after either lockfile moves:
//
//   pnpm install
//   cargo fetch --manifest-path src-tauri/Cargo.toml \
//     --target aarch64-apple-darwin --target x86_64-apple-darwin \
//     --target x86_64-pc-windows-msvc --target x86_64-unknown-linux-gnu \
//     --target aarch64-unknown-linux-gnu
//   node scripts/generate-third-party-licenses.mjs
//
// and commit the result. `third-party-licenses.test.ts` fails when the file's
// recorded lockfile digests no longer match the lockfiles, which is what turns
// "someone has to remember" into "the suite says so".
//
// The output is committed rather than produced in CI because tauri.conf.json
// lists it under bundle.resources: a resource that only exists on a runner
// breaks `pnpm tauri build` for everyone following README's "Building from
// source". Being byte-reproducible is what makes committing it safe — nothing
// here reads a clock, a path, or a machine-specific value, and the packages and
// their texts are emitted in a sorted order.
//
// That reproducibility reaches as far as the bytes on disk and no further: the
// input digests below are taken over those bytes, so a checkout that converted
// line endings would change all nine at once. `.gitattributes` pins the whole
// tree to LF for exactly this reason — without it, git's default
// core.autocrlf=true on Windows produces a tree whose every digest is wrong.
//
// Crate texts come from the `.crate` tarballs in the cargo registry cache, not
// from the extracted sources beside them. `cargo fetch --target` populates the
// cache for a platform it never builds, but extraction happens at build time —
// so on any one machine the extracted set covers the host alone, and the notice
// has to cover all three platforms at once.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SPDX_DIR = join(REPO, 'scripts', 'spdx')
const VENDORED_NOTICES = join(REPO, 'THIRD-PARTY-NOTICES.md')
const OUTPUT = join(REPO, 'THIRD-PARTY-LICENSES.txt')

// The platforms the release workflow builds. A crate reaches the notice when it
// is resolved for any of them, so one file covers every bundle.
const TARGETS = [
  'aarch64-apple-darwin',
  'x86_64-apple-darwin',
  'x86_64-pc-windows-msvc',
  'x86_64-unknown-linux-gnu',
  // The release builds Linux on two architectures, and both bundles carry this
  // notice. The two triples resolve the same crates today (measured 2026-08-15),
  // so adding this one changes nothing in the output — it is here so that a
  // dependency taken on under `cfg(target_arch)` later cannot go unlisted in
  // the arm64 bundles without anything failing.
  'aarch64-unknown-linux-gnu',
]

const LICENSE_FILE = /^(licen[cs]e|copying|copyright|notice|unlicen[cs]e)/i
// A source file whose name starts with "license" is code, not a notice.
const NOT_A_NOTICE = /\.(rs|js|mjs|cjs|ts|json|toml|py|sh)$/i

function fail(message) {
  console.error(`generate-third-party-licenses: ${message}`)
  process.exit(1)
}

// Line endings are the one thing normalized. Leaving them as published would
// make the output depend on which packages happen to ship CRLF, and this file
// has to be byte-identical whoever regenerates it.
function normalize(text) {
  return text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n'
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      ...options,
    })
  } catch (error) {
    fail(`\`${command} ${args.join(' ')}\` failed: ${error.message}`)
  }
}

// --- npm side -------------------------------------------------------------

// `pnpm licenses list` is pnpm's own subcommand, so the npm half of this needs
// no tool that is not already pinned by packageManager. --prod is what keeps
// the build-only half of the tree (vite, svelte, vitest, jsdom, sass, the Tauri
// CLI) out: none of it reaches a bundle.
function collectNpm() {
  const raw = run('pnpm', ['licenses', 'list', '--prod', '--json'])
  let byLicense
  try {
    byLicense = JSON.parse(raw)
  } catch {
    fail('`pnpm licenses list --prod --json` did not produce JSON. Run `pnpm install` first.')
  }

  const packages = []
  for (const [declared, entries] of Object.entries(byLicense)) {
    for (const entry of entries) {
      // A package installed at two versions has an entry per version, with
      // `versions` and `paths` running in parallel.
      if (entry.versions.length !== entry.paths.length) {
        fail(`pnpm reported ${entry.versions.length} versions and ${entry.paths.length} paths for ${entry.name}`)
      }
      entry.versions.forEach((version, index) => {
        packages.push({
          ecosystem: 'npm',
          name: entry.name,
          version,
          declared: declared === 'Unknown' ? null : declared,
          texts: readNpmTexts(entry.paths[index]),
        })
      })
    }
  }
  if (packages.length === 0) {
    fail('pnpm reported no production packages. Run `pnpm install` first.')
  }
  return packages
}

function readNpmTexts(path) {
  let names
  try {
    names = readdirSync(path)
  } catch {
    fail(`${path} is not readable. Run \`pnpm install\` first.`)
  }
  return names
    .filter((name) => LICENSE_FILE.test(name) && !NOT_A_NOTICE.test(name))
    .filter((name) => statSync(join(path, name)).isFile())
    .sort()
    .map((name) => ({ name, text: normalize(readFileSync(join(path, name), 'utf8')) }))
}

// --- cargo side -----------------------------------------------------------

// One --filter-platform pass per shipped triple, unioned. Asking cargo for the
// unfiltered graph instead would be 442 crates rather than 352: it resolves
// every platform the lockfile can describe, so the notice would claim Android,
// wasm, Redox, iOS and the GNU-ABI Windows crates ship inside these bundles,
// and none of them do.
function collectCargo() {
  const caches = registryCacheDirs()
  const shipped = new Map()
  for (const target of TARGETS) {
    const metadata = JSON.parse(
      run('cargo', [
        'metadata',
        '--format-version',
        '1',
        '--locked',
        '--filter-platform',
        target,
        '--manifest-path',
        join(REPO, 'src-tauri', 'Cargo.toml'),
      ]),
    )
    const byId = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]))
    for (const id of reachableFromRoot(metadata)) {
      const pkg = byId.get(id)
      // The root is this app itself; its licence is LICENSE, not a notice owed
      // to someone else. Any other path dependency would be ours too.
      if (!pkg.source || shipped.has(id)) {
        continue
      }
      shipped.set(id, {
        ecosystem: 'cargo',
        name: pkg.name,
        version: pkg.version,
        declared: pkg.license ?? null,
        texts: readCrateTexts(pkg, caches),
      })
    }
  }
  if (shipped.size === 0) {
    fail('cargo metadata resolved no dependencies.')
  }
  return [...shipped.values()]
}

// Follow every edge that is not a dev-dependency. Build-dependencies are kept
// even though they run rather than ship: over-disclosing a build script's
// licence costs a paragraph, and deciding per crate which code the linker
// actually kept is not something a lockfile can answer.
function reachableFromRoot(metadata) {
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]))
  const root = metadata.resolve.root
  if (!root) {
    fail('cargo metadata reported no resolve root.')
  }
  const seen = new Set([root])
  const queue = [root]
  while (queue.length > 0) {
    const node = nodes.get(queue.shift())
    for (const dep of node?.deps ?? []) {
      if (!dep.dep_kinds.some((kind) => kind.kind !== 'dev')) {
        continue
      }
      if (!seen.has(dep.pkg)) {
        seen.add(dep.pkg)
        queue.push(dep.pkg)
      }
    }
  }
  return [...seen]
}

function registryCacheDirs() {
  const home = process.env.CARGO_HOME || join(homedir(), '.cargo')
  const cache = join(home, 'registry', 'cache')
  let names
  try {
    names = readdirSync(cache)
  } catch {
    fail(`no cargo registry cache at ${cache}. Run \`cargo fetch\` for the release targets first.`)
  }
  return names.map((name) => join(cache, name))
}

function readCrateTexts(pkg, caches) {
  const file = `${pkg.name}-${pkg.version}.crate`
  for (const cache of caches) {
    const path = join(cache, file)
    let archive
    try {
      archive = readFileSync(path)
    } catch {
      continue
    }
    return listTar(gunzipSync(archive), path)
      .filter(({ name }) => {
        // Depth 1 only: the tarball's single top-level directory is
        // <name>-<version>/, and a notice lives directly inside it. Deeper hits
        // are a dependency's own vendored tree or a test fixture.
        const parts = name.split('/')
        return parts.length === 2 && LICENSE_FILE.test(parts[1]) && !NOT_A_NOTICE.test(parts[1])
      })
      .map(({ name, body }) => ({ name: name.split('/')[1], text: normalize(body.toString('utf8')) }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  }
  fail(
    `${file} is not in the cargo registry cache. Run:\n` +
      `  cargo fetch --manifest-path src-tauri/Cargo.toml ${TARGETS.map((t) => `--target ${t}`).join(' ')}`,
  )
}

// A tar reader over the crates.io tarball. Most entries are plain ustar, but
// the long-name extensions do turn up — tauri-plugin-fs ships paths past the
// 100-byte name field — and an unread extension header would shift the name of
// the entry after it onto the wrong bytes, which is how a notice goes missing
// without anything failing. An extension this does not implement is an error
// rather than a skip, for the same reason.
function listTar(buffer, path) {
  const entries = []
  let pendingName = null
  for (let offset = 0; offset + 512 <= buffer.length; ) {
    const header = buffer.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) {
      break
    }
    const field = (start, length) => {
      const raw = header.subarray(start, start + length)
      const end = raw.indexOf(0)
      return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8')
    }
    const size = parseInt(field(124, 12).trim() || '0', 8)
    const typeflag = field(156, 1) || '0'
    const body = buffer.subarray(offset + 512, offset + 512 + size)
    offset += 512 + Math.ceil(size / 512) * 512

    if (typeflag === 'L') {
      // GNU long name: this entry's body is the path of the entry after it.
      pendingName = body.toString('utf8').replace(/\0+$/, '')
      continue
    }
    if (typeflag === 'K') {
      // GNU long link name — it renames a link target, never a file's own path.
      continue
    }
    if (typeflag === 'x' || typeflag === 'g') {
      // pax header. Only the `path` record can rename the entry after it; a
      // global header (`g`) sets defaults for the rest of the archive, and
      // cargo emits none, so treating one as per-entry would be wrong.
      if (typeflag === 'x') {
        const record = body.toString('utf8').match(/^\d+ path=(.*)$/m)
        pendingName = record ? record[1] : pendingName
      }
      continue
    }
    if (typeflag !== '0' && typeflag !== '\0') {
      if (typeflag !== '5' && typeflag !== '1' && typeflag !== '2') {
        fail(`${path} holds a tar entry of type ${typeflag} this reader does not implement.`)
      }
      pendingName = null
      continue
    }

    const prefix = field(345, 155)
    const name = pendingName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100))
    pendingName = null
    entries.push({ name, body })
  }
  return entries
}

// --- SPDX fallback --------------------------------------------------------

// Nineteen crates publish no notice of their own — the objc2 and unic families,
// selectors, tauri-plugin, alloc-stdlib — declaring only an SPDX expression in
// Cargo.toml. The standard text of each identifier in that expression stands in
// for them, kept in scripts/spdx/ so a new identifier is a visible addition
// rather than something the generator invents.
function spdxIdentifiers(expression) {
  return [
    ...new Set(
      expression
        .replace(/[()]/g, ' ')
        .split(/\s+(?:OR|AND|WITH)\s+|\//i)
        .map((part) => part.trim())
        .filter((part) => part.length > 0 && !/^(OR|AND|WITH)$/i.test(part)),
    ),
  ]
}

function spdxText(identifier) {
  try {
    return normalize(readFileSync(join(SPDX_DIR, `${identifier}.txt`), 'utf8'))
  } catch {
    return null
  }
}

// Every missing identifier is reported at once. Failing on the first would make
// a dependency bump that introduces three of them take three runs to describe,
// and each run costs a full pass over both ecosystems.
function applyFallback(packages) {
  const missing = new Map()
  const undeclared = []
  for (const pkg of packages) {
    if (pkg.texts.length > 0) {
      continue
    }
    if (!pkg.declared) {
      undeclared.push(`${pkg.ecosystem} ${pkg.name} ${pkg.version}`)
      continue
    }
    pkg.texts = spdxIdentifiers(pkg.declared).map((identifier) => {
      const text = spdxText(identifier)
      if (text === null) {
        missing.set(identifier, [...(missing.get(identifier) ?? []), `${pkg.ecosystem} ${pkg.name} ${pkg.version}`])
      }
      return { name: `${identifier} (standard text; this package publishes none)`, text: text ?? '' }
    })
  }
  if (undeclared.length > 0) {
    fail(
      `these packages publish no licence file and declare no licence — establish their terms by hand ` +
        `before shipping them:\n${undeclared.map((entry) => `  ${entry}`).join('\n')}`,
    )
  }
  if (missing.size > 0) {
    fail(
      `no standard text for ${missing.size} SPDX identifier(s). A dependency declares a licence whose ` +
        `text it does not publish. Add each one's official text under scripts/spdx/ and re-run:\n` +
        [...missing]
          .map(([identifier, carriers]) => `  scripts/spdx/${identifier}.txt  (for ${carriers.join(', ')})`)
          .join('\n'),
    )
  }
}

// --- output ---------------------------------------------------------------

const order = (a, b) => {
  if (a.ecosystem !== b.ecosystem) {
    return a.ecosystem < b.ecosystem ? -1 : 1
  }
  if (a.name !== b.name) {
    return a.name < b.name ? -1 : 1
  }
  return a.version < b.version ? -1 : a.version > b.version ? 1 : 0
}

function rule(char = '=') {
  return char.repeat(78)
}

// The generator itself is in the list: a change to how the output is shaped
// stales the output just as surely as a change to what goes into it.
function INPUTS() {
  const paths = [
    'scripts/generate-third-party-licenses.mjs',
    'pnpm-lock.yaml',
    'src-tauri/Cargo.lock',
    'THIRD-PARTY-NOTICES.md',
    ...readdirSync(SPDX_DIR)
      .filter((name) => name.endsWith('.txt'))
      .sort()
      .map((name) => `scripts/spdx/${name}`),
  ]
  return paths.map((label) => ({ label, digest: sha256(readFileSync(join(REPO, label))) }))
}

function inventory(packages, ecosystem) {
  const rows = packages.filter((pkg) => pkg.ecosystem === ecosystem)
  const width = Math.max(...rows.map((pkg) => `${pkg.name} ${pkg.version}`.length))
  return rows.map((pkg) => `  ${`${pkg.name} ${pkg.version}`.padEnd(width)}  ${pkg.declared ?? '(not declared)'}`)
}

// One text, however many packages carry it. The Apache-2.0 text alone is
// shipped by well over a hundred crates, and repeating it per package would
// make the notice several megabytes of the same eleven kilobytes.
function groupTexts(packages) {
  const groups = new Map()
  for (const pkg of packages) {
    for (const { name, text } of pkg.texts) {
      const key = sha256(Buffer.from(text, 'utf8'))
      if (!groups.has(key)) {
        groups.set(key, { text, carriers: [] })
      }
      groups.get(key).carriers.push(`${pkg.ecosystem} ${pkg.name} ${pkg.version} (${name})`)
    }
  }
  return [...groups.values()]
}

function render(packages) {
  const npm = packages.filter((pkg) => pkg.ecosystem === 'npm').length
  const cargo = packages.filter((pkg) => pkg.ecosystem === 'cargo').length
  const groups = groupTexts(packages)

  const lines = [
    rule(),
    'THIRD-PARTY LICENSES — Backlog Atlas',
    rule(),
    '',
    'Backlog Atlas is under the MIT License; its own terms are in LICENSE. This file',
    'carries the notices owed to everyone else whose work ships inside a Backlog Atlas',
    'bundle.',
    '',
    'It is generated by scripts/generate-third-party-licenses.mjs and must not be',
    'edited by hand — every part of it is read back out of the two lockfiles and the',
    'packages they resolve, so an edit is lost the next time a dependency moves.',
    '',
    'Section 1 is THIRD-PARTY-NOTICES.md reproduced in full. It covers the material',
    'vendored into the repository — the Ace editor and the Lucide figures — which no',
    'lockfile mentions and no inventory built from one would find. The generated',
    'inventory does not replace it; both travel in one file so neither can ship',
    'without the other.',
    '',
    `Sections 2 and 3 list the ${npm} npm packages and ${cargo} cargo crates resolved for a`,
    'release build. The npm side is the production dependency set — the build-only',
    'half of the tree (the bundler, the compiler, the test runner) reaches no bundle.',
    'The cargo side is the union over the five target triples the release workflow',
    'builds, so this one file covers the macOS, Windows, and Linux bundles alike;',
    'dev-dependencies are excluded, build-dependencies are kept.',
    '',
    'Section 4 holds the licence texts themselves, each printed once and followed by',
    'the packages that carry it. Where a package publishes no text of its own, the',
    'standard text of the licence it declares stands in, and the entry says so.',
    '',
    'Line endings are the only thing normalized. No text below is otherwise altered.',
    '',
    // Every in-repo input, not just the two lockfiles: editing
    // THIRD-PARTY-NOTICES.md or an scripts/spdx/ text goes stale here exactly
    // the way a dependency bump does, and the digests are what lets a test say
    // so without a network or a populated node_modules.
    'Generated from these inputs (a digest that no longer matches means this file',
    'is stale — regenerate it with the command at the top of the generator):',
    ...INPUTS().map(({ label, digest }) => `  ${label.padEnd(46)}  sha256 ${digest}`),
    '',
    rule(),
    'SECTION 1 — MATERIAL VENDORED IN THE REPOSITORY (THIRD-PARTY-NOTICES.md)',
    rule(),
    '',
    normalize(readFileSync(VENDORED_NOTICES, 'utf8')).trimEnd(),
    '',
    rule(),
    `SECTION 2 — NPM PACKAGES (${npm})`,
    rule(),
    '',
    ...inventory(packages, 'npm'),
    '',
    rule(),
    `SECTION 3 — CARGO CRATES (${cargo})`,
    rule(),
    '',
    ...inventory(packages, 'cargo'),
    '',
    rule(),
    `SECTION 4 — LICENCE TEXTS (${groups.length})`,
    rule(),
  ]

  groups.forEach((group, index) => {
    lines.push(
      '',
      rule('-'),
      `TEXT ${index + 1} of ${groups.length} — carried by ${group.carriers.length} package(s):`,
      ...group.carriers.map((carrier) => `  ${carrier}`),
      rule('-'),
      '',
      group.text.trimEnd(),
    )
  })

  lines.push('')
  return lines.join('\n')
}

const packages = [...collectNpm(), ...collectCargo()].sort(order)
applyFallback(packages)
const output = render(packages)
writeFileSync(OUTPUT, output)
console.log(
  `Wrote ${OUTPUT} — ${packages.filter((p) => p.ecosystem === 'npm').length} npm packages, ` +
    `${packages.filter((p) => p.ecosystem === 'cargo').length} cargo crates, ` +
    `${(Buffer.byteLength(output) / 1024).toFixed(0)} KB.`,
)
