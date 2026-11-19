# Development workflow

## Hands-free changes

When the user requests a change, carry it through implementation, relevant checks, commits, and merge without stopping for intermediate approval. Preserve existing user work and keep the scope focused.

Start from the latest `main`. Create a focused branch with a `feature/`, `story/`, `fix/`, or `capability/` prefix, as appropriate, and publish it as soon as it is created. Never use a `codex/` prefix. Commit regularly with plain-English messages; do not use `feat:` or `fix:` prefixes. Run the relevant checks, then merge the branch directly into `main` without opening a PR or asking the user. Do not bypass required checks or repository protections; report a blocker if they prevent a direct merge.

## Production

`release` is production. Do not deploy feature branches or `main`. Promote `main` to `release` only when it is production-ready and its required checks pass. On every promotion from `main` to `release`, increment the patch component of the latest release version by one unless the user specifies another version. Use the latest release tag/version as the baseline and run the Release Creator workflow from `main` with the resulting version; it merges `main` into `release` and records the version and tag. Do not bump the version for feature branches or ordinary merges into `main`.

The branches intentionally differ. Before changing `Dockerfile`, `compose.yaml`, `.dockerignore`, `server/Program.cs`, or release-version files and documentation, compare the current contents and preserve production-specific behavior.
