import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pythonEnv, resolvePython } from './run-python';

const root = path.join('repo', 'tmi');
const winPython = path.join(root, '.venv', 'Scripts', 'python.exe');
const posixPython = path.join(root, '.venv', 'bin', 'python');

describe('resolvePython', () => {
  it('win32에서는 .venv/Scripts/python.exe를 쓴다', () => {
    const checked: string[] = [];
    const found = resolvePython(root, 'win32', (p) => {
      checked.push(p);
      return p === winPython;
    });
    expect(found).toBe(winPython);
    expect(checked).toEqual([winPython]);
  });

  it('win32가 아니면 .venv/bin/python을 쓴다', () => {
    expect(resolvePython(root, 'linux', (p) => p === posixPython)).toBe(posixPython);
    expect(resolvePython(root, 'darwin', (p) => p === posixPython)).toBe(posixPython);
  });

  it('인터프리터가 없으면 null을 돌려준다', () => {
    expect(resolvePython(root, 'win32', () => false)).toBeNull();
    expect(resolvePython(root, 'linux', () => false)).toBeNull();
  });

  it('다른 플랫폼의 인터프리터 경로로 대신하지 않는다', () => {
    expect(resolvePython(root, 'linux', (p) => p === winPython)).toBeNull();
    expect(resolvePython(root, 'win32', (p) => p === posixPython)).toBeNull();
  });
});

describe('pythonEnv', () => {
  const pipeline = path.join(root, 'pipeline');

  it('PYTHONUTF8=1을 넣고 기존 PYTHONPATH 앞에 pipeline을 붙인다', () => {
    const env = pythonEnv(root, { PATH: 'bin', PYTHONPATH: 'existing' });
    expect(env.PYTHONUTF8).toBe('1');
    expect(env.PYTHONPATH).toBe(`${pipeline}${path.delimiter}existing`);
    expect(env.PATH).toBe('bin');
  });

  it('PYTHONPATH가 없거나 비어 있으면 pipeline만 둔다', () => {
    expect(pythonEnv(root, {}).PYTHONPATH).toBe(pipeline);
    expect(pythonEnv(root, { PYTHONPATH: '' }).PYTHONPATH).toBe(pipeline);
  });

  it('받은 환경변수 객체는 바꾸지 않는다', () => {
    const base = { PYTHONPATH: 'existing' };
    pythonEnv(root, base);
    expect(base).toEqual({ PYTHONPATH: 'existing' });
  });
});
