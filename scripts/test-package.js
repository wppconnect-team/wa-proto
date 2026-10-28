/*
 * Copyright 2026 WPPConnect Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'wpp-proto-package-'));
const npm = process.env.npm_execpath;
assert(npm && /npm-cli\.js$/.test(npm), 'Run using npm run test:package');
function run(args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 180000 });
  assert.equal(result.status, 0, result.stdout + result.stderr + (result.error?.message || ''));
  return result.stdout;
}
try {
  const packed = JSON.parse(run([npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', scratch], root))[0];
  const consumer = path.join(scratch, 'consumer');
  fs.mkdirSync(consumer);
  fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'proto-package-consumer', version: '0.0.0', private: true }));
  run([npm, 'install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', path.join(scratch, packed.filename)], consumer);
  const code = `const assert=require('node:assert/strict');const root=require('@wppconnect/wa-proto');const proto=Object.values(root).find(value=>value&&value.Message&&typeof value.Message.encode==='function');assert(proto,'Published Message codec missing');const bytes=proto.Message.encode({conversation:'package-regression'}).finish();assert.equal(proto.Message.decode(bytes).conversation,'package-regression');for(const name of ['puppeteer-real-browser','deepmerge','extract-zip']){assert.throws(()=>require.resolve(name),{code:'MODULE_NOT_FOUND'});}console.log('Published protocol roundtrip passed without development browser dependencies.');`;
  process.stdout.write(run(['-e', code], consumer));
} finally {
  assert.equal(path.dirname(path.resolve(scratch)), path.resolve(os.tmpdir()));
  fs.rmSync(scratch, { recursive: true, force: true });
}
