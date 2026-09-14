#!/bin/bash
# Claude Code 훅 스크립트 테스트 — 실행: bash scripts/hooks/test_hooks.sh
# Windows(Git Bash)에서 Claude Code가 넘기는 C:\ 형태 경로까지 검증한다.

HOOKS="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HOOKS/../.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -r "$TMP"' EXIT

pass=0; fail=0
check() { # $1=name $2=expected $3=actual
  if [ "$2" = "$3" ]; then
    pass=$((pass+1))
  else
    fail=$((fail+1)); echo "FAIL: $1 (expected=$2 actual=$3)"
  fi
}
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }

# --- tdd-guard.sh: 테스트 없는 구현 파일(.ts/.tsx/.js/.jsx)만 deny
P="$TMP/proj"
mkdir -p "$P/lib" "$P/types" "$P/app"
(cd "$P" && git init -q)
: > "$P/lib/calc.test.ts"
tdd() { # $1=file_path -> allow|deny
  jq -n --arg p "$1" '{tool_input:{file_path:$p}}' \
    | (cd "$P" && bash "$HOOKS/tdd-guard.sh") | grep -q '"deny"' && echo deny || echo allow
}
WP="$(winpath "$P")"
for B in "$P" "$WP"; do
  if [ "$B" = "$P" ]; then S='/'; else S='\'; fi
  check "tdd: allow when test exists [$S]" allow "$(tdd "$B${S}lib${S}calc.ts")"
  check "tdd: deny without test [$S]" deny "$(tdd "$B${S}lib${S}nocover.ts")"
  check "tdd: allow types/ [$S]" allow "$(tdd "$B${S}types${S}foo.ts")"
  check "tdd: allow Next.js page [$S]" allow "$(tdd "$B${S}app${S}page.tsx")"
  check "tdd: allow non-JS file [$S]" allow "$(tdd "$B${S}scripts${S}run.py")"
done

# --- block-dangerous.sh: 위험 명령은 exit 2(차단), 나머지는 exit 0
guard() { # $1=command -> block|allow|exit<N>
  jq -n --arg c "$1" '{tool_input:{command:$c}}' | bash "$HOOKS/block-dangerous.sh" >/dev/null 2>&1
  local code=$?
  case $code in 2) echo block ;; 0) echo allow ;; *) echo "exit$code" ;; esac
}
while IFS='|' read -r exp cmd; do
  [ -z "$exp" ] && continue
  check "guard: $exp '$cmd'" "$exp" "$(guard "$cmd")"
done <<'CASES'
block|rm -rf /tmp/x
block|rm -fr build
block|git push --force origin main
block|git push -f
block|git reset --hard HEAD~1
block|drop table users;
block|Remove-Item -Recurse -Force .\dist
block|Remove-Item .\dist -Force -Recurse
allow|ls -la
allow|rm file.txt
allow|git push origin main
allow|git push origin feature-f
allow|git reset --soft HEAD~1
allow|Remove-Item .\file.txt
CASES
check "guard: allow empty input" allow "$(printf '{}' | bash "$HOOKS/block-dangerous.sh" >/dev/null 2>&1 && echo allow || echo block)"
check "guard: explains block on stderr" yes \
  "$(jq -n '{tool_input:{command:"git reset --hard"}}' | bash "$HOOKS/block-dangerous.sh" 2>&1 >/dev/null | grep -q BLOCKED && echo yes || echo no)"

# --- stop-verify.sh: package.json 없으면 조용히 통과, 있으면 lint/build/test 실행
E="$TMP/empty"; mkdir -p "$E"
out=$(CLAUDE_PROJECT_DIR="$(winpath "$E")" bash "$HOOKS/stop-verify.sh" </dev/null 2>&1); code=$?
check "stop: exit 0 without package.json" 0 "$code"
check "stop: silent without package.json" "" "$out"
if command -v npm >/dev/null 2>&1; then
  N="$TMP/node"; mkdir -p "$N"
  printf '%s\n' '{"name":"t","private":true,"scripts":{"lint":"echo LINT_OK","build":"echo BUILD_OK","test":"echo TEST_OK"}}' > "$N/package.json"
  out=$(CLAUDE_PROJECT_DIR="$(winpath "$N")" bash "$HOOKS/stop-verify.sh" </dev/null 2>&1); code=$?
  check "stop: exit 0 when all pass" 0 "$code"
  check "stop: runs lint, build, test" yes \
    "$(grep -q LINT_OK <<<"$out" && grep -q BUILD_OK <<<"$out" && grep -q TEST_OK <<<"$out" && echo yes || echo no)"
  printf '%s\n' '{"name":"t","private":true,"scripts":{"lint":"exit 3","build":"echo BUILD_OK","test":"echo TEST_OK"}}' > "$N/package.json"
  CLAUDE_PROJECT_DIR="$(winpath "$N")" bash "$HOOKS/stop-verify.sh" </dev/null >/dev/null 2>&1; code=$?
  check "stop: nonzero when lint fails" nonzero "$([ "$code" -ne 0 ] && echo nonzero || echo zero)"
else
  echo "SKIP: npm not found — stop-verify npm cases skipped"
fi

# --- .claude/settings.json: 훅이 실제 스크립트를 가리키고 옛 인라인 방식이 남지 않았는지
SETTINGS="$ROOT/.claude/settings.json"
check "settings: valid JSON" yes "$(jq -e . "$SETTINGS" >/dev/null 2>&1 && echo yes || echo no)"
check "settings: no \$CLAUDE_TOOL_INPUT" 0 "$(grep -c CLAUDE_TOOL_INPUT "$SETTINGS")"
for s in tdd-guard.sh block-dangerous.sh stop-verify.sh; do
  check "settings: references $s" yes "$(grep -q "scripts/hooks/$s" "$SETTINGS" && echo yes || echo no)"
done
check "settings: guard covers Bash and PowerShell" yes \
  "$(jq -r '.hooks.PreToolUse[] | select(.hooks[].command | test("block-dangerous")) | .matcher' "$SETTINGS" | tr -d '\r' | grep -qx 'Bash|PowerShell' && echo yes || echo no)"

echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
