#!/usr/bin/env sh
# Build a macOS bundle that is signed with a Developer ID Application
# certificate and notarized by Apple.
#
# Credentials come from `.env.signing` (git-ignored; see `.env.signing.example`).
# With them exported, `pnpm tauri build` signs the .app with hardened runtime,
# submits it to Apple's notary service, and staples the ticket. Extra arguments
# are forwarded to the build, e.g.
#     ./scripts/macos-sign-build.sh --target universal-apple-darwin
#
# Tauri does NOT notarize the .dmg that wraps the .app: the CLI drives
# bundle_dmg.sh, that script takes a --notarize option, and the CLI's argument
# list does not pass it (read out of the shipped cli.darwin-arm64.node in
# @tauri-apps/cli 2.11.4). An un-notarized disk image is what a user downloads,
# so this script notarizes and staples each produced .dmg afterwards.
#
# Without `.env.signing` this script refuses to run — signing is its whole
# purpose. The plain `pnpm tauri build` remains the unsigned path and needs
# none of these values.
set -eu

root=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
env_file="$root/.env.signing"

if [ ! -f "$env_file" ]; then
  echo "error: $env_file not found." >&2
  echo "       Copy .env.signing.example to .env.signing and fill it in." >&2
  exit 1
fi

# Export every variable assigned in the env file so the build inherits them.
set -a
# shellcheck source=/dev/null
. "$env_file"
set +a

for var in APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
  eval "value=\${$var:-}"
  [ -n "$value" ] || { echo "error: $var is empty in $env_file." >&2; exit 1; }
done

# Resolve the identity before building. A release build takes minutes, and Tauri
# reports an unusable identity only once it reaches the signing step.
if ! security find-identity -v -p codesigning | grep -qF "$APPLE_SIGNING_IDENTITY"; then
  echo "error: APPLE_SIGNING_IDENTITY is not in the login keychain." >&2
  echo "       Listed identities:" >&2
  security find-identity -v -p codesigning >&2
  exit 1
fi

pnpm tauri build "$@"

# Notarize and staple every .dmg the build produced, covering both the default
# host-target path and an explicit --target path.
staple_dmgs() {
  found=0
  for dmg in \
    "$root"/src-tauri/target/release/bundle/dmg/*.dmg \
    "$root"/src-tauri/target/*/release/bundle/dmg/*.dmg; do
    [ -e "$dmg" ] || continue
    found=1
    if xcrun stapler validate "$dmg" >/dev/null 2>&1; then
      echo "Already stapled, skipping: $dmg"
      continue
    fi
    echo "Notarizing DMG: $dmg"
    xcrun notarytool submit "$dmg" \
      --apple-id "$APPLE_ID" \
      --password "$APPLE_PASSWORD" \
      --team-id "$APPLE_TEAM_ID" \
      --wait
    xcrun stapler staple "$dmg"
  done
  [ "$found" -eq 1 ] || echo "note: no .dmg found to notarize (targets may not include dmg)."
}

staple_dmgs

echo
echo "Verifying the produced bundles."
"$root/scripts/macos-verify-gatekeeper.sh"
