const assert = require('node:assert/strict');
const test = require('node:test');

const {
  discoverBundleUrls,
  downloadAllBundles,
  getNumericEnumValue,
  parseBundleSources,
} = require('../index');

test('waits for the discovered URL set to stabilize', async () => {
  const snapshots = [
    ['https://static.whatsapp.net/a.js'],
    ['https://static.whatsapp.net/a.js', 'https://static.whatsapp.net/b.js'],
    ['https://static.whatsapp.net/a.js', 'https://static.whatsapp.net/b.js'],
    ['https://static.whatsapp.net/a.js', 'https://static.whatsapp.net/b.js'],
  ];
  const page = {
    evaluate: async () => snapshots.shift() ?? snapshots.at(-1),
  };

  const urls = await discoverBundleUrls(page, 'ignored', {
    timeoutMs: 1000,
    pollIntervalMs: 0,
    sleep: async () => {},
  });

  assert.deepEqual(urls, [
    'https://static.whatsapp.net/a.js',
    'https://static.whatsapp.net/b.js',
  ]);
});

test('fails when any discovered bundle cannot be downloaded', async () => {
  const page = {
    evaluate: async (_callback, url) =>
      url.endsWith('/missing.js') ? null : 'const ok = true;',
  };

  await assert.rejects(
    downloadAllBundles(page, [
      'https://static.whatsapp.net/ok.js',
      'https://static.whatsapp.net/missing.js',
    ], {
      attempts: 1,
      sleep: async () => {},
    }),
    /missing\.js/
  );
});

test('extracts negative enum values represented by unary expressions', () => {
  const node = {
    type: 'UnaryExpression',
    operator: '-',
    argument: { type: 'Literal', value: 1 },
  };

  assert.equal(getNumericEnumValue(node), -1);
});

test('parses bundles independently to avoid declaration collisions', () => {
  const modules = parseBundleSources([
    'const duplicate = 1;',
    'const duplicate = 2;',
  ]);

  assert.equal(modules.length, 2);
});
