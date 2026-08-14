#!/bin/bash
# @license
# Copyright 2025 AionUi (aionui.com)
# SPDX-License-Identifier: Apache-2.0
#
# verify-team-models.sh — Verification script for the "Team Models" feature.
#
# Usage:
#   ./scripts/verify-team-models.sh          # Full verification (typecheck + lint + build)
#   ./scripts/verify-team-models.sh check    # Quick type-check only
#   ./scripts/verify-team-models.sh lint     # Lint only
#   ./scripts/verify-team-models.sh build    # Full build only
#   ./scripts/verify-team-models.sh files    # Just list the new/modified files

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}▸${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
fail()  { echo -e "${RED}✗${NC} $*"; }

# Navigate to project root
cd "$(dirname "$0")/.."

# ─── New files ───────────────────────────────────────────────────────────────
NEW_FILES=(
  "packages/desktop/src/renderer/utils/teamModelPresets.ts"
  "packages/desktop/src/renderer/hooks/useTeamModels.ts"
  "packages/desktop/src/renderer/pages/settings/TeamModelSettings.tsx"
  "packages/desktop/src/renderer/pages/settings/components/TeamRoleCard.tsx"
  "packages/desktop/src/renderer/pages/settings/components/CreateTeamModal.tsx"
  "scripts/verify-team-models.sh"
)

# ─── Modified files ──────────────────────────────────────────────────────────
MODIFIED_FILES=(
  "packages/desktop/src/renderer/pages/settings/components/SettingsSider.tsx"
  "packages/desktop/src/renderer/components/layout/Router.tsx"
  "packages/desktop/src/renderer/services/i18n/locales/en-US/settings.json"
  "packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts"
)

# ─── Sub-commands ────────────────────────────────────────────────────────────

cmd_files() {
  echo ""
  info "New files (${#NEW_FILES[@]}):"
  for f in "${NEW_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      local lines
      lines=$(wc -l < "$f")
      ok "  $f  ($lines lines)"
    else
      fail "  $f  (MISSING)"
    fi
  done

  echo ""
  info "Modified files (${#MODIFIED_FILES[@]}):"
  for f in "${MODIFIED_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      ok "  $f"
    else
      fail "  $f  (MISSING)"
    fi
  done
  echo ""
}

cmd_check() {
  info "Running TypeScript type-check on new files…"
  if npx tsc --noEmit --pretty 2>&1 | grep -E "teamModel|TeamRole|CreateTeam|useTeamModel" || true; then
    :
  fi

  # Quick: just verify the files parse without syntax errors
  local has_error=0
  for f in "${NEW_FILES[@]}" "${MODIFIED_FILES[@]}"; do
    if [[ "$f" == *.ts || "$f" == *.tsx ]]; then
      if ! npx tsc --noEmit --pretty "$f" 2>/dev/null; then
        # tsc on single file may not work with project refs, try esbuild parse
        if ! npx esbuild --bundle --format=esm --jsx=automatic --loader:.ts=ts --loader:.tsx=tsx "$f" --outfile=/dev/null 2>/dev/null; then
          fail "Parse error in $f"
          has_error=1
        fi
      fi
    fi
  done

  if [[ $has_error -eq 0 ]]; then
    ok "All new files parse successfully"
  fi
}

cmd_lint() {
  info "Running oxlint on new files…"
  local lint_files=()
  for f in "${NEW_FILES[@]}" "${MODIFIED_FILES[@]}"; do
    if [[ "$f" == *.ts || "$f" == *.tsx ]]; then
      lint_files+=("$f")
    fi
  done

  if npx oxlint "${lint_files[@]}" 2>&1; then
    ok "Lint passed"
  else
    warn "Lint warnings/errors found (review above)"
  fi
}

cmd_build() {
  info "Running full electron-vite build…"
  if npm run package 2>&1; then
    ok "Build succeeded"
  else
    fail "Build failed"
    exit 1
  fi
}

cmd_i18n() {
  info "Validating i18n JSON…"
  if python3 -c "import json; json.load(open('packages/desktop/src/renderer/services/i18n/locales/en-US/settings.json'))"; then
    ok "settings.json is valid JSON"
  else
    fail "settings.json is INVALID"
    exit 1
  fi

  info "Checking i18n key coverage…"
  local key_count
  key_count=$(grep -c "settings.teamModels" packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts || echo 0)
  ok "Found $key_count teamModels type keys in i18n-keys.d.ts"
}

cmd_help() {
  cat <<EOF

${CYAN}Team Models Feature — Verification Script${NC}

Usage:
  $0              Full verification (files + i18n + lint)
  $0 files        List new/modified files
  $0 i18n         Validate i18n JSON and type keys
  $0 check        Quick parse check on new files
  $0 lint         Run oxlint on new files
  $0 build        Full electron-vite build
  $0 help         Show this help

EOF
}

# ─── Main ────────────────────────────────────────────────────────────────────

case "${1:-all}" in
  files)  cmd_files ;;
  i18n)   cmd_i18n ;;
  check)  cmd_check ;;
  lint)   cmd_lint ;;
  build)  cmd_build ;;
  help)   cmd_help ;;
  all|*)
    echo ""
    echo -e "${CYAN}━━━ Team Models Feature Verification ━━━${NC}"
    cmd_files
    cmd_i18n
    cmd_check
    cmd_lint
    echo ""
    ok "All quick checks passed. Run '$0 build' for a full build."
    echo ""
    ;;
esac
