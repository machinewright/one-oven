#!/usr/bin/env bash
# Publish to GitHub Pages (machinewright/one-oven): create the repo if missing, push main, enable Pages.
set -euo pipefail
cd "$(dirname "$0")/.."
OWNER=machinewright; REPO=one-oven
[ -z "$(git status --porcelain)" ] || { echo "uncommitted changes; commit first" >&2; exit 1; }
source ~/.nvm/nvm.sh >/dev/null 2>&1; node --test test/ >/dev/null || { echo "tests fail" >&2; exit 1; }
if ! gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  gh repo create "$OWNER/$REPO" --public --description "One oven, one dinner: a cooking-day planner that fits your oven, hob and hands, and says plainly where it has to compromise." \
    --homepage "https://$OWNER.github.io/$REPO/" --disable-wiki
fi
git push "https://github.com/$OWNER/$REPO.git" HEAD:main
gh api -X POST "repos/$OWNER/$REPO/pages" -f 'source[branch]=main' -f 'source[path]=/' >/dev/null 2>&1 || echo "(pages already enabled)"
echo "https://$OWNER.github.io/$REPO/"
