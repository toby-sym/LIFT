#!/usr/bin/env bash
set -euo pipefail

# Build from an archived checkout, as a deployment service would. The temporary
# version file is never written to the developer's working tree.
temp_root=$(cd "${TMPDIR:-/tmp}" && pwd -P)
context=$(mktemp -d "$temp_root/lift-version-check.XXXXXXXX")
tag="lift-release-version-check:$(date +%s)-$$"
cleanup() {
  docker image rm "$tag" >/dev/null 2>&1 || true
  local resolved
  resolved=$(cd "$context" && pwd -P)
  case "$resolved" in
    "$temp_root"/lift-version-check.*) rm -rf -- "$resolved" ;;
    *) echo "Refusing to remove unexpected temporary directory: $resolved" >&2 ;;
  esac
}
trap cleanup EXIT

git archive HEAD | tar -x -C "$context"

assert_version() {
  local expected=$1
  MSYS_NO_PATHCONV=1 docker run --rm "$tag" sh -c 'grep -R -F -q -- "$1" /src/client/dist/assets' sh "$expected"
}

docker build --quiet --target client-build --tag "$tag" "$context" >/dev/null
assert_version 'Development'

printf '%s\n' '987.654.321' > "$context/client/release-version.txt"
docker build --quiet --target client-build --tag "$tag" "$context" >/dev/null
assert_version '987.654.321'

docker build --quiet --target client-build --build-arg APP_VERSION=456.123.789 --tag "$tag" "$context" >/dev/null
assert_version '456.123.789'

echo 'Release version build checks passed.'
