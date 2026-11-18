#!/usr/bin/env bash
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
temp_root=$(cd "${TMPDIR:-/tmp}" && pwd -P)
context=$(mktemp -d "$temp_root/lift-workflow-check.XXXXXXXX")
cleanup() {
  local resolved
  resolved=$(cd "$context" && pwd -P)
  case "$resolved" in
    "$temp_root"/lift-workflow-check.*) rm -rf -- "$resolved" ;;
    *) echo "Refusing to remove unexpected temporary directory: $resolved" >&2 ;;
  esac
}
trap cleanup EXIT

# Extract the release step itself so the check runs the same commands as CI.
awk '
  /^      - name: Merge main into release and push the release tag$/ { step=1; next }
  step && /^        run: \|$/ { script=1; next }
  script && /^      - name:/ { exit }
  script { print substr($0, 11) }
' "$repo_root/.github/workflows/release-creator.yml" > "$context/release-step.sh"
test -s "$context/release-step.sh"

git init --bare --initial-branch=main "$context/remote.git" >/dev/null
git clone --quiet "$context/remote.git" "$context/author"
(
  cd "$context/author"
  git config user.name 'Release test'
  git config user.email 'release-test@example.invalid'
  mkdir client
  printf '%s\n' 'main' > client/source.txt
  git add .
  git commit --quiet -m 'Create the main branch'
  git push --quiet origin main
  git switch --quiet -c release
  printf '%s\n' 'release only' > deployment.txt
  git add deployment.txt
  git commit --quiet -m 'Keep release settings'
  git push --quiet origin release
  git switch --quiet main
  printf '%s\n' 'first change' >> client/source.txt
  git commit --quiet -am 'Update main'
  git push --quiet origin main
)

for version in 1.2.3 1.2.4; do
  git clone --quiet --branch main "$context/remote.git" "$context/runner-$version"
  (
    cd "$context/runner-$version"
    RELEASE_VERSION=$version RELEASE_TAG="v$version" bash "$context/release-step.sh"
    test "$(git show "v$version:client/release-version.txt")" = "$version"
    test "$(git rev-parse "v$version^{commit}")" = "$(git rev-parse origin/release)"
    test "$(git show origin/release:deployment.txt)" = 'release only'
    git show origin/release:client/source.txt | grep -Fxq 'first change'
  )
done

echo 'Release workflow checks passed.'
