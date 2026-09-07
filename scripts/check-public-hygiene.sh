#!/usr/bin/env bash
# Public-repository hygiene check.
#
# Everything in this repository is public: file contents, commit messages,
# author names and emails. This script blocks the things we once had to
# scrub from history so that history never needs rewriting again.
#
# Usage:
#   scripts/check-public-hygiene.sh                 # all commits reachable from HEAD + all tracked files
#   scripts/check-public-hygiene.sh --commit-msg F  # a commit message file + current user.email (commit-msg hook)
#
# Installed as a git hook by `npm ci` (see "prepare" in package.json), run in CI.
set -u

# Personal mailboxes must not appear as author or committer. Use the GitHub
# noreply address (<id>+<login>@users.noreply.github.com) or a tool's noreply.
PERSONAL_EMAIL_RE='@(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|protonmail|proton|aol)\.'

# Words and links that must not appear in commit messages or tracked files:
# tool session links and tracking trailers, the project's former working name,
# the private ops repository, personal account names, working-log phrasing.
# (The sibling app castconjure is public since 2026-09-07 and may be named.)
FORBIDDEN_RE='claude\.ai/code/session|Claude-Session:|same-spec|purankutonacount|the user explicitly|the user'"'"'s request|following the user'"'"'s'

# Credential shapes. Add new providers here when you add an integration.
SECRET_RE='sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}|xox[abp]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY|[A-Za-z0-9_]*(SECRET|TOKEN|PASSWORD|API_KEY)[A-Za-z0-9_]*\s*[:=]\s*["'"'"'][A-Za-z0-9_/+=-]{16,}'

# Files that are credentials by nature.
CREDENTIAL_FILE_RE='(^|/)\.env(\..*)?$|\.(pem|p12|pfx|key|jks|keystore)$|service[-_]?account.*\.json$|(^|/)credentials\.json$'
CREDENTIAL_FILE_ALLOW_RE='(^|/)\.env\.example$'

# Files exempt from the content scan (they contain the patterns on purpose).
EXEMPT=(':!scripts/check-public-hygiene.sh' ':!.githooks/*')

fail=0
err() { printf 'hygiene: %s\n' "$*" >&2; fail=1; }

check_email() {
  local e="$1" where="$2"
  if printf '%s' "$e" | grep -qiE "$PERSONAL_EMAIL_RE"; then
    err "$where uses a personal email ($e). Use your GitHub noreply address: git config user.email '<id>+<login>@users.noreply.github.com'"
  fi
}

check_message() {
  local text="$1" where="$2" hit
  hit=$(printf '%s' "$text" | grep -iE "$FORBIDDEN_RE" | head -1 || true)
  if [ -n "$hit" ]; then
    err "$where message contains a blocked reference: $hit"
  fi
}

if [ "${1:-}" = "--commit-msg" ]; then
  [ -n "${2:-}" ] && [ -f "$2" ] || { err "--commit-msg needs a message file"; exit 1; }
  check_message "$(grep -v '^#' "$2")" "commit"
  check_email "$(git config user.email || true)" "git config user.email"
  exit $fail
fi

# --- every commit reachable from HEAD -------------------------------------
while IFS=$'\t' read -r sha ae ce; do
  check_email "$ae" "commit ${sha:0:7} author"
  check_email "$ce" "commit ${sha:0:7} committer"
  check_message "$(git log -1 --format=%B "$sha")" "commit ${sha:0:7}"
done < <(git log --format='%H%x09%ae%x09%ce' HEAD)

# --- tracked files -----------------------------------------------------------
while read -r f; do
  err "credential-looking file is tracked: $f (add it to .gitignore and remove it from the index)"
done < <(git ls-files | grep -iE "$CREDENTIAL_FILE_RE" | grep -viE "$CREDENTIAL_FILE_ALLOW_RE" || true)

if out=$(git grep -n -I -E "$SECRET_RE" -- . "${EXEMPT[@]}" 2>/dev/null) && [ -n "$out" ]; then
  err "possible secret in tracked files:"; printf '%s\n' "$out" >&2
fi

if out=$(git grep -n -i -I -E "$FORBIDDEN_RE" -- . "${EXEMPT[@]}" 2>/dev/null) && [ -n "$out" ]; then
  err "blocked reference in tracked files:"; printf '%s\n' "$out" >&2
fi

if [ $fail -eq 0 ]; then
  echo "hygiene: ok ($(git rev-list --count HEAD) commits, $(git ls-files | wc -l | tr -d ' ') files)"
fi
exit $fail
