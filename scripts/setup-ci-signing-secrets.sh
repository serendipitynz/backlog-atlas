#!/usr/bin/env sh
# Register the GitHub Actions secrets a macOS runner needs to sign and notarize
# the build. The Apple account values (APPLE_ID / APPLE_PASSWORD /
# APPLE_TEAM_ID) are read from `.env.signing`; the certificate comes from a
# password-protected .p12 exported from Keychain Access, and
# APPLE_SIGNING_IDENTITY is derived from that .p12's certificate common name.
#
# Deriving the identity from the .p12 rather than copying `.env.signing`'s
# APPLE_SIGNING_IDENTITY is deliberate: local signing accepts a SHA-1 hash as
# the identity, but a CI runner imports the certificate and string-matches its
# common name against APPLE_SIGNING_IDENTITY — a hash there fails the build.
#
# No secret value is printed: each is piped straight into `gh secret set`.
#
# Usage:
#   ./scripts/setup-ci-signing-secrets.sh path/to/DeveloperID.p12
#
# Export the certificate first: Keychain Access > login > My Certificates >
# "Developer ID Application: <Name> (<TEAMID>)" > right-click > Export…, save as
# a .p12 and set an export password (you type it below).
#
# Prerequisites: `gh` authenticated for this repository and a filled-in
# `.env.signing` (see `.env.signing.example`).
set -eu

root=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
env_file="$root/.env.signing"
p12="${1:-}"

if [ -z "$p12" ]; then
  echo "usage: $0 path/to/DeveloperID.p12" >&2
  exit 1
fi
[ -f "$p12" ] || { echo "error: certificate '$p12' not found." >&2; exit 1; }
[ -f "$env_file" ] || {
  echo "error: $env_file not found — copy .env.signing.example and fill it in." >&2
  exit 1
}

# Six secrets are written one after another, so an unauthenticated `gh` would
# leave the repository holding a partial set. Check before writing any.
gh auth status >/dev/null 2>&1 || {
  echo "error: gh is not authenticated. Run 'gh auth login' first." >&2
  exit 1
}

# Load APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID without echoing them.
# (APPLE_SIGNING_IDENTITY is derived from the .p12 below, not from this file.)
set -a
# shellcheck source=/dev/null
. "$env_file"
set +a

for var in APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
  eval "value=\${$var:-}"
  [ -n "$value" ] || { echo "error: $var is empty in $env_file." >&2; exit 1; }
done

# Prompt for the .p12 export password with echo off.
printf 'Export password for %s: ' "$p12"
stty -echo 2>/dev/null || true
IFS= read -r p12_password
stty echo 2>/dev/null || true
printf '\n'

# Derive the signing identity from the certificate inside the .p12 so it always
# matches APPLE_CERTIFICATE. Try modern openssl first, then -legacy (OpenSSL 3
# needs it to read the ciphers Keychain exports use; LibreSSL ignores the retry).
# The export password is fed on stdin (-passin stdin), never on argv, so it stays
# out of process listings.
signing_identity=''
for legacy in '' '-legacy'; do
  signing_identity=$(
    printf '%s' "$p12_password" \
      | openssl pkcs12 $legacy -in "$p12" -passin stdin -nokeys -clcerts 2>/dev/null \
      | openssl x509 -noout -subject -nameopt multiline 2>/dev/null \
      | sed -n 's/^[[:space:]]*commonName[[:space:]]*=[[:space:]]*//p' \
      | head -1
  )
  [ -n "$signing_identity" ] && break
done
if [ -z "$signing_identity" ]; then
  echo "error: could not read the certificate from $p12 — wrong export password?" >&2
  exit 1
fi
case "$signing_identity" in
  "Developer ID Application:"*) : ;;
  *) echo "warning: the .p12 is not a 'Developer ID Application' certificate;" \
          "notarization will be rejected." >&2 ;;
esac

# APPLE_CERTIFICATE is the base64-encoded .p12; APPLE_SIGNING_IDENTITY is the
# certificate's common name; the rest come from .env.signing. Piping keeps every
# value off the argv list and out of the logs.
base64 < "$p12"                 | gh secret set APPLE_CERTIFICATE
printf '%s' "$p12_password"     | gh secret set APPLE_CERTIFICATE_PASSWORD
printf '%s' "$signing_identity" | gh secret set APPLE_SIGNING_IDENTITY
printf '%s' "$APPLE_ID"         | gh secret set APPLE_ID
printf '%s' "$APPLE_PASSWORD"   | gh secret set APPLE_PASSWORD
printf '%s' "$APPLE_TEAM_ID"    | gh secret set APPLE_TEAM_ID

echo "Registered signing secrets on $(gh repo view --json nameWithOwner -q .nameWithOwner)."
echo "Verify with: gh secret list"
