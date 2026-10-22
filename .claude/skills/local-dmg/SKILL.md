---
name: local-dmg
description: Merge the latest upstream main into this fork, build an unsigned arm64 macOS DMG, copy it to ~/Downloads, and open it. Use when the user says "merge in upstream and build a dmg", "rebuild the dmg", "build a local dmg", or "/local-dmg".
user-invocable: true
---

# Local DMG

This checkout is a fork (`origin` = ChrisjanWust/paseo, `upstream` = getpaseo/paseo). The user has no Developer ID certificate, so the DMG is ad-hoc signed.

## 1. Merge upstream

1. `git status`. If a merge is already in progress (`MERGE_HEAD` exists), finish it instead of starting a new one. If there are unrelated uncommitted changes, stop and ask.
2. `git fetch upstream --tags`, then `git merge upstream/main -m "Merge latest upstream main into fork main"`.
3. Resolve conflicts by keeping both sides: upstream's changes plus the fork's features. Take upstream's value when they changed the same line (for example, a default setting).
4. When upstream moved or rewrote the code a fork feature lives in, port the feature into the new layout (git's rename detection drops fork-only files in the new directory, but files upstream deleted come back as modify/delete conflicts). When upstream removed the library the feature is built on, delete the fork feature and its tests, and tell the user what was dropped.
5. Check the version. Upstream sometimes cuts releases from `release/X.Y.Z` branches, so the bump may not be on main yet. If `git tag --sort=-v:refname | head` shows a stable tag newer than `packages/desktop/package.json`'s version, merge that tag too. Otherwise the build gets an older version label and the auto-updater offers the official build. Beta tags sort above the stable tag of the same version; ignore them.

## 2. Install and verify

1. `npm install > /tmp/paseo-install.log 2>&1`. If it fails with `ENOTEMPTY`, run `rm -rf node_modules packages/*/node_modules` and install again. Don't retry over a half-failed install: it leaves packages like `expo-modules-core` missing files, and the Metro bundle fails later.
2. If `npm install` rewrote `package-lock.json`, check `git diff package-lock.json`. Stripped `"peer": true` lines and dropped `peerDependencies` blocks are local npm noise: run `git checkout -- package-lock.json`.
3. `npm run build:server`, then `npm run typecheck`. Without the rebuild, plugins typecheck against a stale `@getpaseo/plugin` dist.
4. If there were conflicts, run the test files next to what you resolved (`npx vitest run <file> --bail=1`). Fork tests that pin a whole persisted-state object break when upstream adds a field; add the field to the expectation.
5. `npm run lint`, then `npm run format:files -- <resolved files>`. If the merge had conflicts, commit it: the pre-commit hook runs lint, format, and typecheck. A clean merge commits itself without running the hook, so the checks above are its only check.

## 3. Build

Run in the background. It takes several minutes. Don't commit while it runs: the build rewrites workspace `dist` folders and the pre-commit typecheck fails on missing `@getpaseo/client` types.

```bash
rm -rf packages/desktop/release
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:desktop -- --mac dmg --arm64 --publish never \
  -c.mac.hardenedRuntime=false -c.mac.notarize=false > /tmp/paseo-build.log 2>&1
```

Keep hardened runtime off. With it on, the ad-hoc-signed app crashes at launch because dyld rejects Electron Framework ("different Team IDs"). Don't use `-c.mac.identity=null` either: it leaves an invalid bundle seal.

Check the result. `tail /tmp/paseo-build.log` should show the DMG target. `codesign -dvv packages/desktop/release/mac-arm64/Paseo.app` should show `flags=0x2(adhoc)` without `runtime`.

## 4. Deliver

Always put the DMG in `~/Downloads`. Name it with the commit so a rebuild at the same version doesn't overwrite an earlier one:

```bash
VERSION=$(node -p "require('./packages/desktop/package.json').version")
OUT=~/Downloads/Paseo-$VERSION-arm64-main-$(git rev-parse --short=9 HEAD).dmg
cp packages/desktop/release/Paseo-$VERSION-arm64.dmg "$OUT"
open "$OUT"
```

Report the version, the number of upstream commits merged, any conflicts and how you resolved them, any fork feature you dropped, and the DMG path. Don't push unless the user asks.
