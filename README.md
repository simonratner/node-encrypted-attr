# node-encrypted-attr

[![travis](http://img.shields.io/travis/simonratner/node-encrypted-attr/master.svg?style=flat-square)](https://travis-ci.org/simonratner/node-encrypted-attr) &nbsp;
[![npm](http://img.shields.io/npm/v/node-encrypted-attr.svg?style=flat-square)](https://www.npmjs.org/package/node-encrypted-attr) &nbsp;
[![license](https://img.shields.io/github/license/simonratner/node-encrypted-attr.svg?style=flat-square)](LICENSE)

Encrypted model attributes in your favourite ORM.

# Security model

* AES-256-GCM:
    * 96-bit random nonce
    * 128-bit authentication tag
* Additional authenticated data:
    * Key id: use different keys for different attributes (or different users),
      rotate keys over time without re-encrypting all data
    * Object id: prevent substitution of encrypted values

All keys should be 32 bytes long, and cryptographically random. Manage these
keys as you would any other credentials (environment config, keychain, vault).
Generate keys with:
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
app host, app-level vulnerabilities, or accidentally leaking sensitive data
into logs. It is also not a substitute for actually encrypting your backups,
sanitizing your input, et cetera.

# Install

```
npm install node-encrypted-attr
```

# Use

While this module can be used stand-alone to encrypt individual values (see
[tests](/test/encrypted-attr.spec.js)), it is designed to be wrapped into a
plugin or hook for your favourite ORM. Eventually, this package may include
such plugins for common ORMs, but for now, here's an example of integrating
with [thinky](https://github.com/neumino/thinky):

```js
const EncryptedAttributes = require('node-encrypted-attr')
const thinky = require('thinky')()
const _ = require('lodash')

let Model = thinky.createModel('Model', {})

Model.encryptedAttributes = EncryptedAttributes(['secret'], {
  keys: {
    k1: crypto.randomBytes(32).toString('base64') // use an actual key here
  },
  keyId: 'k1',
  verifyId: true
})

// Pre-save hook: encrypt model attributes that need to be encrypted.
Model.pre('save', function (next) {
  try {
    this.encryptedAttributes.encryptAll(this)
    process.nextTick(next)
  } catch (err) {
    process.nextTick(next, err)
  }
})

// Post-save hook: decrypt model attributes that need to be decrypted.
Model.post('save', function (next) {
  try {
    this.encryptedAttributes.decryptAll(this)
    process.nextTick(next)
  } catch (err) {
    process.nextTick(next, err)
  }
})

// Post-retrieve hook: ditto.
Model.post('retrieve', function (next) {
  try {
    this.encryptedAttributes.decryptAll(this)
    process.nextTick(next)
  } catch (err) {
    process.nextTick(next, err)
  }
})

// Optionally, add some helpers in case we need to set or read the value
// directly (such as an update query), without going through model hooks.
for (let attr of Model.encryptedAttributes.attributes) {
  Model.define(_.camelCase(`encrypted ${attr}`), function (val) {
    return Model.encryptedAttributes.encryptAttribute(this, val)
  }
}
```

# License

[MIT](LICENSE)
