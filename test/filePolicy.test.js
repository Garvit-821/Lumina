const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldIndexFile, shouldIndexDirectory, isSecretFile } = require('../out/rag/filePolicy');

test('secret files are never indexed', () => {
  for (const f of ['.env', '.env.local', '.env.production', 'server.pem', 'private.key', 'id_rsa', 'id_ed25519.pub', '.npmrc', 'credentials.json', 'service-account.json', 'secrets.yaml']) {
    assert.equal(isSecretFile(f), true, f);
    assert.equal(shouldIndexFile(f), false, f);
  }
});
