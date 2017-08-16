# node-encrypted-attr

[![travis](http://img.shields.io/travis/simonratner/node-encrypted-attr/master.svg?style=flat-square)](https://travis-ci.org/simonratner/node-encrypted-attr) &nbsp;
[![npm](http://img.shields.io/npm/v/node-encrypted-attr.svg?style=flat-square)](https://www.npmjs.org/package/node-encrypted-attr) &nbsp;
[![license](https://img.shields.io/github/license/simonratner/node-encrypted-attr.svg?style=flat-square)](LICENSE)

Encrypted model attributes in your favourite ORM.

# Security model

* AES-256-GCM
* 96-bit random nonce
* 128-bit authentication tag
* Additional authenticated data:
    * Key id, allowing use of different keys for different attributes, or
      rotating keys over time without re-encrypting all data
    * [*Optional*] Object id, allowing to detect substitutions of encrypted
      values

All keys should be 32 bytes long, and cryptographically random. Manage these
keys as you would any other credentials (environment config, keychain, vault).

Best way to generate keys:
```
node -p "require('crypto').randomBytes(32).toString('base64')"
```

# Threat model

This is designed to protect you from leaking sensitive user data under very
specific scenarios:

* Full database dump
    * Misplaced unencrypted backups
    * Compromised database host
* Partial database dump
    * Query injection via unsanitized input

Specifically, this does *not* provide any protection in cases of a compromised
web app host, app-level vulnerabilities, or accidental leaks into persistent
logs. It is also in no way a substitute for actually encrypting your backups,
sanitizing all you input, et cetera.

# Install

```
npm install node-encrypted-attr
```

# Use

While this module can be used stand-alone to encrypt individual values (see
[tests](/test/)), it is designed to be wrapped in a plugin or hook for your
favourite ORM. Eventually, this package may include such plugins for common
ORMs, but for now, here's an example of integrating with [thinky](https://github.com/neumino/thinky):

## Thinky

```
const EncryptedAttributes = require('node-encrypted-attr')
const thinky = require('thinky')()
const _ = require('lodash')

let Model = thinky.createModel('Model', {})

Model.encryptedAttributes = EncryptedAttributes(['secret'], {
  keys: {
    k1: 'bocZRaBnmtHb2pXGTGixiQb9W2MmOtRBpbJn3ADX0cU='
  },
  keyId: 'k1'
})

// Pre-save hook: encrypt any model attributes that need to be encrypted.
Model.pre('save', function (next) {
  try {
    this.encryptedAttributes.encryptAll(obj)
    process.nextTick(next)
  } catch (err) {
    process.nextTick(next, err)
  }
})

// Post-save hook: decrypt any model attributes that need to be decrypted.
Model.post('save', function (next) {
  try {
    this.encryptedAttributes.decryptAll(obj)
    process.nextTick(next)
  } catch (err) {
    process.nextTick(next, err)
  }
})

// Post-retrieve hook: ditto.
Model.post('retrieve', function (next) {
  try {
    this.encryptedAttributes.decryptAll(obj)
    process.nextTick(next)
  } catch (err) {
    process.nextTick(next, err)
  }
})

// Optionally, add some helper methods in case you need to set or read a value
// directly, without going through model parser.
for (let attr of Model.encryptedAttributes.attributes) {
  Mode.define(_.camelCase(`encrypted ${attr}`), function (val) {
    return Model.encryptedAttributes.encryptAttribute(this, val)
  }
}
```

# License

[MIT](LICENSE)
