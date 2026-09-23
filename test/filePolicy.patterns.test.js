const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldIndexFile, shouldIndexDirectory, isSecretFile } = require('../out/rag/filePolicy');

test('secret detection ignores letter case', () => {
  for (const f of ['.ENV', 'Server.PEM', 'ID_RSA', 'Credentials.JSON']) {
    assert.equal(isSecretFile(f), true, f);
  }
});
