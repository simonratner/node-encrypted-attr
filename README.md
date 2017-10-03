# encrypted-attr

[![travis](http://img.shields.io/travis/simonratner/node-encrypted-attr/master.svg?style=flat-square)](https://travis-ci.org/simonratner/node-encrypted-attr) &nbsp;
[![npm](http://img.shields.io/npm/v/encrypted-attr.svg?style=flat-square)](https://www.npmjs.org/package/encrypted-attr) &nbsp;
[![license](https://img.shields.io/github/license/simonratner/node-encrypted-attr.svg?style=flat-square)](LICENSE)

Encrypted model attributes in your favourite ORM.

# Security model

* AES-256-GCM:
    * 96-bit random nonce
    * 128-bit authentication tag
* Additional authenticated data:
    * Key id: use different keys for different attributes (or different users),
      rotate keys over time without re-encrypting
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

* Full data dump
    * Misplaced unencrypted backups
    * Compromised database host
* Partial data dump
    * Query injection via unsanitized input

Specifically, this does *not* provide any protection in cases of a compromised
app host, app-level vulnerabilities, or accidentally leaking sensitive data
into logs. It is also not a substitute for actually encrypting your backups,
sanitizing your input, et cetera.

# Install

```
npm install encrypted-attr
```

# Use

While this module can be used stand-alone to encrypt individual values (see
[tests](/test/encrypted-attr.spec.js)), it is designed to be wrapped into a
plugin or hook for your favourite ORM. Eventually, this package may include
such plugins for common ORMs, but for now, here's an example of integrating
with [thinky](https://github.com/neumino/thinky):

```js
const EncryptedAttributes = require('encrypted-attr')
const thinky = require('thinky')()
const _ = require('lodash')

let Model = thinky.createModel('Model', {})

let encryptedAttributes = EncryptedAttributes(['secret', 'nested.secret'], {
  keys: {
    k1: crypto.randomBytes(32).toString('base64') // use an actual key here
  },
  keyId: 'k1',
  verifyId: true
})

// Pre-save hook: encrypt model attributes that need to be encrypted.
Model.docOn('saving', function (doc) {
  encryptedAttributes.encryptAll(doc)
})

// Post-save hook: decrypt model attributes that need to be decrypted.
Model.docOn('saved', function (doc) {
  encryptedAttributes.decryptAll(doc)
})

// Post-retrieve hook: ditto.
Model.on('retrieved', function (doc) {
  encryptedAttributes.decryptAll(doc)
})

// Optionally, add some helpers in case we need to set or read the value
// directly (such as an update query), without going through model hooks.
for (let attr of encryptedAttributes.attributes) {
  Model.define(_.camelCase(`encrypt ${attr}`), function (val) {
    return encryptedAttributes.encryptAttribute(this, val)
  })
  Model.define(_.camelCase(`decrypt ${attr}`), function (val) {
    return encryptedAttributes.decryptAttribute(this, val)
  })
}
```

And a usage example:

```js
async function storeSomeSecrets (doc) {
  await doc.merge({
    secret: 'red',
    nested: {
      hint: 'colour',
      secret: 'yellow'
    }
  }).save()

  console.log(await Model.get(doc.id))
  // {
  //   id: '543bed92-e241-4151-9d8f-1aa942c36d24',
  //   nested: {
  //     hint: 'colour',
  //     secret: 'yellow'
  //   },
  //   secret: 'red'
  // }

  console.log(await Model.get(doc.id).execute())
  // {
  //   id: '543bed92-e241-4151-9d8f-1aa942c36d24',
  //   nested: {
  //     hint: 'colour',
  //     secret: 'YWVzLTI1Ni1nY20kMSQwMQ==$JvDvLhZ1GlqYgCXx$wQCLkW7u$kt5To2YBdG5USLmtBTHS+g'
  //   },
  //   secret: 'YWVzLTI1Ni1nY20kMSQwMQ==$0n/ZpuUUIHRzAX5H$jbUS$bFRZOEe3mBrnWVQX6DMA3g'
  // }
}
```


### Standalone usage


After requiring and invoking this module as shown above, you'll be able to call any of several available methods on the hydrated "encryptedAttributes" object.  Those methods are documented below.

> Alternatively, you can simply chain:
> 
> ```js
> const EncryptedAttributes = require('encrypted-attr');
>
> var rawSocialSecurityNumber = '555-55-5555';
> 
> var encryptedSSN = EncryptedAttributes(['ssn'], {
>   keyId: 'default',
>   keys: { default: 'keyboardcat' }
> })
> .encryptAttribute(undefined, '555-55-5555');
> ```


##### encryptAttribute()

Encrypt a string using one of your keys (specifically, the key indicated by the configured `keyId`).

```js
var encryptedString = ea.encryptAttribute(optionalSourceObj, rawString);
```

> `optionalSourceObj` is only relevant if the `verifyId` option is enabled. If you don't have that option enabled, you can simply pass in `undefined`.

##### decryptAttribute()

Decrypt a value. 

```js
var rawString = ea.encryptAttribute(optionalSourceObj, encryptedString)
```

> `optionalSourceObj` is only relevant if the `verifyId` option is enabled.  If you don't have that option enabled, you can simply pass in `undefined`.


##### encryptAll()

Encrypt a subset of the provided dictionary (i.e. plain JavaScript object) of raw, unencrypted values.

```js
var partiallyEncryptedObj = ea.encryptAll(rawObj)
```

> Only fields identified in the array of keypaths you passed in during initial setup of this module will actually be encrypted.


##### decryptAll()

Decrypt a subset of the provided dictionary of encrypted values.

```js
var rawObj = ea.decryptAll(partiallyEncryptedObj)
```

> Only fields identified in the array of keypaths you passed in during initial setup of this module will actually be decrypted.




# Options

| Option     | Type           | Required?      | Details                                                              |
|:-----------|----------------|:---------------|:---------------------------------------------------------------------|
| keyId      | ((string))     | Required(ish)  | The id of the key to use for all **new encryptions**.  This is _not_ necessarily the only key that will be used for decryptions though, because the key id you choose gets embedded into the encrypted string itself.  Then before that string is decrypted, this module simply unpacks that key id and uses it to determine the appropriate decryption key.  This approach allows for using multiple keys.  (Note that this option is only _technically_ required if you need to encrypt new data.  If you are only decrypting existing data, you needn't pass it in.) |
| keys       | ((dictionary))   | Required     | A dictionary of all relevant data encryption keys (DEKs).  Since encrypted strings _contain the key id that was used to encrypt them_, it's important that `keys` contain the appropriate keys for any past key ids it might run across when attempting to decrypt those strings.
| verifyId   | ((boolean))      | _Optional._  | Whether or not to (A) use the `id` property of a provided source object as an additional piece of metadata during encryption, and (B) expect that metadata to be embedded in encrypted strings during decryption, and throw an error if the expected idea does not match.  Defaults to `false`.



# License

[MIT](LICENSE)
