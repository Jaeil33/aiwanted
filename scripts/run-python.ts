/**
 * 저장소의 .venv Python을 PYTHONUTF8=1, PYTHONPATH=pipeline으로 실행한다.
 * 사용: tsx scripts/run-python.ts -m pytest -q
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function resolvePython(
  root: string,
  platform: NodeJS.Platform,
  exists: (p: string) => boolean,
): string | null {
  const candidate =
    platform === 'win32'
      ? path.join(root, '.venv', 'Scripts', 'python.exe')
      : path.join(root, '.venv', 'bin', 'python');
  return exists(candidate) ? candidate : null;
}

export function pythonEnv(root: string, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const pipeline = path.join(root, 'pipeline');
  return {
    ...base,
    PYTHONUTF8: '1',
    PYTHONPATH: base.PYTHONPATH ? `${pipeline}${path.delimiter}${base.PYTHONPATH}` : pipeline,
  };
}

function run(args: string[]): number {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const python = resolvePython(root, process.platform, existsSync);
  if (!python) {
    const venvPython = process.platform === 'win32' ? '.venv/Scripts/python' : '.venv/bin/python';
    console.error(
      [
        'Python 가상환경(.venv)을 찾지 못했습니다. 저장소 루트에서 만드세요:',
        '  python -m venv .venv',
        `  ${venvPython} -m pip install -r pipeline/requirements-dev.txt`,
      ].join('\n'),
    );
    return 1;
  }
  const result = spawnSync(python, args, { cwd: root, env: pythonEnv(root, process.env), stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run(process.argv.slice(2)));
}
