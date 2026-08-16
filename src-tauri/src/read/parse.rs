//! Text → values. Pure functions over file contents: frontmatter splitting, YAML field
//! extraction, and `SECTION`/`AC` body parsing (doc-4 §4). No filesystem access — the bytes
//! arrive through the scan-source boundary (see [`super::scan`]).
//!
//! Field extraction goes through the YAML `Value` tree rather than `#[derive(Deserialize)]`
//! on a frontmatter struct, because doc-4 §4's three-way classification cannot be expressed
//! with derive: one out-of-range optional field would abort the whole deserialization and
//! turn a readable task into 解析不能. Walking the tree lets a bad `labels` degrade only
//! `labels` while `id`/`title`/`status` still land (§5, 判別できたフィールドは活かし).

use crate::domain::{AcceptanceCriterion, Comment, DegradeEvent, UnknownSection};
use serde_yaml_ng::Value;

/// SECTION names this layer maps to a domain field (doc-4 §3.1). Anything else is 未知の
/// SECTION: kept as a body fragment and flagged (§4).
///
/// **This is the CLI's whole SECTION vocabulary, not a subset it happens to write.** v1.49.3
/// builds every SECTION marker from one table of four entries, and scans for them with the
/// single pattern
/// `<!-- (SECTION:[A-Z][A-Z0-9_]*|COMMENTS|COMMENT|AC|DOD):(BEGIN|END) -->` — so the four names
/// here plus [`Marker`]'s other families are every delimiter a managed task body can carry
/// (measured on v1.49.3, 2026-08-17). Docs, decisions and milestones carry no marker at all.
const KNOWN_SECTIONS: [&str; 4] = ["DESCRIPTION", "PLAN", "NOTES", "FINAL_SUMMARY"];

/// The `---` line that separates a comment's header from its body, and its body from the next
/// comment, in the form v1.49.3 writes (measured 2026-08-17).
const COMMENT_DELIMITER: &str = "---";

/// Why a file has no frontmatter to read. Both are 解析不能 (doc-4 §5), but they are different
/// facts about the file and the reason a screen shows says which — a `docs/README.md` that never
/// opened a fence is not a managed document with a broken one (TASK-88, PR #71 [P2]).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoFrontmatter {
    /// The file does not begin with `---`.
    NotOpened,
    /// It begins with `---` and nothing closes the block.
    NotClosed,
}

impl NoFrontmatter {
    /// The reason text, so the two callers that report it cannot word the same fact differently.
    pub fn detail(self) -> &'static str {
        match self {
            NoFrontmatter::NotOpened => "no frontmatter block",
            NoFrontmatter::NotClosed => "no closing frontmatter fence",
        }
    }
}

/// Split a leading `---` … `---` frontmatter block from the body, or say which way it was absent.
///
/// The distinction is decided here rather than by the caller because it is the same scan that
/// finds it: a caller re-deciding「開いていたか」would be a second implementation of the fence
/// rule, and the BOM handling below is exactly the sort of detail the two would drift on.
pub fn split_frontmatter(text: &str) -> Result<(&str, &str), NoFrontmatter> {
    // A UTF-8 BOM survives some editors' round-trips and would otherwise make an entirely
    // valid file look fence-less.
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let rest = text
        .strip_prefix("---\n")
        .or_else(|| text.strip_prefix("---\r\n"))
        .ok_or(NoFrontmatter::NotOpened)?;

    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        let trimmed = line.trim_end_matches(['\n', '\r']);
        // `...` closes a YAML document just as `---` does; accept both so a file written by a
        // stricter YAML emitter is not read as unterminated.
        if trimmed == "---" || trimmed == "..." {
            return Ok((&rest[..offset], &rest[offset + line.len()..]));
        }
        offset += line.len();
    }
    Err(NoFrontmatter::NotClosed)
}

/// Parse a frontmatter block into a YAML value. The error text is carried into
/// [`DegradeEvent::Unparseable`]'s `detail` so 縮退表示 can say *why* the file did not read.
pub fn parse_frontmatter(yaml: &str) -> Result<Value, String> {
    // An empty frontmatter block deserializes to Null, not a mapping; normalize it so callers
    // only ever see "no fields" rather than a type error.
    match serde_yaml_ng::from_str::<Value>(yaml) {
        Ok(Value::Null) => Ok(Value::Mapping(Default::default())),
        Ok(v) if v.is_mapping() => Ok(v),
        Ok(_) => Err("frontmatter is not a mapping".to_string()),
        Err(e) => Err(e.to_string()),
    }
}

/// Render a YAML scalar as text. Non-scalars (sequences, mappings) return `None`: a `title`
/// that is a nested mapping is out of range rather than something to stringify.
fn scalar_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        // Numbers and booleans reach here when a value is unquoted — a task titled `2026`, a
        // status of `Done` is fine but `true` would parse as bool. Keep the text.
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

/// Read an optional scalar field. Absence is normal and never degrades (doc-4 §4, 任意
/// フィールド); a present-but-non-scalar value degrades that field alone.
pub fn string_field(map: &Value, key: &str, events: &mut Vec<DegradeEvent>) -> Option<String> {
    let value = map.get(key)?;
    if value.is_null() {
        return None;
    }
    match scalar_to_string(value) {
        Some(s) => Some(s),
        None => {
            events.push(DegradeEvent::UnexpectedSchema {
                detail: format!("frontmatter `{key}` is not a scalar value"),
            });
            None
        }
    }
}

/// Read an optional list-of-strings field. A missing field is an empty list, not a
/// degradation (doc-4 §4). A present value of the wrong shape degrades and yields nothing:
/// guessing that a bare `labels: ui` meant `["ui"]` would silently invent structure the file
/// does not have, which is what 想定外スキーマ exists to surface instead.
pub fn string_list_field(map: &Value, key: &str, events: &mut Vec<DegradeEvent>) -> Vec<String> {
    let Some(value) = map.get(key) else {
        return Vec::new();
    };
    if value.is_null() {
        return Vec::new();
    }
    let Some(items) = value.as_sequence() else {
        events.push(DegradeEvent::UnexpectedSchema {
            detail: format!("frontmatter `{key}` is not a list"),
        });
        return Vec::new();
    };
    let mut out = Vec::with_capacity(items.len());
    for item in items {
        match scalar_to_string(item) {
            Some(s) => out.push(s),
            None => events.push(DegradeEvent::UnexpectedSchema {
                detail: format!("frontmatter `{key}` has a non-scalar item"),
            }),
        }
    }
    out
}

/// Read an optional integer field (`ordinal`).
pub fn int_field(map: &Value, key: &str, events: &mut Vec<DegradeEvent>) -> Option<i64> {
    let value = map.get(key)?;
    if value.is_null() {
        return None;
    }
    match value.as_i64() {
        Some(n) => Some(n),
        None => {
            events.push(DegradeEvent::UnexpectedSchema {
                detail: format!("frontmatter `{key}` is not an integer"),
            });
            None
        }
    }
}

/// What a task body yields (doc-4 §3.1, §4).
#[derive(Debug, Default)]
pub struct Body {
    pub description: Option<String>,
    pub implementation_plan: Option<String>,
    pub implementation_notes: Option<String>,
    pub final_summary: Option<String>,
    pub unknown_sections: Vec<UnknownSection>,
    pub acceptance_criteria: Vec<AcceptanceCriterion>,
    /// `DOD:BEGIN`…`DOD:END` items. Typed as the acceptance criterion because the CLI writes
    /// both blocks with the same code — same `- [ ] #N` shape, same numbering, same checked
    /// state (measured on v1.49.3, 2026-08-17). A second struct of the same three fields would
    /// be a second place for the `#N` rule to drift.
    pub definition_of_done: Vec<AcceptanceCriterion>,
    /// `COMMENTS:BEGIN`…`COMMENTS:END` entries, in the order the file carries them.
    pub comments: Vec<Comment>,
    /// URLs collected from a `## References` heading's bullet list, merged by the caller with
    /// the frontmatter `references` (doc-4 §3.1).
    pub references: Vec<String>,
    /// Structure-when-present failures only (doc-4 §4): unclosed or mismatched marker pairs,
    /// unreadable AC numbering, unknown SECTION names. An absent section is never in here.
    pub events: Vec<DegradeEvent>,
}

/// 説明の本文範囲 (decision-21) — the byte range of `body` a milestone's Description occupies:
/// from the line after its opening (a `## Description` heading, or a `SECTION:DESCRIPTION:BEGIN`
/// marker) up to the line before whatever ends it (the next `##` heading, the matching `END`
/// marker, or the end of the body). `None` when the body has no Description at all.
///
/// **The read and the write share this one function**, which is what makes decision-21's third
/// condition — the range written is the range the read layer reads — hold by construction rather
/// than by two implementations agreeing. `read::read_milestones` takes the text of this range as
/// [`crate::domain::Milestone::description`]; `update`'s 直接書き込み操作 replaces exactly these
/// bytes and leaves every other byte of the file as it was. Writing the range rule twice is how
/// the string on screen and the string that can be saved would come apart without anything
/// failing.
///
/// Both opening forms are accepted because the reader accepts both: v1.49.3's `milestone add`
/// writes the plain heading (measured 2026-08-12), while task files use the SECTION pair, and a
/// milestone file hand-edited into the other shape still reads. **Which one opened the range is
/// returned with it**, because the write is narrower than the read: decision-21 admits only the
/// shape the CLI itself writes, so the writer refuses a [`DescriptionOpener::Section`] range while
/// the reader takes it. Reporting the opener is what lets the two differ deliberately — a writer
/// that re-derived the shape from the text would be the second implementation of this rule that
/// sharing the function exists to prevent.
pub fn description_span(body: &str) -> Option<DescriptionRange> {
    let mut offset = 0;
    let mut start: Option<(usize, DescriptionOpener)> = None;
    for line in body.split_inclusive('\n') {
        let end = offset + line.len();
        let trimmed = line.trim_end_matches(['\n', '\r']);
        match start {
            None => {
                if matches!(
                    marker(trimmed).and_then(parse_marker),
                    Some(Marker::SectionBegin(ref name)) if name.eq_ignore_ascii_case("DESCRIPTION")
                ) {
                    start = Some((end, DescriptionOpener::Section));
                } else if is_heading(trimmed, "Description") {
                    start = Some((end, DescriptionOpener::Heading));
                }
            }
            Some((from, opener)) => {
                let closes = match opener {
                    DescriptionOpener::Section => matches!(
                        marker(trimmed).and_then(parse_marker),
                        Some(Marker::SectionEnd(ref name)) if name.eq_ignore_ascii_case("DESCRIPTION")
                    ),
                    DescriptionOpener::Heading => trimmed.trim_start().starts_with("##"),
                };
                if closes {
                    return Some(DescriptionRange {
                        opener,
                        range: from..offset,
                    });
                }
            }
        }
        offset = end;
    }
    // No closing line: the Description runs to the end of the body. An unclosed SECTION pair is a
    // 存在時構造検査 failure for a task (doc-4 §4), but this function only reports the range —
    // `parse_body` is where that verdict is made.
    start.map(|(from, opener)| DescriptionRange {
        opener,
        range: from..body.len(),
    })
}

/// 説明の本文範囲 and what opened it (decision-21).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DescriptionRange {
    pub opener: DescriptionOpener,
    pub range: std::ops::Range<usize>,
}

/// What a Description was opened by. A value rather than a bool so the two shapes are named where
/// they are decided about: only [`DescriptionOpener::Heading`] is a shape v1.49.3's `milestone add`
/// writes, and only that one may be written back into (decision-21's first condition).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DescriptionOpener {
    /// `## Description` — what `milestone add -d` writes (measured 2026-08-12).
    Heading,
    /// A `SECTION:DESCRIPTION` marker pair — a task file's shape, reachable in a milestone file
    /// only by hand-editing.
    Section,
}

/// A `## <name>` heading line, by the same "starts with `##`" rule [`parse_body`] uses to end a
/// block, with the name compared case-insensitively.
fn is_heading(line: &str, name: &str) -> bool {
    let trimmed = line.trim_start();
    let Some(rest) = trimmed.strip_prefix("##") else {
        return false;
    };
    rest.trim().eq_ignore_ascii_case(name)
}

/// The marker payload of a comment line, e.g. `SECTION:NOTES:BEGIN` for
/// `<!-- SECTION:NOTES:BEGIN -->`. `None` for any ordinary line.
fn marker(line: &str) -> Option<&str> {
    let trimmed = line.trim();
    let inner = trimmed.strip_prefix("<!--")?.strip_suffix("-->")?;
    Some(inner.trim())
}

/// What the parser is currently collecting.
enum Capture {
    None,
    Section {
        name: String,
        lines: Vec<String>,
    },
    Ac {
        lines: Vec<String>,
    },
    Dod {
        lines: Vec<String>,
    },
    /// A `COMMENTS` block. Its lines are kept raw — the `COMMENT` pair and the `---` delimiters
    /// inside it are structure [`parse_comments`] reads, not markers this loop acts on.
    Comments {
        lines: Vec<String>,
    },
    /// A `## References` heading's bullet list, which ends at the next heading.
    References,
}

/// Parse the body after the frontmatter: `SECTION` blocks, the `AC` block, and a
/// `## References` list (doc-4 §4).
pub fn parse_body(body: &str) -> Body {
    let mut out = Body::default();
    let mut capture = Capture::None;

    for line in body.lines() {
        if let Some(marker) = marker(line) {
            match parse_marker(marker) {
                Some(Marker::SectionBegin(name)) => {
                    close_dangling(&mut capture, &mut out);
                    capture = Capture::Section {
                        name,
                        lines: Vec::new(),
                    };
                    continue;
                }
                Some(Marker::SectionEnd(name)) => {
                    finish_section(&mut capture, &name, &mut out);
                    continue;
                }
                Some(Marker::AcBegin) => {
                    close_dangling(&mut capture, &mut out);
                    capture = Capture::Ac { lines: Vec::new() };
                    continue;
                }
                Some(Marker::AcEnd) => {
                    finish_ac(&mut capture, &mut out);
                    continue;
                }
                Some(Marker::DodBegin) => {
                    close_dangling(&mut capture, &mut out);
                    capture = Capture::Dod { lines: Vec::new() };
                    continue;
                }
                Some(Marker::DodEnd) => {
                    finish_dod(&mut capture, &mut out);
                    continue;
                }
                Some(Marker::CommentsBegin) => {
                    close_dangling(&mut capture, &mut out);
                    capture = Capture::Comments { lines: Vec::new() };
                    continue;
                }
                Some(Marker::CommentsEnd) => {
                    finish_comments(&mut capture, &mut out);
                    continue;
                }
                // The per-comment pair is internal structure of a COMMENTS block, so inside one
                // it falls through to the capture below and reaches `parse_comments` as a line.
                // Outside one it has no block to belong to, which is a structure failure.
                Some(Marker::CommentBegin | Marker::CommentEnd)
                    if !matches!(capture, Capture::Comments { .. }) =>
                {
                    out.events.push(DegradeEvent::UnexpectedSchema {
                        detail: format!("`{marker}` outside a COMMENTS block"),
                    });
                    continue;
                }
                // A comment that is not one of our markers is ordinary body text.
                Some(_) | None => {}
            }
        }

        // A heading terminates a References list and never belongs to a marker block, but it
        // must not break a SECTION whose body legitimately contains headings.
        if line.trim_start().starts_with("##") {
            if matches!(capture, Capture::References) {
                capture = Capture::None;
            }
            if matches!(capture, Capture::None) && is_references_heading(line) {
                capture = Capture::References;
                continue;
            }
        }

        match &mut capture {
            Capture::Section { lines, .. }
            | Capture::Ac { lines }
            | Capture::Dod { lines }
            | Capture::Comments { lines } => lines.push(line.to_string()),
            Capture::References => {
                if let Some(item) = bullet_item(line) {
                    out.references.push(item);
                }
            }
            Capture::None => {}
        }
    }

    // EOF with a block still open: the pair never closed (doc-4 §4 存在時構造検査).
    close_dangling(&mut capture, &mut out);
    out
}

/// Every delimiter family a managed task body can carry (doc-4 §4). The four prefix-less
/// families are as much the CLI's output as `SECTION:` is — they are alternatives in the same
/// pattern it scans with — so a parser that only knew `SECTION:` would drop their blocks without
/// even a 縮退事象 to show for it, which is what TASK-185 found.
enum Marker {
    SectionBegin(String),
    SectionEnd(String),
    AcBegin,
    AcEnd,
    DodBegin,
    DodEnd,
    CommentsBegin,
    CommentsEnd,
    /// One entry inside a `COMMENTS` block. v1.49.3 parses this form but never writes it — it
    /// writes the `---`-delimited form instead (measured 2026-08-17, both directions) — so a
    /// file can carry it and the reader has to take it.
    CommentBegin,
    CommentEnd,
}

fn parse_marker(marker: &str) -> Option<Marker> {
    match marker {
        "AC:BEGIN" => return Some(Marker::AcBegin),
        "AC:END" => return Some(Marker::AcEnd),
        "DOD:BEGIN" => return Some(Marker::DodBegin),
        "DOD:END" => return Some(Marker::DodEnd),
        "COMMENTS:BEGIN" => return Some(Marker::CommentsBegin),
        "COMMENTS:END" => return Some(Marker::CommentsEnd),
        "COMMENT:BEGIN" => return Some(Marker::CommentBegin),
        "COMMENT:END" => return Some(Marker::CommentEnd),
        _ => {}
    }
    let rest = marker.strip_prefix("SECTION:")?;
    let (name, kind) = rest.rsplit_once(':')?;
    match kind {
        "BEGIN" => Some(Marker::SectionBegin(name.to_string())),
        "END" => Some(Marker::SectionEnd(name.to_string())),
        _ => None,
    }
}

/// Store a finished SECTION under its domain field, or as an unknown fragment.
fn finish_section(capture: &mut Capture, end_name: &str, out: &mut Body) {
    let Capture::Section { name, lines } = std::mem::replace(capture, Capture::None) else {
        out.events.push(DegradeEvent::UnexpectedSchema {
            detail: format!("SECTION:{end_name}:END without a matching BEGIN"),
        });
        return;
    };
    if name != end_name {
        out.events.push(DegradeEvent::UnexpectedSchema {
            detail: format!("SECTION:{name}:BEGIN closed by SECTION:{end_name}:END"),
        });
    }
    store_section_body(name, &lines, out);
}

/// Put a captured SECTION body in its domain slot, or keep it as an unknown fragment. Shared
/// with the unclosed case: doc-4 §5 degrades the broken structure but keeps what was
/// discernible, and §4 requires an unknown SECTION's fragment to be retained either way.
fn store_section_body(name: String, lines: &[String], out: &mut Body) {
    let text = join_trimmed(lines);
    if !KNOWN_SECTIONS.contains(&name.as_str()) {
        out.events.push(DegradeEvent::UnexpectedSchema {
            detail: format!("unknown SECTION `{name}`"),
        });
        out.unknown_sections.push(UnknownSection {
            name,
            body: text.unwrap_or_default(),
        });
        return;
    }
    let slot = match name.as_str() {
        "DESCRIPTION" => &mut out.description,
        "PLAN" => &mut out.implementation_plan,
        "FINAL_SUMMARY" => &mut out.final_summary,
        _ => &mut out.implementation_notes,
    };
    *slot = text;
}

/// Store a finished AC block. Every non-blank line must be a `#N` item; anything else means
/// the numbering cannot be read (doc-4 §4).
fn finish_ac(capture: &mut Capture, out: &mut Body) {
    let Capture::Ac { lines } = std::mem::replace(capture, Capture::None) else {
        out.events.push(DegradeEvent::UnexpectedSchema {
            detail: "AC:END without a matching AC:BEGIN".to_string(),
        });
        return;
    };
    collect_ac_items(&lines, out);
}

fn collect_ac_items(lines: &[String], out: &mut Body) {
    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        match parse_ac_item(line) {
            Some(item) => out.acceptance_criteria.push(item),
            None => out.events.push(DegradeEvent::UnexpectedSchema {
                detail: format!("unreadable acceptance-criterion line: {}", line.trim()),
            }),
        }
    }
}

/// Store a finished DOD block. Same shape and same 存在時構造検査 as the AC block (doc-4 §4),
/// because the CLI writes both with the same code.
fn finish_dod(capture: &mut Capture, out: &mut Body) {
    let Capture::Dod { lines } = std::mem::replace(capture, Capture::None) else {
        out.events.push(DegradeEvent::UnexpectedSchema {
            detail: "DOD:END without a matching DOD:BEGIN".to_string(),
        });
        return;
    };
    collect_dod_items(&lines, out);
}

fn collect_dod_items(lines: &[String], out: &mut Body) {
    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        match parse_ac_item(line) {
            Some(item) => out.definition_of_done.push(item),
            None => out.events.push(DegradeEvent::UnexpectedSchema {
                detail: format!("unreadable definition-of-done line: {}", line.trim()),
            }),
        }
    }
}

/// Store a finished COMMENTS block.
fn finish_comments(capture: &mut Capture, out: &mut Body) {
    let Capture::Comments { lines } = std::mem::replace(capture, Capture::None) else {
        out.events.push(DegradeEvent::UnexpectedSchema {
            detail: "COMMENTS:END without a matching COMMENTS:BEGIN".to_string(),
        });
        return;
    };
    collect_comments(&lines, out);
}

fn collect_comments(lines: &[String], out: &mut Body) {
    let (comments, unread) = parse_comments(lines);
    out.comments.extend(comments);
    if unread {
        out.events.push(DegradeEvent::UnexpectedSchema {
            detail: "a COMMENTS entry has no closing `---` delimiter".to_string(),
        });
    }
}

/// Report an open block at EOF or at the start of the next block, keeping what it captured.
/// The missing `END` is a structure failure, but the lines before it were still readable, and
/// dropping them would lose exactly the content doc-4 §5 says to keep.
fn close_dangling(capture: &mut Capture, out: &mut Body) {
    match std::mem::replace(capture, Capture::None) {
        Capture::Section { name, lines } => {
            out.events.push(DegradeEvent::UnexpectedSchema {
                detail: format!("SECTION:{name}:BEGIN is never closed"),
            });
            store_section_body(name, &lines, out);
        }
        Capture::Ac { lines } => {
            out.events.push(DegradeEvent::UnexpectedSchema {
                detail: "AC:BEGIN is never closed".to_string(),
            });
            collect_ac_items(&lines, out);
        }
        Capture::Dod { lines } => {
            out.events.push(DegradeEvent::UnexpectedSchema {
                detail: "DOD:BEGIN is never closed".to_string(),
            });
            collect_dod_items(&lines, out);
        }
        Capture::Comments { lines } => {
            out.events.push(DegradeEvent::UnexpectedSchema {
                detail: "COMMENTS:BEGIN is never closed".to_string(),
            });
            collect_comments(&lines, out);
        }
        Capture::None | Capture::References => {}
    }
}

/// Read a `COMMENTS` block's lines into entries, and say whether anything was left unread.
///
/// **Two forms reach here, and which one applies is decided by the block, not by the entry** —
/// the CLI takes the `COMMENT` marker form for the whole block as soon as one opening marker
/// appears anywhere in it, and the `---`-delimited form otherwise (measured on v1.49.3,
/// 2026-08-17). Deciding per entry would read a mixed block in a way the writer never produces
/// and the CLI never reads.
fn parse_comments(lines: &[String]) -> (Vec<Comment>, bool) {
    if lines.iter().any(|line| {
        matches!(
            marker(line).and_then(parse_marker),
            Some(Marker::CommentBegin)
        )
    }) {
        (parse_marked_comments(lines), false)
    } else {
        parse_delimited_comments(lines)
    }
}

/// The form v1.49.3 writes: header lines, `---`, body, `---`, repeated.
fn parse_delimited_comments(lines: &[String]) -> (Vec<Comment>, bool) {
    let is_delimiter = |line: &String| line.trim() == COMMENT_DELIMITER;
    let mut out = Vec::new();
    let mut rest = lines;
    loop {
        let start = rest.iter().position(|line| !line.trim().is_empty());
        let Some(start) = start else {
            return (out, false);
        };
        rest = &rest[start..];
        let Some(open) = rest.iter().position(is_delimiter) else {
            return (out, true);
        };
        let header = &rest[..open];
        let body_lines = &rest[open + 1..];
        let Some(close) = body_lines.iter().position(is_delimiter) else {
            return (out, true);
        };
        // An entry whose body is blank is not an entry. The CLI drops it rather than showing a
        // comment with nothing in it, and a reader that kept it would report one more comment
        // than `backlog task <id> --plain` does for the same file.
        if let Some(body) = join_trimmed(&body_lines[..close]) {
            let (author, created) = comment_header(header);
            out.push(Comment {
                author,
                created,
                body,
            });
        }
        rest = &body_lines[close + 1..];
    }
}

/// The form v1.49.3 reads but does not write: `COMMENT:BEGIN` … `COMMENT:END` around each
/// entry, whose header is separated from its body by a blank line rather than by `---`.
fn parse_marked_comments(lines: &[String]) -> Vec<Comment> {
    let mut out = Vec::new();
    let mut entry: Option<Vec<String>> = None;
    for line in lines {
        match marker(line).and_then(parse_marker) {
            Some(Marker::CommentBegin) => {
                entry = Some(Vec::new());
            }
            Some(Marker::CommentEnd) => {
                if let Some(entry) = entry.take() {
                    if let Some(comment) = marked_comment(&entry) {
                        out.push(comment);
                    }
                }
            }
            _ => {
                if let Some(entry) = entry.as_mut() {
                    entry.push(line.clone());
                }
            }
        }
    }
    out
}

fn marked_comment(lines: &[String]) -> Option<Comment> {
    let split = lines.iter().position(|line| line.trim().is_empty());
    let (header, body) = match split {
        // With no blank line the entry is all body: the header is optional, and taking the first
        // line for it would swallow a one-line comment.
        None => (&lines[..0], lines),
        Some(at) => (&lines[..at], &lines[at + 1..]),
    };
    let body = join_trimmed(body)?;
    let (author, created) = comment_header(header);
    Some(Comment {
        author,
        created,
        body,
    })
}

/// `author:` and `created:` out of a comment's header lines. Other `key: value` lines are the
/// CLI's to ignore and ours too — it matches `^([a-zA-Z_]+):` and skips what it does not know.
fn comment_header(lines: &[String]) -> (Option<String>, Option<String>) {
    let mut author = None;
    let mut created = None;
    for line in lines {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        // The CLI reads a header line as `^([a-zA-Z_]+):`, so a line that merely contains a colon
        // is body-ish text it skips. Accepting it here would take `see: below` for a field name.
        if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphabetic() || c == '_') {
            continue;
        }
        match key.to_ascii_lowercase().as_str() {
            // Whitespace runs collapse because the CLI collapses them when it writes the value,
            // so a reader that kept them would show a name the file cannot round-trip.
            "author" => author = collapse_whitespace(value),
            "created" => created = collapse_whitespace(value),
            _ => {}
        }
    }
    (author, created)
}

fn collapse_whitespace(value: &str) -> Option<String> {
    let collapsed = value.split_whitespace().collect::<Vec<_>>().join(" ");
    (!collapsed.is_empty()).then_some(collapsed)
}

/// `- [x] #3 text` → number 3, text, checked. `None` when the shape does not match.
fn parse_ac_item(line: &str) -> Option<AcceptanceCriterion> {
    let rest = line.trim().strip_prefix("- ")?;
    let (checked, rest) = if let Some(r) = rest.strip_prefix("[x]").or(rest.strip_prefix("[X]")) {
        (true, r)
    } else {
        (false, rest.strip_prefix("[ ]")?)
    };
    let rest = rest.trim_start().strip_prefix('#')?;
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
    let number = digits.parse::<u32>().ok()?;
    Some(AcceptanceCriterion {
        number,
        text: rest[digits.len()..].trim().to_string(),
        checked,
    })
}

fn is_references_heading(line: &str) -> bool {
    line.trim()
        .trim_start_matches('#')
        .trim()
        .eq_ignore_ascii_case("references")
}

/// The payload of a `- item` / `* item` bullet, ignoring anything else.
fn bullet_item(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let item = trimmed
        .strip_prefix("- ")
        .or_else(|| trimmed.strip_prefix("* "))?
        .trim();
    (!item.is_empty()).then(|| item.to_string())
}

/// Join captured lines and drop the blank padding Backlog writes around section bodies.
/// A section that held only blank lines becomes `None`, not `Some("")`.
fn join_trimmed(lines: &[String]) -> Option<String> {
    let text = lines.join("\n");
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_a_frontmatter_block() {
        let (yaml, body) = split_frontmatter("---\nid: TASK-1\n---\nbody\n").unwrap();
        assert_eq!(yaml, "id: TASK-1\n");
        assert_eq!(body, "body\n");
    }

    #[test]
    fn splits_crlf_and_bom_variants() {
        let (yaml, body) = split_frontmatter("\u{feff}---\r\nid: TASK-1\r\n---\r\nbody").unwrap();
        assert_eq!(yaml.trim(), "id: TASK-1");
        assert_eq!(body, "body");
        // `...` also terminates a YAML document.
        let (yaml, _) = split_frontmatter("---\nid: TASK-1\n...\nbody").unwrap();
        assert_eq!(yaml, "id: TASK-1\n");
    }

    #[test]
    fn rejects_missing_or_unterminated_fence() {
        // The two absences are told apart, because the reason a screen shows says which
        // (TASK-88, PR #71 [P2]): a file that never opened a fence is not one with a broken one.
        assert_eq!(
            split_frontmatter("no fence here\n"),
            Err(NoFrontmatter::NotOpened)
        );
        assert_eq!(
            split_frontmatter("---\nid: TASK-1\n"),
            Err(NoFrontmatter::NotClosed)
        );
    }

    #[test]
    fn empty_frontmatter_is_an_empty_mapping_not_an_error() {
        let value = parse_frontmatter("").expect("empty block should parse");
        assert!(value.is_mapping());
        let mut events = Vec::new();
        assert!(string_field(&value, "id", &mut events).is_none());
        // Absence of an optional field is normal and must not degrade (doc-4 §4).
        assert!(events.is_empty());
    }

    #[test]
    fn scalar_fields_accept_unquoted_numbers_and_bools() {
        let value = parse_frontmatter("title: 2026\nstatus: Done\nflag: true\n").unwrap();
        let mut events = Vec::new();
        assert_eq!(
            string_field(&value, "title", &mut events).as_deref(),
            Some("2026")
        );
        assert_eq!(
            string_field(&value, "status", &mut events).as_deref(),
            Some("Done")
        );
        assert_eq!(
            string_field(&value, "flag", &mut events).as_deref(),
            Some("true")
        );
        assert!(events.is_empty());
    }

    #[test]
    fn wrong_shaped_fields_degrade_only_themselves() {
        let value = parse_frontmatter("labels: ui\nordinal: nope\ntitle:\n  a: b\n").unwrap();
        let mut events = Vec::new();
        assert!(string_list_field(&value, "labels", &mut events).is_empty());
        assert!(int_field(&value, "ordinal", &mut events).is_none());
        assert!(string_field(&value, "title", &mut events).is_none());
        assert_eq!(events.len(), 3);
        assert!(events
            .iter()
            .all(|e| matches!(e, DegradeEvent::UnexpectedSchema { .. })));
    }

    #[test]
    fn null_valued_fields_read_as_absent() {
        let value = parse_frontmatter("priority:\nlabels:\n").unwrap();
        let mut events = Vec::new();
        assert!(string_field(&value, "priority", &mut events).is_none());
        assert!(string_list_field(&value, "labels", &mut events).is_empty());
        assert!(events.is_empty());
    }

    #[test]
    fn parses_sections_and_acceptance_criteria() {
        let body = "\
## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
what it does
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 first
- [ ] #2 second
<!-- AC:END -->

<!-- SECTION:NOTES:BEGIN -->
notes body
<!-- SECTION:NOTES:END -->
";
        let parsed = parse_body(body);
        assert_eq!(parsed.description.as_deref(), Some("what it does"));
        assert_eq!(parsed.implementation_notes.as_deref(), Some("notes body"));
        assert!(parsed.implementation_plan.is_none());
        assert_eq!(parsed.acceptance_criteria.len(), 2);
        assert_eq!(parsed.acceptance_criteria[0].number, 1);
        assert!(parsed.acceptance_criteria[0].checked);
        assert_eq!(parsed.acceptance_criteria[1].text, "second");
        assert!(!parsed.acceptance_criteria[1].checked);
        assert!(parsed.events.is_empty());
    }

    #[test]
    fn unclosed_and_mismatched_pairs_are_structure_failures() {
        let unclosed = parse_body("<!-- SECTION:NOTES:BEGIN -->\nbody\n");
        assert_eq!(unclosed.events.len(), 1);
        assert!(matches!(
            unclosed.events[0],
            DegradeEvent::UnexpectedSchema { .. }
        ));

        let mismatched =
            parse_body("<!-- SECTION:NOTES:BEGIN -->\nbody\n<!-- SECTION:PLAN:END -->\n");
        assert_eq!(mismatched.events.len(), 1);

        let stray = parse_body("<!-- AC:END -->\n");
        assert_eq!(stray.events.len(), 1);
    }

    // Review round 1 [P2]: a missing END degrades the structure but must not cost the content
    // that was already readable (doc-4 §5 判別できたフィールドは活かし, §4 for unknown names).
    #[test]
    fn an_unclosed_block_keeps_what_it_captured() {
        let known = parse_body("<!-- SECTION:DESCRIPTION:BEGIN -->\nstill readable\n");
        assert_eq!(known.description.as_deref(), Some("still readable"));
        assert_eq!(known.events.len(), 1);

        let unknown = parse_body("<!-- SECTION:FUTURE:BEGIN -->\nfragment\n");
        assert_eq!(unknown.unknown_sections.len(), 1);
        assert_eq!(unknown.unknown_sections[0].body, "fragment");
        // Two events: the missing END, and the unknown SECTION name.
        assert_eq!(unknown.events.len(), 2);

        let ac = parse_body("<!-- AC:BEGIN -->\n- [x] #1 readable item\n");
        assert_eq!(ac.acceptance_criteria.len(), 1);
        assert!(ac.acceptance_criteria[0].checked);
        assert_eq!(ac.events.len(), 1);
    }

    #[test]
    fn unknown_section_is_kept_as_a_fragment_and_flagged() {
        let parsed = parse_body(
            "<!-- SECTION:FUTURE:BEGIN -->\nsomething new\n<!-- SECTION:FUTURE:END -->\n",
        );
        assert_eq!(parsed.unknown_sections.len(), 1);
        assert_eq!(parsed.unknown_sections[0].name, "FUTURE");
        assert_eq!(parsed.unknown_sections[0].body, "something new");
        assert_eq!(parsed.events.len(), 1);
    }

    #[test]
    fn unreadable_ac_numbering_degrades_but_keeps_readable_items() {
        let parsed =
            parse_body("<!-- AC:BEGIN -->\n- [ ] #1 fine\n- [ ] no number\n\n<!-- AC:END -->\n");
        assert_eq!(parsed.acceptance_criteria.len(), 1);
        assert_eq!(parsed.acceptance_criteria[0].number, 1);
        // The blank line is tolerated; only the numberless item is reported.
        assert_eq!(parsed.events.len(), 1);
    }

    #[test]
    fn collects_body_reference_bullets_until_the_next_heading() {
        let parsed = parse_body("## References\n\n- https://example.test/pull/1\n- notes.md\n\n## Other\n- not a reference\n");
        assert_eq!(
            parsed.references,
            vec![
                "https://example.test/pull/1".to_string(),
                "notes.md".to_string()
            ]
        );
    }

    // --- 説明の本文範囲 (decision-21) ------------------------------------------------------------

    fn described(body: &str) -> Option<&str> {
        description_span(body).map(|found| &body[found.range])
    }

    fn opener(body: &str) -> Option<DescriptionOpener> {
        description_span(body).map(|found| found.opener)
    }

    #[test]
    fn the_description_span_runs_from_the_heading_to_the_next_one() {
        // The shape `milestone add -d` writes (measured 2026-08-12): a plain heading, no SECTION.
        let body = "\n## Description\n\nfirst\nsecond\n\n## Notes\n\nkept\n";
        assert_eq!(described(body), Some("\nfirst\nsecond\n\n"));
    }

    #[test]
    fn the_description_span_runs_to_the_end_when_nothing_closes_it() {
        assert_eq!(described("\n## Description\n\nonly\n"), Some("\nonly\n"));
    }

    #[test]
    fn the_description_span_reports_which_shape_opened_it() {
        // The write is narrower than the read (decision-21): only the heading shape may be written
        // back into, so the opener has to reach the writer rather than be re-derived there.
        assert_eq!(
            opener("\n## Description\n\nonly\n"),
            Some(DescriptionOpener::Heading)
        );
        assert_eq!(
            opener("<!-- SECTION:DESCRIPTION:BEGIN -->\nheld\n<!-- SECTION:DESCRIPTION:END -->\n"),
            Some(DescriptionOpener::Section)
        );
    }

    #[test]
    fn the_description_span_accepts_the_section_pair_too() {
        // A task file's shape. Milestones are not written this way, but the reader accepts it, and
        // the range the writer replaces has to be the range the reader took (decision-21).
        let body = "<!-- SECTION:DESCRIPTION:BEGIN -->\nheld\n<!-- SECTION:DESCRIPTION:END -->\n\n## Notes\n";
        assert_eq!(described(body), Some("held\n"));
    }

    #[test]
    fn a_heading_inside_a_section_pair_does_not_end_the_span() {
        // Between the markers the closer is the END marker, not the next `##` — otherwise the same
        // body would read one way and be written back another.
        let body = "<!-- SECTION:DESCRIPTION:BEGIN -->\na\n## Inner\nb\n<!-- SECTION:DESCRIPTION:END -->\n";
        assert_eq!(described(body), Some("a\n## Inner\nb\n"));
    }

    #[test]
    fn a_body_without_a_description_has_no_span() {
        assert_eq!(described("\nloose prose\n\n## Notes\n"), None);
    }

    #[test]
    fn headings_inside_a_section_do_not_break_it() {
        let parsed = parse_body(
            "<!-- SECTION:NOTES:BEGIN -->\n## References\n- kept as body\n<!-- SECTION:NOTES:END -->\n",
        );
        assert!(parsed.references.is_empty());
        assert!(parsed
            .implementation_notes
            .as_deref()
            .unwrap()
            .contains("## References"));
        assert!(parsed.events.is_empty());
    }

    /// A task body exactly as v1.49.3 wrote it, with every section it can write present at once
    /// (measured 2026-08-17: `task create -d --plan --notes --ac --dod` then
    /// `task edit --final-summary`, `--comment`, `--comment --comment-author`).
    const EVERY_SECTION: &str = "\n\
## Description\n\
\n\
<!-- SECTION:DESCRIPTION:BEGIN -->\n\
desc body\n\
<!-- SECTION:DESCRIPTION:END -->\n\
\n\
## Acceptance Criteria\n\
<!-- AC:BEGIN -->\n\
- [ ] #1 first ac\n\
<!-- AC:END -->\n\
\n\
## Definition of Done\n\
<!-- DOD:BEGIN -->\n\
- [x] #1 first dod\n\
- [ ] #2 second dod\n\
<!-- DOD:END -->\n\
\n\
## Implementation Plan\n\
\n\
<!-- SECTION:PLAN:BEGIN -->\n\
plan body\n\
<!-- SECTION:PLAN:END -->\n\
\n\
## Implementation Notes\n\
\n\
<!-- SECTION:NOTES:BEGIN -->\n\
notes body\n\
<!-- SECTION:NOTES:END -->\n\
\n\
## Comments\n\
\n\
<!-- COMMENTS:BEGIN -->\n\
created: 2026-08-16 20:34\n\
---\n\
first comment\n\
---\n\
\n\
author: someone\n\
created: 2026-08-16 20:34\n\
---\n\
second comment\n\
---\n\
<!-- COMMENTS:END -->\n\
\n\
## Final Summary\n\
\n\
<!-- SECTION:FINAL_SUMMARY:BEGIN -->\n\
summary body\n\
<!-- SECTION:FINAL_SUMMARY:END -->\n";

    #[test]
    fn a_body_carrying_every_cli_written_section_degrades_nothing() {
        // The point of the whole task: normal CLI output must not raise 想定外スキーマ. Before
        // TASK-185, FINAL_SUMMARY raised one and DOD/COMMENTS were dropped without even that.
        let parsed = parse_body(EVERY_SECTION);
        assert_eq!(parsed.events.len(), 0, "{:?}", parsed.events);
        assert!(parsed.unknown_sections.is_empty());

        assert_eq!(parsed.description.as_deref(), Some("desc body"));
        assert_eq!(parsed.implementation_plan.as_deref(), Some("plan body"));
        assert_eq!(parsed.implementation_notes.as_deref(), Some("notes body"));
        assert_eq!(parsed.final_summary.as_deref(), Some("summary body"));

        assert_eq!(parsed.acceptance_criteria.len(), 1);
        assert_eq!(parsed.definition_of_done.len(), 2);
        assert_eq!(parsed.definition_of_done[0].number, 1);
        assert!(parsed.definition_of_done[0].checked);
        assert_eq!(parsed.definition_of_done[1].text, "second dod");
        assert!(!parsed.definition_of_done[1].checked);

        assert_eq!(parsed.comments.len(), 2);
        // `--comment` without `--comment-author` writes no author line at all.
        assert_eq!(parsed.comments[0].author, None);
        assert_eq!(
            parsed.comments[0].created.as_deref(),
            Some("2026-08-16 20:34")
        );
        assert_eq!(parsed.comments[0].body, "first comment");
        assert_eq!(parsed.comments[1].author.as_deref(), Some("someone"));
        assert_eq!(parsed.comments[1].body, "second comment");
    }

    #[test]
    fn final_summary_is_a_known_section_rather_than_an_unknown_fragment() {
        let parsed = parse_body(
            "<!-- SECTION:FINAL_SUMMARY:BEGIN -->\nwrapped up\n<!-- SECTION:FINAL_SUMMARY:END -->\n",
        );
        assert_eq!(parsed.final_summary.as_deref(), Some("wrapped up"));
        assert!(parsed.unknown_sections.is_empty());
        assert!(parsed.events.is_empty());
    }

    #[test]
    fn the_marker_form_of_comments_is_read_too() {
        // v1.49.3 parses this form and writes the other one, so a file can carry it (measured
        // 2026-08-17 by hand-writing it and reading the task back through the CLI).
        let parsed = parse_body(
            "<!-- COMMENTS:BEGIN -->\n\
<!-- COMMENT:BEGIN -->\n\
author: alice\n\
created: 2026-08-16 21:00\n\
\n\
marker-form comment\n\
<!-- COMMENT:END -->\n\
<!-- COMMENTS:END -->\n",
        );
        assert_eq!(parsed.comments.len(), 1);
        assert_eq!(parsed.comments[0].author.as_deref(), Some("alice"));
        assert_eq!(
            parsed.comments[0].created.as_deref(),
            Some("2026-08-16 21:00")
        );
        assert_eq!(parsed.comments[0].body, "marker-form comment");
        assert!(parsed.events.is_empty());
    }

    #[test]
    fn a_marked_comment_without_a_header_is_all_body() {
        let parsed = parse_body(
            "<!-- COMMENTS:BEGIN -->\n\
<!-- COMMENT:BEGIN -->\n\
just the body\n\
<!-- COMMENT:END -->\n\
<!-- COMMENTS:END -->\n",
        );
        assert_eq!(parsed.comments.len(), 1);
        assert_eq!(parsed.comments[0].author, None);
        assert_eq!(parsed.comments[0].body, "just the body");
    }

    #[test]
    fn a_colon_line_that_is_not_a_field_stays_in_the_body() {
        let parsed = parse_body(
            "<!-- COMMENTS:BEGIN -->\n\
author: bob\n\
---\n\
see: below\n\
and more\n\
---\n\
<!-- COMMENTS:END -->\n",
        );
        assert_eq!(parsed.comments.len(), 1);
        assert_eq!(parsed.comments[0].author.as_deref(), Some("bob"));
        assert_eq!(parsed.comments[0].body, "see: below\nand more");
    }

    #[test]
    fn unclosed_dod_and_comments_pairs_degrade_and_keep_what_was_read() {
        // 存在時構造検査 (doc-4 §4), the same verdict the SECTION and AC pairs already get.
        let dod = parse_body("<!-- DOD:BEGIN -->\n- [ ] #1 kept\n");
        assert_eq!(dod.definition_of_done.len(), 1);
        assert_eq!(dod.events.len(), 1);

        let comments = parse_body("<!-- COMMENTS:BEGIN -->\ncreated: x\n---\nkept\n---\n");
        assert_eq!(comments.comments.len(), 1);
        assert_eq!(comments.events.len(), 1);

        let stray = parse_body("<!-- DOD:END -->\n<!-- COMMENTS:END -->\n<!-- COMMENT:BEGIN -->\n");
        assert_eq!(stray.events.len(), 3);
    }

    #[test]
    fn an_unreadable_dod_line_degrades_without_taking_the_readable_ones() {
        let parsed =
            parse_body("<!-- DOD:BEGIN -->\n- [ ] #1 fine\n- [ ] no number\n<!-- DOD:END -->\n");
        assert_eq!(parsed.definition_of_done.len(), 1);
        assert_eq!(parsed.events.len(), 1);
        // The DOD failure names its own block, so a screen reporting it cannot say AC instead.
        let DegradeEvent::UnexpectedSchema { detail } = &parsed.events[0] else {
            panic!("expected 想定外スキーマ");
        };
        assert!(detail.contains("definition-of-done"), "{detail}");
    }

    #[test]
    fn trailing_text_with_no_delimiter_at_all_degrades() {
        // The other early return: content after the last entry that never opens a `---` pair. It is
        // a separate branch from the one below (that one *finds* the opener and loses the closer),
        // and without its own case a reader that dropped it silently would still pass.
        let parsed = parse_body(
            "<!-- COMMENTS:BEGIN -->\n\
created: x\n\
---\n\
first\n\
---\n\
loose text nobody delimited\n\
<!-- COMMENTS:END -->\n",
        );
        assert_eq!(parsed.comments.len(), 1);
        assert_eq!(parsed.events.len(), 1);
    }

    #[test]
    fn a_comments_entry_with_no_closing_delimiter_degrades() {
        let parsed = parse_body(
            "<!-- COMMENTS:BEGIN -->\n\
created: x\n\
---\n\
first\n\
---\n\
created: y\n\
---\n\
never closed\n\
<!-- COMMENTS:END -->\n",
        );
        assert_eq!(parsed.comments.len(), 1);
        assert_eq!(parsed.events.len(), 1);
    }

    #[test]
    fn an_empty_comments_block_is_normal() {
        // 不在は正常 (doc-4 §4): a block the CLI left empty must not degrade.
        let parsed = parse_body("<!-- COMMENTS:BEGIN -->\n<!-- COMMENTS:END -->\n");
        assert!(parsed.comments.is_empty());
        assert!(parsed.events.is_empty());
    }
}
