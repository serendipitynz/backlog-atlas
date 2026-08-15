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
import type { Catalog } from "../messages";

export const EN: Catalog = {
  settings: {
    languageHeading: "Language",
    // Reads as the same kind of option as 表示テーマ's, which is what decision-35 asks of the pair.
    languageUnset: "Follow system setting",
    // Endonyms, identical to the Japanese catalog's — see the note there.
    languageName: { ja: "日本語", en: "English" },
    languageUnrecorded: (name: string) => `${name} (not included in this build)`,
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
