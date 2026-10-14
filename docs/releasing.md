# Publishing a release

1. Update `version` in `.claude-plugin/plugin.json`.
2. Write `docs/releases/v<version>.md` with the changes and installation/update instructions. If GitHub's latest release is older than the preceding tag, include the intervening changes too.
3. Run the checks shown in the README (Claude Code plugin tests, strict manifest validation, settings check, typecheck and translation check), then `python3 scripts/check-release.py v<version>`.
4. Commit the release files to the public `main` branch. Tag that commit with `v<version>` and push the branch and the tag.
5. Publish the release from its notes: `gh release create v<version> --verify-tag --latest --notes-file docs/releases/v<version>.md`.

The project has no GitHub Actions; every check runs locally before tagging. Plugin installation uses the marketplace's branch, so the tagged version must also be on public `main`. Never move an existing public version tag to a different commit.
