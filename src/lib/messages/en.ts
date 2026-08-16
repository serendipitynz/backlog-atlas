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
    saveFailed: (detail: string) => `Could not save: ${detail}`,
    // The Japanese ends in an ellipsis because the control opens a picker; English says so with the
    // same convention.
    pick: "Choose…",
    reload: "Reload",
    backToSwimlane: "Back to the swimlane",
  },
  field: {
    titleRequired: "title (required)",
    projectRootRequired: "Project root (required)",
    backlogRootOptional: "Backlog root (optional)",
    slugOptional: "slug (optional)",
    pickHint: "Choose a folder",
    pickProjectRootTitle: "Choose the project root",
    pickBacklogRootTitle: "Choose the Backlog root",
    body: "Body",
    description: "Description",
    plainLabels: "Labels",
    addLabel: "Label to add",
    addCriterion: "Acceptance Criterion to add",
    replacesWholeSet: "Saving replaces the whole set, existing entries included.",
  },
  state: {
    none: "None",
    loading: "Loading…",
    titleUnknown: "(title unknown)",
    statusUnknown: "status unknown",
    storageUnknown: "storage state unknown",
    typeUnset: "Type unset",
    valueUnknown: " (unknown)",
    count: (n: number) => pluralize(n, { one: `${n} item`, other: `${n} items` }),
  },
  modal: {
    cannotPressNow: (reason: string) => `Not available right now: ${reason}`,
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
    columnFoldLabel: (name: string, folded: boolean) =>
      folded ? `Unfold the ${name} column` : `Fold the ${name} column`,
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
  },
  filter: {
    textLabel: "Filter by text",
    textPlaceholder: "Cross-project task ID / title",
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
  },
  taskDetail: {
    panelLabel: "Task detail",
    copyCrossId: "Copy the cross-project task ID",
    crossIdLabel: "Cross-project task ID",
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
    inconsistentHeading: "Inconsistent",
    unknownSection: (name: string) => `Unknown section ${name} (kept as it is)`,
    addAssignee: "assignee to add",
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
    planHeading: "Implementation plan",
    notesHeading: "Implementation notes",
    notesReplace: "Replace (--notes)",
    notesAppend: "Append (--append-notes)",
    notesAppendLabel: "Implementation notes (appended)",
    noPullRequests: "References carries no Pull Request URL",
    hostUnknown: "Host kind unknown",
    pullRequestNote:
      "Registering a Pull Request URL is an edit of References. Adding one to the References field below replaces the whole non-empty set, existing references included.",
    referenceMissing: "Reference missing",
    transitionsHeading: "Transitions",
    externalEditorHeading: "Open in an external editor",
    gitHistoryHeading: "Git history",
  },
  projectDetail: {
    breadcrumbLabel: "You are here",
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
    documentCreateHeading: "Create a document",
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
    addTag: "Tag to add",
    docPathPlaceholder: "Sub-path under docs (optional)",
    cliDefault: "— (the CLI's default)",
    typeUnset: "type unset",
    tagsNone: "no tags",
    bodyEmpty: "There is no body.",
    stopEditing: "Stop editing",
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
    milestoneCreateHeading: "Create a milestone",
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
    configDefaultStatus: "— (leave it to config.yml's default status)",
    unset: "— (unset)",
    labelNote:
      "Type (the kind label) is not handled here. A label is treated as one comma-separated value, " +
      "so a label containing “,” is not issued.",
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
  },
  shortcutHelp: {
    keyColumn: "Key",
    actionColumn: "Action",
    scopeColumn: "Where it works",
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
