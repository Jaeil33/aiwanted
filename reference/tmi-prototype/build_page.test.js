'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPage } = require('./build_page.js');

test('inlines every marker, including repeats', () => {
  const html = buildPage('<style>/*__CSS__*/</style><script>/*__APP__*/</script>/*__CSS__*/', { '/*__CSS__*/': 'a{}', '/*__APP__*/': 'go()' });
  assert.equal(html, '<style>a{}</style><script>go()</script>a{}');
});

test('refuses a template that lacks a marker', () => {
  assert.throws(() => buildPage('<p></p>', { '/*__CSS__*/': 'a{}' }), /missing marker/);
});

test('refuses content that would close the inline script early', () => {
  assert.throws(() => buildPage('<script>/*__APP__*/</script>', { '/*__APP__*/': 'x = "</script>"' }), /closing script tag/);
});

test('inserts replacement patterns literally', () => {
  assert.equal(buildPage('/*__APP__*/', { '/*__APP__*/': "s.replace(/a/, '$&$1')" }), "s.replace(/a/, '$&$1')");
});
