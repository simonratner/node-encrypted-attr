'use strict'

var alg = 'aes-256-gcm'
var crypto = require('crypto')
var get = require('lodash').get
var set = require('lodash').set

function EncryptedAttributes (attributes, options) {
  options = options || {}

  var RX_NODE_MAJOR_DOT_MINOR = /^v([^.]+\.?[^.]+)\./
  var parsedNodeMajorAndMinorVersion = process.version.match(RX_NODE_MAJOR_DOT_MINOR) && (+(process.version.match(RX_NODE_MAJOR_DOT_MINOR)[1]))
  var MIN_NODE_VERSION = 4
  var isNativeCryptoFullyCapable = parsedNodeMajorAndMinorVersion >= MIN_NODE_VERSION
  if (!isNativeCryptoFullyCapable) {
    throw new Error('Current installed node version\'s native `crypto` module is not fully capable of the necessary functionality for using encrypting/decrypting data with this module.  Please upgrade to Node v' + MIN_NODE_VERSION + ' or above, flush your node_modules, run npm install, and then try again.')
  }

  var prefix = Buffer.from(`${alg}$`).toString('base64')

  function encryptAttribute (obj, val) {
    // Encrypted attributes are prefixed with "aes-256-gcm$", the base64
    // encoding of which is in `prefix`. Nulls are not encrypted.
    if (val == null || (typeof val === 'string' && val.startsWith(prefix))) {
      return val
    }
    if (typeof val !== 'string') {
      throw new Error('Encrypted attribute must be a string')
    }
    if (options.verifyId && !obj.id) {
      throw new Error('Cannot encrypt without \'id\' attribute')
    }
    // Recommended 96-bit nonce with AES-GCM.
    var iv = crypto.randomBytes(12)
    var aad = Buffer.from(
      'aes-256-gcm$' + (options.verifyId ? obj.id.toString() : '') + '$' + options.keyId)
    var key = Buffer.from(options.keys[options.keyId], 'base64')
    var gcm = crypto.createCipheriv('aes-256-gcm', key, iv).setAAD(aad)
    var result = gcm.update(val, 'utf8', 'base64') + gcm.final('base64')

    return aad.toString('base64') + '$' +
           iv.toString('base64') + '$' +
           result + '$' +
           gcm.getAuthTag().toString('base64').slice(0, 22)
  }

  function encryptAll (obj) {
    for (var attr of attributes) {
      var val = get(obj, attr)
      if (val != null) {
        set(obj, attr, encryptAttribute(obj, val))
      }
    }
    return obj
  }

  function decryptAttribute (obj, val) {
    // Encrypted attributes are prefixed with "aes-256-gcm$", the base64
    // encoding of which is in `prefix`. Nulls are not encrypted.
    if (typeof val !== 'string' || !val.startsWith(prefix)) {
      return val
    }
    if (options.verifyId && !obj.id) {
      throw new Error('Cannot decrypt without \'id\' attribute')
    }

    var valParts = val.split('$').map((x) => Buffer.from(x, 'base64'))
    var aad = valParts[0]
    var iv = valParts[1]
    var payload = valParts[2]
    var tag = valParts[3]

    var aadParts = aad.toString().split('$')
    var id = aadParts[1]
    var keyId = aadParts[2]

    if (options.verifyId && (id !== obj.id.toString())) {
      throw new Error('Encrypted attribute has invalid id')
    }
    if (!options.keys[keyId]) {
      throw new Error('Encrypted attribute has invalid key id')
    }
    var key = Buffer.from(options.keys[keyId], 'base64')
    var gcm = crypto.createDecipheriv('aes-256-gcm', key, iv).setAAD(aad).setAuthTag(tag)

    return gcm.update(payload, 'binary', 'utf8') + gcm.final('utf8')
  }

  function decryptAll (obj) {
    for (var attr of attributes) {
      var val = get(obj, attr)
      if (val != null) {
        set(obj, attr, decryptAttribute(obj, val))
      }
    }
    return obj
  }

  return {
    attributes,
    options,
    encryptAttribute,
    encryptAll,
    decryptAttribute,
    decryptAll
  }
}

module.exports = EncryptedAttributes
