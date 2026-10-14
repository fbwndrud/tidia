# Publishing a release

1. Update `version` in `.claude-plugin/plugin.json`.
2. Write `docs/releases/v<version>.md` with the changes and installation/update instructions. If GitHub's latest release is older than the preceding tag, include the intervening changes too.
3. Run the checks shown in the README, then `python3 scripts/check-release.py v<version>`.
4. Commit the release files to the public `main` branch. Tag that commit with `v<version>` and push the tag.

The **Publish release** workflow checks that the tag matches the manifest, that release notes exist, and that translated documentation is consistent. It then publishes the release using those notes. It leaves an existing release unchanged and lets GitHub select the latest release by version order. Plugin installation still uses the marketplace's branch, so the tagged version must also be on public `main`.

For a tag whose release was missed, run the workflow manually with that existing tag. The tag must contain this workflow and the release-check script. Older tags can be published with `gh release create <tag> --verify-tag --notes-file <notes>`.

The workflow validates release metadata and documentation; run the Claude Code plugin tests, strict manifest validation, settings check and typecheck locally before tagging. Never move an existing public version tag to a different commit.

As of 2026-10-14, GitHub refuses to start this account's hosted runners because of a billing issue. The v0.1.27 workflow did not run its checks or publication step; the local checks passed and the release was published with `gh release create v0.1.27 --verify-tag --latest --notes-file docs/releases/v0.1.27.md`. Until the account restriction is resolved, use that manual path with the new version's notes after running the local checks.
