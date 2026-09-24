const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldIndexFile, shouldIndexDirectory, isSecretFile } = require('../out/rag/filePolicy');

test('secret detection ignores letter case', () => {
  for (const f of ['.ENV', 'Server.PEM', 'ID_RSA', 'Credentials.JSON']) {
    assert.equal(isSecretFile(f), true, f);
  }
});

test('names that merely contain env, key or secret are not secrets', () => {
  for (const f of ['env.d.ts', 'environment.ts', 'dotenv.ts', 'keymap.json', 'secretsanta.ts', 'secrets.md']) {
    assert.equal(isSecretFile(f), false, f);
  }
});

test('certificates and keystores are secrets', () => {
  for (const f of ['cert.crt', 'ca.cer', 'ca.der', 'store.jks', 'app.keystore', 'bundle.p12', 'client.pfx']) {
    assert.equal(isSecretFile(f), true, f);
  }
});

test('registry and auth dotfiles are secrets', () => {
  for (const f of ['.npmrc', '.pypirc', '.netrc', '.htpasswd']) {
    assert.equal(isSecretFile(f), true, f);
  }
});
