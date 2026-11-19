# Development workflow

## Hands-free changes

When the user requests a change, carry it through implementation, relevant checks, commits, and merge without stopping for intermediate approval. Preserve existing user work and keep the scope focused.

Start from the latest `main`. Create a focused branch and publish it as soon as it is created. Commit regularly with plain-English messages; do not use `feat:` or `fix:` prefixes. Open a PR into `main` and merge it as soon as required checks pass, without asking the user to accept it. Do not bypass required checks or repository protections. If PR creation is unavailable, merge verified work directly into `main` when the user has authorized that fallback; otherwise report the blocker.

## Production

`release` is production. Do not deploy feature branches or `main`. Promote `main` to `release` only when it is production-ready, through a PR from `main` to `release`, and merge after its required checks pass.

The branches intentionally differ. Before changing `Dockerfile`, `compose.yaml`, `.dockerignore`, `server/Program.cs`, or release-version files and documentation, compare the current contents and preserve production-specific behavior.
