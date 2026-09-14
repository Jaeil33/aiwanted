#!/bin/bash
# Stop Hook — 응답이 끝날 때 lint → build → test 실행
# package.json이 없으면(프로젝트 스캐폴딩 전) 검증할 대상이 없으므로 조용히 건너뛴다.

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

if [ ! -f "$ROOT/package.json" ]; then
  exit 0
fi

cd "$ROOT" || exit 1
npm run lint 2>&1 && npm run build 2>&1 && npm run test 2>&1
