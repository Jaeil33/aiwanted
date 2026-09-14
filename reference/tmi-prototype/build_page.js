'use strict';
// Inline page.css, data.json, engine.js, stage.js and app.js into one self-contained index.html for the artifact.
const fs = require('fs');
const path = require('path');

function buildPage(template, parts) {
  let html = template;
  for (const [marker, content] of Object.entries(parts)) {
    if (!html.includes(marker)) throw new Error(`missing marker ${marker}`);
    if (/<\/script/i.test(content)) throw new Error(`${marker} contains a closing script tag`);
    html = html.split(marker).join(content);
  }
  return html;
}

if (require.main === module) {
  const here = (name) => path.join(__dirname, name);
  const read = (name) => fs.readFileSync(here(name), 'utf8');
  const html = buildPage(read('page.html'), {
    '/*__CSS__*/': read('page.css'),
    '/*__DATA__*/': JSON.stringify(JSON.parse(read('data.json'))),
    '/*__ENGINE__*/': read('engine.js'),
    '/*__STAGE__*/': read('stage.js'),
    '/*__APP__*/': read('app.js'),
  });
  fs.writeFileSync(here('index.html'), html);
  console.log(`index.html ${Math.round(Buffer.byteLength(html) / 1024)} KB`);
}

module.exports = { buildPage };
