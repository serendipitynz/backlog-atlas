/**
 * The English 文言表 (decision-35), declared against `Catalog` — which is `typeof ja`. A key missing
 * here, a key here that `ja.ts` does not have, and a parameter list that drifted from the Japanese
 * one are all `pnpm run check` failures. That is the first of decision-35 §4's two stages; the second
 * is `screen-text.test.ts`, which looks for Japanese still spelled in a source.
 *
 * **Translate the sentence, not the words.** Several Japanese entries state a thing Japanese says in
 * one clause and English says in two; where that happens the English entry is written as English
 * rather than as a gloss, and the Japanese one is left as the 正本 of what is being said.
 */
import { pluralize, type Catalog } from "../messages";

export const EN: Catalog = {
  action: {
    close: "Close",
    cancel: "Cancel",
    menu: "Menu",
    add: "Add",
    remove: "Remove",
    edit: "Edit",
    save: "Save",
    saving: "Saving…",
    savingNow: "A save is in progress",
    saveFailed: (detail: string) => `Could not save: ${detail}`,
    // The Japanese ends in an ellipsis because the control opens a picker; English says so with the
    // same convention.
    pick: "Choose…",
    reload: "Reload",
    backToSwimlane: "Back to the swimlane",
  },
  field: {
    titleRequired: "title (required)",
    titleRequiredReason: "title is required",
    projectRootRequired: "Project root (required)",
    backlogRootOptional: "Backlog root (optional)",
    slugOptional: "slug (optional)",
    pickHint: "Choose a folder",
    pickProjectRootTitle: "Choose the project root",
    pickBacklogRootTitle: "Choose the Backlog root",
    body: "Body",
    description: "Description",
    plainLabels: "Labels",
    addLabel: "New label",
    addCriterion: "New criterion",
    replacesWholeSet: "Saving replaces the whole set, existing entries included.",
    // Opens with `what`, which may be a translated word or a bare field name (`assignee`), so the
    // sentence takes no article — one that fitted the words here would not fit the identifiers.
    commaNotAllowed: (what: string, quoted: string) =>
      `${what} values cannot contain a comma: the whole set travels as one comma-separated value, ` +
      `so "${quoted}" would arrive as two entries`,
    labelWord: "label",
    tagWord: "tag",
  },
  state: {
    none: "None",
    loading: "Loading…",
    titleUnknown: "(title unknown)",
    statusUnknown: "status unknown",
    storageUnknown: "storage state unknown",
    typeUnset: "Type unset",
    typeUnknown: "Unknown Type",
    valueUnknown: " (unknown)",
    count: (n: number) => pluralize(n, { one: `${n} item`, other: `${n} items` }),
    nothingToSaveYet: "Nothing has changed yet",
    listSeparator: ", ",
    withDetail: (sentence: string, detail: string) => `${sentence} (${detail})`,
  },
  modal: {
    cannotPressNow: (reason: string) => `Not available right now: ${reason}`,
    issueConfirmCancel: "Cancel",
  },
  shell: {
    titleCountFailed: (detail: string) =>
      `The window title cannot show the total count (${detail})`,
    watchOffAll: "Continuous detection is off in the settings, so no row updates on its own",
    feedUnavailable: "Change notifications are not subscribed, so no row updates on its own",
    someRowsUnwatched: "Some rows have no change watching running",
    feedSubscribeFailed: (detail: string) => `Change notifications cannot be subscribed (${detail})`,
    settingsReadFailed: (detail: string) =>
      `The settings could not be read (${detail}). The defaults are in force.`,
    editorProbeFailed: (detail: string) => `The external editor could not be checked (${detail})`,
    cliProbeFailed: (detail: string) => `The Backlog CLI could not be checked (${detail})`,
    externalProbeFailed: (detail: string) => `The external commands could not be checked (${detail})`,
    watchStartFailed: (slug: string, detail: string) =>
      `${slug}: change watching cannot be started (${detail})`,
    ledgerBusy: "Please wait until the other registry update finishes.",
    reorderFailed: (detail: string) => `The rows could not be reordered: ${detail}`,
    projectUnidentified: "The target project cannot be identified",
    taskUnidentified: "The target task cannot be identified",
    transitionClosedDetail:
      "The transition was applied. Its storage division and ID change, so the detail panel was closed.",
    outOfFilter:
      " (the filter in force hides it, so no card is shown. Take the condition off in the filter bar to see it.)",
    taskCreated: (slug: string, column: string) =>
      `A task was created in ${slug}'s ${column} column.`,
    statusChanged: (taskId: string, status: string) => `${taskId}'s status is now ${status}.`,
    menuHint: (chord: string, shortcutHelp: string) =>
      `Menu (${chord}) — opens the shared entry points, ${shortcutHelp}, and each project's show/hide together`,
    dropAskLabel: "Choose the status to pass",
    dropAskLead: (taskId: string, column: string, declared: number) =>
      `Moving ${taskId} to the ${column} column. This column declares ${pluralize(declared, {
        one: `${declared} status`,
        other: `${declared} statuses`,
      })}.`,
    dropAskSelectLabel: "status to pass",
    dropAskConfirm: "Move with this status",
    dropAskWithdrawn:
      "This column no longer declares a status the drop could pass. Check what the re-read holds and try again.",
    rereadUnwatched: "Re-read those rows",
    noticeFull: "Full text",
    noticeClose: "Dismiss the notice",
    projectUnregistered:
      "This project is not registered (its registration may have been removed on another screen).",
    fatal: (detail: string) => `Loading failed: ${detail}`,
    noProjects: {
      lead: "No project is registered. Add one from",
      tail: "in the menu at the right end of the filter bar.",
    },
    detailGone: (path: string) =>
      `${path} is not in the current read result (it may have been deleted or moved, or its root may be unreadable).`,
    headerEntry: {
      register: {
        label: "Register a project",
        note: "Registers one project. A row is added at the end of the grid.",
      },
      settings: { label: "Settings", note: "Opens the app settings." },
    },
    shortcutHelpLabel: "Keyboard shortcuts",
    showAllProjectsLabel: "Show every project",
    showAllProjectsHeld: "Every project is already shown.",
    noProjectsRegistered: "No project is registered.",
    ledgerReadOnlyBand:
      "The registry file is read-only. Registry updates, unregistering and row reordering are unavailable " +
      "(documents, milestones and new tasks are unaffected).",
    cliChecking: "Checking the backlog CLI",
    cliUnavailable: "The backlog CLI executable cannot be resolved",
    cliUnsupported: (version: string, minimum: string) =>
      `backlog CLI ${version} is outside the confirmed range (${minimum} or later is required)`,
    cliDegradedBand: (summary: string) =>
      `${summary}. Creates and updates cannot be issued (registry updates are unaffected).`,
    unwatchedBand: (reason: string) => `${reason} (the view may be older than the files).`,
    discardConfirmQuestion: "There is unsaved input in the editor. Going on discards it.",
    discardConfirmProceed: "Discard and go on",
    discardConfirmClose: "Discard and close",
    discardConfirmKeep: "Back to editing",
  },
  swimlane: {
    reorderBlocked:
      "The registry file is read-only, so rows cannot be reordered. " +
      "The overview section of the project detail screen gives the reason.",
    rowFoldHint: "Row fold: folds this row's lane cells away, leaving each column's count on the row.",
    rowUnfoldHint: "Unfolds the row and brings its lane cells back.",
    columnFoldHint:
      "Column fold: folds this column in every row at once, leaving the column name (each row keeps its count).",
    columnUnfoldHint: "Unfolds the column and brings its cards back in every row.",
    // The noun is already in `name` — `columnHeadName` supplies it and `unmappedHeadName` supplies a
    // different one, so spelling it here again gave "Fold the To Do column column" and called the
    // 未分類区画 a column. Japanese does not hit this: there the operation has its own name (列折畳み).
    columnFoldLabel: (name: string, folded: boolean) =>
      folded ? `Unfold the ${name}` : `Fold the ${name}`,
    rowFoldLabel: (slug: string, folded: boolean) =>
      folded ? `Unfold the ${slug} row` : `Fold the ${slug} row`,
    columnHeadName: (label: string) => `${label} column`,
    unmappedHeadName: "Unmapped area",
    openProjectHint: (name: string) => `Opens the project detail screen for ${name}`,
    openProjectLabel: (slug: string) => `Open the project detail screen for ${slug}`,
    openProjectPlainHint: "Opens the project detail screen",
    visibleCount: (shown: number, total: number) =>
      `${shown} / ${pluralize(total, { one: `${total} task`, other: `${total} tasks` })}`,
    moveUpLabel: (slug: string) => `Move ${slug} up`,
    moveDownLabel: (slug: string) => `Move ${slug} down`,
    moveUpHint: "Move up in the display order",
    moveDownHint: "Move down in the display order",
    reread: "Re-read",
    rereadHint: "Re-read this root (change watching is not running, so it does not update on its own)",
    rootUnreadable: (detail: string) => `Root unreadable: ${detail}`,
    emptyCell: "No matching tasks",
    collapsedCellCount: (label: string, n: number) =>
      `${label} ${pluralize(n, { one: `${n} task`, other: `${n} tasks` })}`,
    collapsedCellBreakdown: (total: string, breakdown: string) => `${total} (${breakdown})`,
    priorityNone: "priority unset or unknown",
    rowFoldAbsent:
      "This row has no readable cell to fold, so it offers no row fold. " +
      "To take the row off the screen, use the project list in the header menu.",
    lastColumnHeld:
      "The last column standing cannot be folded: folding them all would leave a screen with no card readable in any column.",
    totals: (shownCards: string, shownLanes: string) => `Showing ${shownCards}${shownLanes}`,
    totalsCards: (shown: number, total: number) => `${shown} / ${total} cards`,
    totalsLanes: (shown: number, total: number) => ` · ${shown} / ${total} projects`,
    laneGroupCell: (label: string) => `the ${label} cell`,
    laneGroupUnmapped: (label: string) => `the ${label} section`,
    lanePosition: (position: number, total: number) => `${position} / ${total}`,
    laneAbsent:
      "This task is not on the swimlane as it now stands (its row is hidden, its root is unreadable, " +
      "or the filter takes it out), so there is no previous or next task to step to.",
    order: {
      priority_asc: "priority ascending",
      priority_desc: "priority descending",
      task_id_asc: "task id ascending",
      task_id_desc: "task id descending",
      updated_asc: "updated ascending",
      updated_desc: "updated descending",
      created_asc: "created ascending",
      created_desc: "created descending",
      milestone_asc: "milestone ascending",
      milestone_desc: "milestone descending",
    },
    unmapped: "Unmapped",
  },
  filter: {
    // Says more than the Japanese label does, because English has to put 横断タスクID somewhere the
    // placeholder no longer fits it (below) and this is the box's only other string. An `aria-label`
    // has no width, so the full term costs nothing here.
    textLabel: "Filter by cross-project task ID or title",
    // The control has no width of its own, so the room is the input's intrinsic one: 152px at
    // 1280x800, against 125px for this string and 152px for the "task"-carrying form it replaces,
    // which WebKit cut mid-word (measured 2026-08-16).
    textPlaceholder: "Cross-project ID / title",
    add: "+ Filter",
    removeToken: (name: string) => `Remove ${name}`,
    noStorageSelected: "No storage division is selected, so no cards are shown",
    undoLabel: "Undo the last one",
    undoHint: (chord: string) => `Removes the last condition you added (${chord})`,
    clearLabel: "Back to default",
    clearHint: "Takes every condition off and returns the storage divisions to their default",
    alreadyDefault: "The filter is already at its default.",
    nothingToUndo:
      "You have added no condition, so there is nothing to undo (the default storage divisions come off through each token's remove control).",
    orderLabel: "Order",
    popoverLabel: "Add a filter",
    searchCaption: "Search values",
    searchPlaceholder: "Value or attribute name",
    inconsistentOnly: "Inconsistent only",
    relativeFrom: "From now",
    relativeUnitLabel: "Unit to count back by",
    applyRelative: "Use as start",
    relativeRange: (max: number) => `Enter a whole number from 1 to ${max}`,
    noMatch: (query: string) => `No value matches “${query}”`,
    selectedCount: (n: number) => `${n} selected`,
    clearSearch: "Clear the search",
    facet: {
      storage: "Storage",
      type: "Type",
      label: "Label",
      priority: "priority",
      assignee: "assignee",
      text: "Text",
      inconsistent: "Inconsistent",
      updated: "updated period",
    },
    periodEnd: { from: "From", to: "To" },
    periodUnit: { day: "days", week: "weeks", month: "months" },
    periodBound: (day: string, end: "from" | "to") =>
      end === "from" ? `${day} onwards` : `up to ${day}`,
  },
  laneCreate: {
    open: "New",
    openLabel: (column: string) => `Create a task in the ${column} column`,
    openHint: (column: string) => `Creates a task in the ${column} column`,
    openBlocked: (column: string, reason: string) =>
      `The new-task input for the ${column} column is unavailable: ${reason}`,
    titleLabel: (column: string) => `title of the new task in the ${column} column`,
    create: "Create",
    createHint: "Creates a task in this cell",
    noCandidate: (column: string) => `${column} not declared`,
    noStatusToPass:
      "This column has no status to pass, so nothing is issued.",
  },
  projectRegister: {
    heading: "Register a project",
    readOnlyNotice:
      "The registry file's schema_version is newer than this build's, so it is open read-only. Registration is unavailable.",
    readOnlyPickReason:
      "The registry file is read-only, so choosing a folder would not let you register.",
    readOnlyBlocked: "The registry file is read-only, so no project can be registered.",
    busyBlocked: "A registry update is running. Registration cannot start until it finishes.",
    registered: (slug: string) => `${slug} is registered. The swimlane gains one row.`,
    backlogRootDefaultPlaceholder: "Defaults to <project root>/backlog",
    backlogRootHint: {
      lead: "If you leave this empty,",
      asBacklogRoot: "is taken as the Backlog root, and",
      conjunction: "and",
      tail: "are checked there.",
    },
    slugPlaceholder: "Lower-case letters, digits and hyphens",
    slugHint: {
      lead: "If you leave this empty,",
      tail: "is derived from the project root's name and used. Enter a different slug here to use another one.",
    },
    slugUnderivable:
      "No slug can be derived from the project root's name. Please enter one.",
    submit: "Register",
    submitting: "Registering…",
    submitHint: "Registers a project from what you entered",
    registering: "A registration is in progress",
    problem: {
      projectRootRequired: "Enter a project root.",
      projectRootEmpty: "The project root cannot be empty.",
      projectRootNotAbsolute: "Enter the project root as an absolute path.",
      backlogRootEmpty: "The Backlog root cannot be empty.",
      backlogRootNotAbsolute: "Enter the Backlog root as an absolute path.",
      slugTaken: (slug: string) => `slug ${slug} is already registered. Enter a different slug.`,
      slugGrammar: (slug: string) =>
        `slug ${slug} cannot be used. It must start with a lower-case letter or digit, and hold ` +
        "only lower-case letters, digits and hyphens after that (no colon and no space).",
      emptySlug: "(empty)",
      aliasKeyMissing: "The alias table has a row with no status name.",
      aliasKeyDuplicate: (key: string) =>
        `The alias table repeats the status ${key} (case and surrounding space are treated as the same).`,
      aliasValueNotCanonical: (key: string, value: string) =>
        `${key} maps to ${value}, which is not a canonical status column.`,
      aliasValueUnset: "(not chosen)",
    },
    refusal: {
      notARefusal: (detail: string) => `The registration cannot be updated: ${detail}`,
      readOnly: (schemaVersion: number) =>
        `The registry file's schema_version ${schemaVersion} is newer than this build can read, so ` +
        "the overwrite was refused (read-only). Registrations cannot change until Atlas is updated.",
      backlogRootInvalid: (path: string) =>
        `${path} cannot be read as a Backlog root (config.yml and tasks/ are required). ` +
        "Enter the Backlog root again.",
      slugNotFound: (slug: string) =>
        `There is no registration for slug ${slug} (it may have been removed on another screen). Reload the list.`,
      nonAbsoluteRoot: (path: string) => `${path} is not an absolute path. Enter an absolute path.`,
      duplicateRoot: (slug: string) =>
        `This project root or Backlog root is already registered under slug ${slug}. ` +
        "One project has one entry, so enter a different root or edit that entry.",
      invalidStatusAlias: (key: string, value: string, canonical: string) =>
        `The alias ${key} → ${value} is invalid. It must map to one of ${canonical}.`,
    },
  },
  taskDetail: {
    panelLabel: "Task detail",
    copyCrossId: "Copy the cross-project task ID",
    crossIdLabel: "Cross-project task ID",
    crossIdUnavailable:
      "The TASK-ID cannot be read, so no cross-project task ID can be built (unparsable).",
    copied: "The cross-project task ID is copied.",
    copyFailed: "Nothing could be written to the clipboard. Select the text below and copy it.",
    taskIdUnknown: "TASK-ID unknown",
    fileUnknown: "File unknown",
    previousTask: "To the previous task",
    nextTask: "To the next task",
    headEdge: "start",
    tailEdge: "end",
    atEdge: (group: string, edge: string) => `This is the ${edge} of ${group}`,
    withinGroup: (group: string, step: string) => `${step}, within ${group}`,
    positionUnknown: "Position in the swimlane unknown",
    placementGroup: "Detail placement",
    placementDefaultMark: "default",
    placementIsDefault: (label: string, mark: string) => `${label} (${mark})`,
    placementStoredElsewhere: (label: string) =>
      `The next start will open in "${label}" (that one is still the default).`,
    placementNotStored: (reason: string) =>
      `This placement could not be stored as the default (${reason}). It is in force for the current view.`,
    statusUnreadable: "status unreadable",
    canonicalUnmapped: "Canonical column unmapped",
    canonicalColumn: (label: string) => `Canonical column: ${label}`,
    configUndeclared: "Undeclared in config.yml",
    configNoStatuses: "config.yml declares no statuses",
    draftKnownStatus: "A status draft knows",
    storageTerm: "Storage division",
    unresolved: "Unresolved",
    saveWithChord: (chord: string) => `Save (${chord})`,
    transitionBusy: "An update is being issued. The next transition cannot start until it finishes.",
    unsavedWarn: (proceed: string) =>
      `There is unsaved input. Discarding it goes through the “${proceed}” confirmation first.`,
    externallyChanged:
      "This task's file changed outside Atlas while you were editing (version mismatch). Your input is kept as it is. " +
      "Saving goes through the pre-update conflict check.",
    saved: "Saved.",
    conflictStopped: (detail: string) =>
      `A pre-update conflict was detected, so the save was stopped without starting the CLI (${detail}). Your unsaved input is kept.`,
    conflictDiscard: "Re-read the latest and start over (discards the input)",
    conflictReapply: "Keep the input and re-apply it to the latest version",
    conflictReapplyNote:
      "Re-applying puts only the items you touched back on top of the latest version (the ones you did not touch stay as the latest has them). " +
      "Check the contents and save again.",
    postCheckMismatch: (fields: string[]) =>
      `The save was applied, but what was re-read does not match what was sent (${fields.join(", ")}). ` +
      "An external update may have landed between the end of the check and the end of the write.",
    postCheckNote:
      "An external update in that window cannot be prevented. If it was lost to the overwrite, its contents can be neither shown nor restored.",
    postCheckFresh: "What is shown is the latest content after the re-read. No unsaved input remains.",
    acknowledge: "Acknowledge (clears the inconsistency mark)",
    criteriaReordered:
      "The Acceptance Criteria are in a different order in the latest version, so the removals and checks you had pointed at by number were cancelled (the same number now points at another item). " +
      "Set them again if you still want them.",
    inconsistentHeading: "Inconsistencies",
    unknownSection: (name: string) => `Unknown section ${name} (kept as it is)`,
    addAssignee: "New assignee",
    done: "Done",
    notDone: "Not done",
    criteriaModeItems: "Per item (add, remove, check)",
    criteriaModeReplace: "Replace the whole set",
    toggleCriterion: (number: number, checked: boolean) =>
      checked ? `Mark #${number} not done` : `Mark #${number} done`,
    undoRemove: "Undo the removal",
    pendingAdd: (text: string) => `To be added: ${text}`,
    criteriaBodyNote:
      "An existing item's text cannot be changed per item (the CLI has no means of editing it). " +
      "Use the whole-set replacement to change the text.",
    addItem: "Add an item",
    replaceAllNote:
      "Saving deletes every existing item and recreates the ones listed here, in this order.",
    // Title Case because it is the managed file's own section heading (`## Implementation Plan`),
    // not a name this screen chose. Japanese has a separate 画面語 for it; English does not, so a
    // different casing would read as a different section from the one the file carries.
    planHeading: "Implementation Plan",
    notesHeading: "Implementation Notes",
    definitionOfDoneHeading: "Definition of Done",
    commentsHeading: "Comments",
    finalSummaryHeading: "Final Summary",
    commentCount: (count: number) => (count === 1 ? "1 comment" : `${count} comments`),
    commentAuthorUnknown: "No author recorded",
    commentCreatedUnknown: "No date recorded",
    notesReplace: "Replace (--notes)",
    notesAppend: "Append (--append-notes)",
    notesAppendLabel: "Implementation Notes (appended)",
    noPullRequests: "References carries no Pull Request URL",
    hostUnknown: "Host kind unknown",
    pullRequestNote:
      "Registering a Pull Request URL is an edit of References. Adding one to the References field below replaces the whole non-empty set, existing references included.",
    referenceMissing: "Reference missing",
    transitionsHeading: "Transitions",
    externalEditorHeading: "Open in an external editor",
    editor: {
      frontmatterNotice:
        "An external editor opens the task's Markdown file whole, frontmatter included. " +
        "Backlog.md does not check the structured fields — id, status, labels and the rest — while you edit " +
        "(breaking one shows as inconsistent).",
      watchStoppedNote:
        "Continuous detection is stopped for this root, so a save from an external editor does not arrive on " +
        'its own. When you are done, press "Re-read this root" below (reopening the task does not read it again).',
      rereadRoot: "Re-read this root",
      watchStoppedBeforeLaunch:
        "Nothing has been opened: this root turned out to have continuous detection stopped. " +
        "Read the notice above, then press again to open.",
      unsavedInputWarning:
        "There is unsaved input in Atlas. Editing the same task externally as well means editing it twice over. " +
        "The input is kept, but a save from the external editor is detected as an external change and Atlas's own " +
        "save then stops at pre-update conflict detection. Saving or cancelling first is recommended.",
      terminalCaveat:
        "A terminal-only editor (vim, nano and the like) draws nothing when started from a GUI. " +
        "Use the OS file association for those.",
      source: {
        appSettings: "the external editor set in the app settings",
        visual: "$VISUAL",
        editor: "$EDITOR",
      },
      openWithConfigured: (source: string, program: string) => `Open with ${source} (${program})`,
      openWithConfiguredAbsent: "Open with $EDITOR",
      openWithAssociation: "Open with the OS file association",
      associationMethod: "The OS file association",
      noConfigured:
        "Neither the app settings' external editor nor VISUAL nor EDITOR is set, so this method is not offered " +
        "(set one on the settings screen, set the environment variable and restart Atlas, or use the OS file association)",
      probePending: "The external editor is being checked",
      fileMissing:
        "This task's file is not in the current read result (it may have been moved or deleted outside Atlas). " +
        "There is nothing to name as the target, so no external editor can open it",
      filePlaceholder: "<this task's file>",
      launched: (how: string, command: string) => `${how} started it: ${command}`,
      unknownTaskFile: (path: string) =>
        `${path} is not a task file in the current read result, so nothing was started ` +
        "(it may have been moved or deleted outside Atlas). Open the task again.",
      launchFailed: (program: string, reason: string, fix: string) =>
        `${program} could not open it: ${reason}. ${fix}`,
      fixAssociation:
        "Check that the OS has an application registered for .md " +
        "(the app settings, $VISUAL and $EDITOR routes still work).",
      fixConfigured:
        "Check the app settings' external editor, VISUAL and EDITOR values (the program name and its options).",
    },
    gitHistoryHeading: "Git history",
    typeNotEditable:
      "Type cannot be edited on this screen. A value derived from a kind label is held by the read layer " +
      "with the prefix stripped, which is not guaranteed to match the original label text. A value derived " +
      "from the frontmatter type has no --type mapping in the update adapter. (Plain labels are editable.)",
    externalEditorRoute: '"Open in an external editor", at the foot of this screen',
    lastElementHeld: (field: string, route: string) =>
      `The last ${field} entry cannot be removed: the CLI has no way to write an empty set. ` +
      `To empty it, edit the management file directly from ${route}.`,
    emptyTitle:
      "title cannot be empty: it is required, and an empty one reads as unparsable and shows as inconsistent",
    noTaskIdForUpdate: "The TASK-ID cannot be read, so no update has a target to name",
    noTaskIdForUpdateUnparsed:
      "The TASK-ID cannot be read, so no update has a target to name (unparsable)",
    noStorageForUpdate: "The storage division cannot be determined, so updates are not offered",
    noEditSession: "No edit session is open",
    draftReadOnly: (route: string) =>
      "Editing a draft's content is not offered: the CLI has no way to edit it. " +
      `Promote it to a task, or edit the management file directly from ${route}.`,
    closedReadOnly: (route: string) =>
      "completed and archive tasks are read-only, because the CLI accepts no update for them. " +
      `To change one, edit the management file directly from ${route}.`,
    fileMissing:
      "This task's file is not in the current read result (it may have been moved or deleted outside Atlas). " +
      "No update can go through the CLI. The unsaved input is kept, so note down what you need before discarding it",
    readiness: {
      checking: "The backlog CLI is being checked",
      unavailable: (detail: string) =>
        `The backlog CLI executable cannot be resolved, so updates are not offered (${detail})`,
      unsupported: (version: string, minimum: string) =>
        `backlog CLI ${version} is outside the confirmed range, so updates are not offered (${minimum} or later is required)`,
    },
    commandFailed: (what: string, how: string, reloadNote: string, stderr: string) =>
      `${what} failed (${how})${reloadNote}: ${stderr}`,
    failureCause: {
      spawn: "could not be started",
      nonZero: (code: number | null) => `exit code ${code ?? "unknown"}`,
      timedOut: (seconds: number) =>
        pluralize(seconds, {
          one: `did not finish within ${seconds} second, so it was abandoned`,
          other: `did not finish within ${seconds} seconds, so it was abandoned`,
        }),
      write: "could not be written",
    },
    reloadNoteApplied: (completed: number) =>
      ` (${pluralize(completed, {
        one: `${completed} step`,
        other: `${completed} steps`,
      })} of this operation already went through, and the reload has been done)`,
    reloadNoteUnknown:
      " (whether this operation changed a management file is unknown; the reload has been done)",
    commandError: {
      cliUncheckable: "The backlog CLI cannot be checked",
      updateRejected: (detail: string) => `The update adapter refused before running: ${detail}`,
      uncheckableTarget: (what: string, detail: string) =>
        `Cannot be checked: ${what} has no defined way of matching the target of the rewrite, so it was ` +
        `refused without starting the CLI. No version divergence was observed. ${detail}`,
      reloadFailedNotApplied: (detail: string) =>
        `The reload failed (the update was not run): ${detail}`,
      reloadFailedApplied: (detail: string) =>
        `The update was applied but the reload failed. Do not retry the same operation: ${detail}`,
      versionProbeFailed: (detail: string) =>
        `The version read for pre-update conflict detection failed: ${detail}`,
      taskNotFound: (taskId: string) =>
        `${taskId} is not in the current read result (it may have been deleted or moved)`,
      projectNotOpen: (slug: string) => `Project ${slug} is not open`,
      unknownProject: (slug: string) => `Project ${slug} is not registered`,
      rootUnreadable: (detail: string) => `The root cannot be read: ${detail}`,
      unknownTaskFile: (path: string) =>
        `${path} is not a task file in the current read result (it may have been moved or deleted)`,
      editorUnavailable: (reason: string) => `The external editor cannot be started: ${reason}`,
      editorLaunchFailed: (program: string, reason: string) =>
        `${program} cannot be started: ${reason}`,
      settingsSaveFailed: (detail: string) => `The settings could not be saved: ${detail}`,
      historyCancelled: "The Git history read was cancelled by the screen",
      bodyLinkFailed: (reason: string) => `The link could not be opened: ${reason}`,
    },
    divergedTaskFile: "the task file (not found in the reload)",
    noTaskIdForTransition: "The TASK-ID cannot be read, so no transition has a target to name",
    noStorageForTransition:
      "The storage division cannot be determined, so transitions are not offered",
    noWayBackFromClosed:
      "The CLI has no operation that moves a task back from completed or archive, so none is offered",
    unsavedBeforeTransition: "There is unsaved input. Save or cancel it before running this",
    completableOnly: (status: string, current: string) =>
      `Available only while the status is ${status} (currently ${current})`,
    statusUnreadableShort: "unknown",
    transition: {
      draftPromote: {
        label: "Promote to task",
        effect: "the id is assigned afresh",
        question: "This draft will be promoted to a task. Its id is assigned afresh.",
        proceed: "Promote to task",
      },
      draftArchive: {
        label: "Archive",
        effect: "the id and the status are kept",
        question: "This draft will be archived. This cannot be undone.",
        proceed: "Archive",
      },
      taskDemote: {
        label: "Move back to drafts",
        effect: "the id is assigned afresh",
        question: "This task will be moved back to drafts. Its id is assigned afresh.",
        proceed: "Move back to drafts",
      },
      taskArchive: {
        label: "Archive",
        effect: "cannot be undone",
        question: "This task will be archived. This cannot be undone.",
        proceed: "Archive",
      },
      taskComplete: {
        label: "Clean up into completed",
        effect: "available only while the status is Done. Cannot be undone",
        question: "This task will be cleaned up into completed. This cannot be undone.",
        proceed: "Clean up into completed",
      },
    },
    undeclaredValue: (value: string) => `${value} (not declared in config.yml)`,
    milestoneNotInRoot: (id: string) => `${id} (not in this root)`,
  },
  projectDetail: {
    breadcrumbLabel: "You are here",
    section: {
      overview: "Overview",
      documents: "Documents",
      milestones: "Milestones",
      decisions: "Decisions",
      newTask: "New task",
    },
    issueBusy: "An issue is in progress",
    emptyValue: "(empty)",
    slugImmutable:
      "The slug is the left-hand side of every cross-project task ID, so it is referenced by every task " +
      "and no way to change it is offered. Using a different one means unregistering and registering " +
      "again, and the Git history view's identity is broken at that point.",
    rootMoveNote: (slug: string, backlogRoot: string) =>
      `This is treated as a move of the same project: slug ${slug} is kept and both project_root and ` +
      `backlog_root are sent. backlog_root is sent as ${backlogRoot}, what the field currently holds, ` +
      "not as the default <new root>/backlog. " +
      "Once the move goes through, any edit session open for this project is closed.",
    remoteAbsent: "No Git remote (this repository has none configured)",
    noRepository: "Not a Git target (the project root is not a Git repository)",
    remoteUnreadable: (detail: string) => `The remote cannot be read: ${detail}`,
    remoteRecordedAbsent:
      "The registration records no Git remote, which disagrees with what is detected now.",
    remoteRecordedPresent:
      "The registration records a Git remote, which disagrees with what is detected now.",
    redetect: "Detect again",
    redetecting: "Detecting…",
    redetectReadOnly: "The registry file is read-only, so the Git remote cannot be detected again.",
    aliasEffect: {
      declared: {
        label: "Declared",
        note: "This status is in config.yml's statuses. The alias takes effect.",
      },
      draft: {
        label: "Draft only",
        note: "config.yml does not declare it, but it is a known draft state. The alias takes effect.",
      },
      noDeclaredSet: {
        label: "No declared set",
        note:
          "config.yml declares no statuses at all, so whether this one is declared cannot be decided " +
          "(an uninitialised root declares none). Nothing contradicts the alias, so it takes effect.",
      },
      undeclared: {
        label: "Undeclared → no effect",
        note:
          "This status is declared nowhere. An alias for it leaves its tasks in the unmapped section. " +
          "It is not removed from the registration.",
      },
    },
    ledgerWriteInFlight:
      "A registration update is in progress. The root may change, so nothing can be issued until it finishes",
    overviewReadOnly:
      "The registry file's schema_version is newer than this build, so it is open read-only. " +
      "This section's inputs, its save and unregistering are all unavailable. " +
      "Documents, milestones and new tasks do not write the registry file, so those still work.",
    overviewReadOnlyBlocked: "The registry file is read-only, so the registration cannot be updated.",
    overviewBusy: "A registration update is in progress. Nothing else can start until it finishes.",
    overviewNoChanges: "Nothing has changed (there is no attribute to send).",
    overviewInputProblems: "The input has problems (see the note under each field).",
    unregisterScope:
      "Unregistering removes this project's registration and takes its row off the swimlane. " +
      "The project's own Backlog root, management files and Git repository are untouched. " +
      "The tasks stay as they are.",
    unregisterReadOnly: "The registry file is read-only, so this project cannot be unregistered.",
    unregisterConfirmSlug: (slug: string) =>
      `To confirm, type the slug "${slug}" into this field exactly. Nothing runs until it matches.`,
    docTitleEmpty: "title cannot be emptied (an empty one stops the file reading as a document)",
    divergedDocument: "the document (not found in the reload)",
    nameRequiredReason: "A name is required",
    renameRequiredReason: "A new name is required",
    renameUnchanged: "Same as the current name (nothing changes, so nothing is issued)",
    removeHandlingRequired: "Choose what happens to the referencing tasks",
    reassignTargetRequired: "A milestone to reassign to is required",
    reassignTargetIsSelf: "The reassignment target is the milestone being removed",
    removeMovesTheFile:
      "Removing does not delete the milestone's file: it moves it into `archive/milestones/` (measured)",
    keepLeavesDangling:
      'With "keep", the referencing tasks are left holding a milestone value that resolves to nothing',
    descriptionHeading:
      "A line of the description cannot start with `##`. The read takes everything up to the next `##` " +
      "as the description, so anything written past it is saved and never shown",
    descriptionUnchanged: "The description has not changed",
    taskCreateNote: "Add or edit the following after creation, by editing the task.",
    dependenciesField: "Dependencies",
    outcomeConflict: (detail: string) =>
      `${detail}. It was abandoned without starting the CLI (pre-update conflict). ` +
      "The latest has been re-read, so check the content and try again",
    sectionsLabel: "Sections",
    taskCount: (n: number) => `Tasks ${n}`,
    countUnreadable: "No count: the root cannot be read",
    toLane: "To this project's lane",
    sectionUnreadable:
      "The root cannot be read, so this section's list and its issuing are unavailable. Fix the root in the overview section " +
      "(the registry entry itself reads fine).",
    overviewHeading: "Overview (registry entry)",
    matchDefault: "Match the default",
    remoteName: (name: string) => `(${name})`,
    aliasLegend: "status alias table",
    aliasNote:
      "Maps this project's own statuses onto the canonical status columns. It is empty by default, and " +
      "Backlog.md's own four statuses match by name, so nothing needs setting for them.",
    aliasKeyPlaceholder: "The project's status",
    aliasInvalid: (value: string) => `${value} (invalid: not a canonical column)`,
    aliasRemoveByIndex: (index: number) => `Remove row ${index}`,
    aliasRemoveByKey: (key: string) => `Remove the ${key} row`,
    aliasRemoveHint: "Remove this row",
    aliasUncheckable: "The root cannot be read, so whether this alias applies cannot be decided",
    aliasAdd: "Add an alias",
    attributesHeading: "Attributes the save will send",
    attributesNone: "No change (there is no attribute to send).",
    before: "Before",
    after: "After",
    saveHint: "Writes the attributes listed above to the registry entry",
    unregisterHeading: "Unregister",
    unregisterConfirmLabel: "Confirm: type the slug",
    unregisterHint: "Removes this project's registration",
    unregister: "Unregister",
    moved: (slug: string) =>
      `${slug} was moved. The document and milestone editing sessions that were open were closed, ` +
      "because they rest on a read of the old root.",
    entryUpdated: (slug: string) => `${slug}'s registry entry is updated.`,
    remoteRedetected: (slug: string) => `${slug}'s Git remote was detected again.`,
    diverged: (fields: string[]) =>
      `The update was applied, but what was re-read does not match what was sent (${fields.join(", ")}). ` +
      "An external update may have landed between the end of the check and the end of the write. If it was " +
      "lost to the overwrite, its contents can be neither shown nor restored.",
    discardAndContinue: "Discard and continue",
    backToInput: "Back to the input",
    /**
     * **backlog.md uses both words, in different roles** (measured on the v1.50.1 clone): its side
     * navigation heads the file list `Documents (N)` and states `Documents unavailable`, while
     * `Documentation` is the route, the sidebar tooltip, and the section header the task modal draws
     * over the docs related to *one task*. This 区画 heads a list of the project's doc files with a
     * count under it, which is the first of those two roles — so `Documents`, and the count and the
     * per-item lines below keep the same noun.
     */
    documentsHeading: "Documents",
    documentsEmpty: "There are no documents.",
    documentsCount: (n: number) =>
      pluralize(n, { one: `${n} document`, other: `${n} documents` }),
    documentNew: "New document",
    documentNewHint: "Opens the document creation form",
    documentOpenHint: "Opens this document",
    documentEditOpenHint: "Opens this document for editing",
    documentIssuingBlocksOthers: (reason: string) =>
      `${reason}. No other document can be opened until it finishes.`,
    documentIssuingBlocksEdit: (reason: string) =>
      `${reason}. This document cannot be opened for editing until it finishes.`,
    documentUnsavedOnClose:
      "The document editor holds unsaved input. Closing the editor discards it.",
    documentUnsavedOnOpen: (id: string) =>
      `The document editor holds unsaved input. Opening ${id} discards it.`,
    documentUpdateHeading: (id: string) => `Update ${id}`,
    documentUpdate: "Update the document",
    documentCreateHeading: "Create new document",
    documentCreate: "Create the document",
    documentCreated: "The document is created.",
    documentUpdated: "The document is updated.",
    pickDocumentFirst: "Choose a document to edit",
    documentNotSelected: "No document is selected",
    bodyReplaceNote: "Saving replaces the body with the whole text shown here.",
    keepUnchanged: "— (leave unchanged)",
    pathLabel: "path (only when moving it)",
    pathUnreadable:
      "The current location cannot be read (this document is not in the latest read result).",
    pathCurrent: "Current location:",
    pathPlaceholder: "Empty leaves it unchanged",
    addTag: "New tag",
    docPathPlaceholder: "Sub-path under docs (optional)",
    cliDefault: "— (the CLI's default)",
    typeUnset: "type unset",
    tagsNone: "no tags",
    bodyEmpty: "There is no body.",
    editing: "Editing",
    unsaved: "Unsaved",
    unmappedFiles: (n: number) =>
      pluralize(n, { one: `${n} file that could not be mapped`, other: `${n} files that could not be mapped` }),
    milestonesHeading: "Milestones",
    milestonesEmpty: "There are no milestones.",
    milestonesCount: (n: number) =>
      pluralize(n, { one: `${n} milestone`, other: `${n} milestones` }),
    milestoneNew: "New milestone",
    milestoneNewHint: "Opens the milestone creation form",
    milestoneOpenHint: "Opens this milestone",
    milestoneEditOpenHint: "Opens this milestone for editing",
    milestoneIssuingBlocksOthers: (reason: string) =>
      `${reason}. No other milestone can be opened until it finishes.`,
    milestoneIssuingBlocksEdit: (reason: string) =>
      `${reason}. This milestone cannot be opened for editing until it finishes.`,
    milestoneUnsavedOnClose:
      "The milestone editor holds unsaved input. Closing the editor discards it.",
    milestoneUnsavedOnOpen: (id: string) =>
      `The milestone editor holds unsaved input. Opening ${id} discards it.`,
    milestoneEditHeading: (id: string) => `Edit ${id}`,
    milestoneCreateHeading: "Add milestone",
    milestoneCreate: "Create the milestone",
    milestoneCreated: "The milestone is created.",
    milestoneDescriptionSave: "Save the description",
    milestoneDescriptionUpdated: (id: string) => `${id}'s description is updated`,
    milestoneDescriptionPlaceholder: "No description",
    milestoneDescriptionEmpty: "There is no description.",
    milestoneNotSelected: "No milestone is selected",
    heldTasks: (n: number) =>
      pluralize(n, { one: `${n} task in it`, other: `${n} tasks in it` }),
    nameRequired: "Name (required)",
    rename: "Rename",
    renameNewName: "New name (required)",
    renameUpdatesTasks: "Update the tasks that reference it (clearing this passes --no-update-tasks)",
    renameNote: (id: string) =>
      `A rename does not change the id (${id}), so the only tasks actually rewritten are those whose milestone value is not the id.`,
    remove: "Delete",
    removeTasksLegend: "What happens to the tasks that reference it (required)",
    removeTasksClear: "Remove the milestone value (clear)",
    removeTasksKeep: "Keep it as it is (keep)",
    removeTasksReassign: "Reassign them to another milestone (reassign)",
    reassignTarget: "Reassign to (required)",
    chooseOne: "Please choose",
    archive: "Archive",
    archiveNote:
      "Moves the milestone's file into archive/milestones/. The tasks that reference it are not rewritten.",
    rewriteTargetsHeading: "What will be rewritten",
    rewriteTargets: (n: number) =>
      `${pluralize(n, { one: `${n} referencing task`, other: `${n} referencing tasks` })} will be rewritten too (reference-following rewrite).`,
    rewriteNone: "The tasks that reference it are not rewritten.",
    renamed: "The milestone is renamed.",
    removed: "The milestone is deleted.",
    archived: "The milestone is archived.",
    issueRename: "Issue the rename",
    issueRemove: "Issue the deletion",
    issueArchive: "Issue the archive",
    decisionsHeading: "Decisions",
    decisionsEmpty: "There are no decisions.",
    decisionsCount: (n: number) =>
      pluralize(n, { one: `${n} decision`, other: `${n} decisions` }),
    decisionOpenHint: "Opens this decision",
    decisionNotSelected: "No decision is selected",
    statusUnset: "status unset",
    dateUnset: "date unset",
    taskNewHeading: "New task",
    taskCreate: "Create the task",
    taskCreated: "The task is created.",
    taskNoteLabel: "Items that can be added after it is created",
    configDefaultStatus: "— (use the default status in config.yml)",
    unset: "— (unset)",
    labelNote:
      "Type (the kind label) is not handled here. A label is treated as one comma-separated value, " +
      "so a label containing “,” is not issued.",
  },
  mark: {
    reasonSeparator: " / ",
    divergedFiles: (files: string) => `Changed outside Atlas since the read: ${files}`,
    unreadFiles: (files: string) =>
      `Task files added since the read: ${files}` +
      " (the set to be rewritten may differ from the one read, so it cannot be matched)",
    versionUnverified: "The version to match against could not be established",
    managedFileNoun: {
      task: "task",
      milestone: "milestone",
      document: "document",
      decision: "decision",
    },
    unexpectedSchema: (detail: string) => `Unexpected schema: ${detail}`,
    danglingReference: (kind: string, target: string) => `Dangling reference: ${kind} ${target}`,
    unparseableFields: (fields: string) => `Unparsable: ${fields} cannot be read`,
    unparseableDetail: (detail: string) => `Unparsable: ${detail}`,
    unparseableAs: (noun: string) => `Unparsable: this file could not be read as a ${noun}`,
    preUpdateConflict: (detail: string) =>
      `Version mismatch: pre-update conflict — ${detail}. The save was stopped without starting the CLI`,
    postCheckConflict: (fields: string) =>
      `Version mismatch: post-check window notice — the reload does not match what was sent (${fields}). ` +
      "An external update inside the window may have been lost to the overwrite",
    inconsistentLabel: (reasons: string) => `Inconsistent: ${reasons}`,
    unwatchedLabel: "Detection stopped",
    unwatchedDetail:
      "Neither file watching nor the change-notification subscription is running, so external changes do not " +
      "reach the screen. The view may be older than the files, though the versions are not necessarily apart. " +
      "A reload reads the current content again.",
  },
  gitHistory: {
    reload: "Reload",
    reloadHint: "Fetches the Git history again",
    loadingReason: "A fetch is in progress",
    reloadWithheld: (reason: string) => `${reason}. Reloading is unavailable until it finishes.`,
    remainingCommits: (n: number) =>
      `${pluralize(n, { one: `${n} more commit`, other: `${n} more commits` })} (the full list is readable in the single full-width view)`,
    noCommits: "No matching commits (no commit in this repository carries the TASK-ID)",
    noRepository: (root: string) =>
      `No Git target: ${root} is not a Git repository, so neither local history nor Pull Request relations can be shown.`,
    unreadable: (detail: string) => `The Git history could not be read: ${detail}`,
    noTaskId: "The TASK-ID could not be read, so there is no key to search commits with.",
    relatedHeading: "Related Pull Requests",
    remoteAbsent:
      "No Git remote (the registry entry's Git remote attribute says “absent”), so no relations are resolved. " +
      "The local commit history above is still shown. The overview section of the project detail screen can fix this.",
    hostUndetermined:
      "The remote's host kind could not be determined, so relations are out of scope (an unsupported host, or the remote could not be read).",
    notRead: (detail: string) => `Relations have not been resolved (${detail}).`,
    expand: "Open in the full-width view →",
    commitCount: (n: number) => pluralize(n, { one: `${n} commit`, other: `${n} commits` }),
    noCommitsShort: "No matching commit",
    noRepositoryShort: (root: string) => `Not a Git target (${root} is not a Git repository)`,
    noTaskIdShort: "Not searched: the TASK-ID cannot be read",
    noTaskIdForRemote: "The remote host was not queried: the TASK-ID cannot be read",
    accountRelated: (n: number) =>
      `Resolved: related to ${pluralize(n, {
        one: `${n} commit`,
        other: `${n} commits`,
      })} of this task`,
    accountUnrelated: "Resolved: no shared commit (this PR holds none of this task's commits)",
    accountUnsupported:
      "Out of scope: the remote host kind could not be determined, so nothing was queried. " +
      "Atlas cannot reference this host, so this cause cannot be cleared.",
    accountFailed: (reason: string, remedy: string) =>
      `Cannot be checked: ${reason}. That means it cannot be checked right now, not that there is no relation. ${remedy}`,
    remedy: {
      toolMissing: "The lookup tool could not be started; installing gh clears this.",
      invalidReference:
        "This reference does not determine what to query; correcting the References URL clears this.",
      queryFailed:
        "The query ran and failed. It was authentication, permissions, a missing PR or the network, " +
        "and this result does not say which. A re-fetch sometimes clears it.",
      timedOut:
        "Nothing answered in time, so Atlas abandoned the query. This happens when the network or " +
        "GitHub is slow, and a re-fetch sometimes clears it.",
    },
    relationNoCommitList: "Related PRs: cannot be matched (the local commit list cannot be read)",
    relationNoUrls: "Related PRs: References carries no Pull Request URL",
    // No `pluralize`: the noun these count is carried by `relationCount` beside them, so the caveat
    // itself has no word that varies — calling it with two identical forms would only read as if it did.
    relationCaveatFailed: (n: number) => `${n} cannot be checked`,
    relationCaveatUnsupported: (n: number) => `${n} out of scope`,
    relationCount: (n: number) =>
      `Related PRs: ${pluralize(n, { one: `${n} PR`, other: `${n} PRs` })}`,
    relationCountWithCaveats: (n: number, caveats: string) =>
      `Related PRs: ${pluralize(n, { one: `${n} PR`, other: `${n} PRs` })} (${caveats})`,
    relationRemoteAbsent: "Related PRs: not resolved (no Git remote)",
    relationHostUndetermined: "Related PRs: out of scope (the remote host kind cannot be determined)",
    relationNotRead: (detail: string) => `Related PRs: not attempted (${detail})`,
  },
  shortcutHelp: {
    keyColumn: "Key",
    actionColumn: "Action",
    scopeColumn: "Where it works",
    scope: {
      bothScreens: "Swimlane and project detail",
      swimlane: "Swimlane only",
      overlay: "Inside a modal, menu or popover",
      modal: "Inside a modal",
      editPart: "Inside an editing part",
      laneCreate: "Inside a lane's new-task input",
    },
    assignment: {
      openRegister: { operation: "Register a project", preventsDefault: "The WebView's new window" },
      openSettings: { operation: "Settings", preventsDefault: null },
      toggleMenu: { operation: "Open or close the menu", preventsDefault: null },
      addFilter: {
        operation: "Add a filter (opens the value list)",
        preventsDefault: "Typing the f into the search box it opens",
      },
      undoFilter: {
        operation: "Take back the last filter condition",
        preventsDefault: "The history's Back",
      },
      closeOverlay: { operation: "Close the open layer", preventsDefault: null },
      cycleModalFocus: {
        operation: "Move to the next or previous control in the modal",
        preventsDefault: "Focus leaving the modal",
      },
      saveEditSession: {
        operation: "Submit from an editing part (saves an edit session, creates from a create form)",
        preventsDefault: "Entering a newline",
      },
      submitLaneCreate: { operation: "Create the lane's new task", preventsDefault: "Entering a newline" },
    },
  },
  editor: {
    aceFallback: (reason: string) =>
      `Ace could not be loaded, so editing continues in a plain textarea (the controls are the same): ${reason}`,
  },
  settings: {
    languageHeading: "Language",
    // Reads as the same kind of option as 表示テーマ's, which is what decision-35 asks of the pair.
    languageUnset: "Follow system setting",
    // Endonyms, identical to the Japanese catalog's — see the note there.
    languageName: { ja: "日本語", en: "English" },
    unrecorded: (name: string) => `${name} (not included in this build)`,
    heading: "Settings",
    loadingHint: "Loading the settings…",
    loadingReason: "The settings are still loading",
    themeHeading: "Theme",
    themeUnset: "Follow system setting",
    themeSchemeLight: "light",
    themeSchemeDark: "dark",
    themeName: (name: string, scheme: string) => `${name} (${scheme})`,
    themeNameDefault: (name: string, scheme: string) => `${name} (${scheme}, default)`,
    notReadYet: "The settings have not been read yet, so nothing was saved",
    cardDensityHeading: "Card detail",
    defaultStorageHeading: "Default storage divisions (the filter's starting value)",
    defaultPlacementHeading: "Default detail placement",
    defaultOrderHeading: "Default order",
    watchHeading: "Take external changes in by watching files (continuous detection)",
    watchToggle: "Use continuous detection",
    externalCommandsHeading: "External commands",
    externalCommandsHint: "Set the paths of the external commands Atlas uses.",
    probePending: "Checking",
    probeResolved: "Resolved",
    probeUnresolved: "Cannot be resolved",
    commandHelpLabel: (name: string) => `About ${name}`,
    editorHeading: "External editor",
    editorHint:
      "If a command is set here it is used; otherwise $VISUAL and $EDITOR are. " +
      "Write one argument per line (they are not passed through a shell, so spaces do not separate them). " +
      "Leaving it empty clears the setting.",
    editorProgramLabel: "Program",
    editorProgramPlaceholder: "/Applications/… or code",
    editorArgsLabel: "Arguments (one per line)",
    locationHeading: "File locations",
    cardDensity: {
      s: "S (ID, priority, marks, title on 1 line)",
      m: "M (＋ Type, title on 2 lines)",
      l: "L (＋ labels and assignee, title on 3 lines)",
    },
    cardDensityNote:
      "A task's state — inconsistent, storage division, unmapped-column status — is always shown.",
    detailPlacement: {
      sidebar: "Side-by-side sidebar",
      modal: "Centred modal",
      full: "Full-width single view",
    },
    storageIndeterminate: "indeterminate (a file outside the scanned places)",
    fileAbsent: "There is no settings file yet. The defaults are in force (saving creates one).",
    fileUnreadable: (detail: string) =>
      `The settings file could not be read (${detail}). The defaults are in force ` +
      "(saving rebuilds the file from them).",
    fileReadOnly: (version: number) =>
      `The settings file's schema_version ${version} is newer than this build understands, so it is ` +
      "read-only. The defaults are in force and saving is unavailable (the file is left alone).",
    saveRefusedNewer: (version: number) =>
      `The settings file's schema_version ${version} is newer than this build, so it is not ` +
      "overwritten (what a later build wrote is left intact).",
    externalCommandHelp: {
      backlog_cli:
        "Used to issue creates and updates. Without it, nothing can be issued at all (a band stands at the top of the screen).",
      git_cli:
        "Used to search commits and to detect the Git remote. Without it, registered projects are recorded as having no remote, " +
        "and Pull Request relation resolution stops silently as well.",
      gh_cli:
        "Used to resolve Pull Requests against commits. Without it, only that resolution is unavailable.",
    },
    programSource: {
      configured: "Set on this screen",
      subPackage: "Resolved from the npm layout",
      onPath: "Resolved from PATH",
    },
    probeUnlaunched: (reason: string) => `Could not be started (${reason})`,
    emptyStorageWarning:
      "With no storage division selected, no card is shown at startup (the filter can add them back).",
    watchOffNote:
      "With this off, a save from an external editor or another process does not reach the screen on its own " +
      '(a row\'s "Reload" reads it again). The reload after an update and manual reloads still work.',
    closeWithoutSaving: "Close without saving",
    save: "Save",
    noChanges: "Nothing has changed",
    openLocation: "Open the location",
    openLocationTitle:
      "Opens the folder holding the settings file and the registry file in the OS file manager (no file is selected).",
    openingLocation: "Opening now (waiting for the OS to answer).",
    locationAbsent:
      "That folder does not exist yet (saving the settings or registering a project creates it).",
    locationUnconfirmed: "Whether that folder exists could not be established.",
    openLocationFailed: (program: string, reason: string) => `${program} could not open it: ${reason}.`,
    openLocationUnavailable: (reason: string) => `The location could not be opened: ${reason}`,
    settingsFileTerm: "Settings file",
    ledgerFileTerm: "Registry file",
    discardHint: "Closes without writing",
    saveHint: "Writes the settings and closes",
  },
  failure: {
    editorUnavailable:
      "None of the app settings' external editor command, VISUAL or EDITOR is set",
    launch: {
      // The `SE_ERR_*` names are Win32 identifiers, so they read the same in both catalogs.
      shellExecute: {
        outOfMemory: "The OS is out of memory or resources",
        share: "Sharing violation (SE_ERR_SHARE)",
        associationIncomplete: "The file association is incomplete (SE_ERR_ASSOCINCOMPLETE)",
        ddeTimeout: "The DDE transaction timed out (SE_ERR_DDETIMEOUT)",
        ddeFail: "The DDE transaction failed (SE_ERR_DDEFAIL)",
        ddeBusy: "Another DDE transaction is in progress (SE_ERR_DDEBUSY)",
        noAssociation: "No application is associated with this file extension (SE_ERR_NOASSOC)",
        dllNotFound: "The associated DLL was not found (SE_ERR_DLLNOTFOUND)",
        unknown: (code: number) => `ShellExecuteW returned code ${code}`,
      },
      comInit: (hresult: string) =>
        `COM could not be initialised (CoInitializeEx returned HRESULT ${hresult})`,
      shellExecuteAbsent: "ShellExecuteW does not exist on this platform",
    },
    bodyLink: {
      schemeNotAllowed: "Only http:// and https:// links are opened",
      controlCharacter: "The URL contains a control character",
    },
    probe: {
      spawnFailed: (program: string) => `${program} could not be started`,
      exited: "It ran and failed",
      noResponse: "No response",
    },
    remoteRead: {
      gitUnavailable: "git could not be started",
      gitFailed: "git ran and failed",
      remoteUrlEmpty: (name: string) => `The URL of remote “${name}” could not be read`,
    },
    lookup: {
      toolMissing: "gh could not be started",
      invalidReference: (value: string) =>
        `The owner/repo in the Pull Request URL is not usable as a GitHub name (${value})`,
      queryFailed: "gh ran and failed",
      timedOut: (seconds: number) =>
        `gh did not answer within ${seconds} seconds, so the lookup was abandoned`,
    },
    milestoneDescribe: "Updating the milestone description",
  },
};
