#!/bin/bash
# Dangerous Command Guard — PreToolUse[Bash|PowerShell]
# 되돌리기 어려운 명령을 감지하면 차단한다.
# 입력은 stdin JSON의 .tool_input.command 이고, 차단은 반드시 exit 2 (exit 1은 경고만 남기고 실행됨).

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
# Windows jq.exe 출력의 CR 제거
COMMAND="${COMMAND//$'\r'/}"

if [ -z "$COMMAND" ]; then
  exit 0
fi

PATTERN='rm[[:space:]]+-(rf|fr)\b'
PATTERN+='|git[[:space:]]+push[[:space:]].*(--force|[[:space:]]-f\b)|git[[:space:]]+push[[:space:]]+-f\b'
PATTERN+='|git[[:space:]]+reset[[:space:]]+--hard'
PATTERN+='|drop[[:space:]]+table'
PATTERN+='|remove-item\b.*-recurse\b.*-force\b|remove-item\b.*-force\b.*-recurse\b'

if printf '%s' "$COMMAND" | grep -qiE "$PATTERN"; then
  echo "BLOCKED: 위험한 명령어가 감지되었습니다. 꼭 필요하면 사용자가 직접 실행하세요." >&2
  exit 2
fi

exit 0
