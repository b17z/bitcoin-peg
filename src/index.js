'use strict'

const Blockchain = require('blockchain-spv')
const proofs = require('bitcoin-merkle-proof')
const coins = require('coins')
const ed25519 = require('supercop.js')
// TODO: try to load native ed25519 module

const MAX_SIGNATORIES = 76
const SIGNATORY_KEY_LENGTH = 33
const SIGNATURE_LENGTH = 64

function getSignatorySet (validators) {
  let entries = Object.entries(validators)
  entries.sort((a, b) => {
    // sort by voting power, breaking ties with pubkey
    let cmp = b[1] - a[1]
    if (cmp === 0) {
      cmp = b[0] < a[0] ? 1 : -1
    }
    return cmp
  })
  return entries
    .map(([ pubkey ]) => pubkey)
    .slice(0, MAX_SIGNATORIES)
}

module.exports = function (initialHeader) {
  // TODO: use nested routing for different tx types

  function txHandler (state, tx, context) {
    console.log('tx', tx)
    console.log('validators', context.validators)

    if (tx.headers) {
      // headers tx, add headers to chain
      headersTx(state, tx, context)
    } else if (tx.signatoryKey) {
      // signatory key tx, add validator's pubkey to signatory set
      signatoryKeyTx(state, tx, context)
    } else {
      throw Error('Unknown transaction type')
    }
  }

  function initializer (state) {
    state.chain = [ initialHeader ]
    state.signatoryKeys = {}
  }

  function headersTx (state, tx, context) {
    let chain = Blockchain({ store: state.chain })
    chain.add(tx.headers)
  }

  function signatoryKeyTx (state, tx, context) {
    let {
      signatoryIndex,
      signatoryKey,
      signature
    } = tx

    if (!Number.isInteger(signatoryIndex)) {
      throw Error('Invalid signatory index')
    }
    if (!Buffer.isBuffer(signatoryKey)) {
      throw Error('Invalid signatory key')
    }
    if (signatoryKey.length !== SIGNATORY_KEY_LENGTH) {
      throw Error('Invalid signatory key length')
    }
    if (!Buffer.isBuffer(signature)) {
      throw Error('Invalid signature')
    }
    if (signature.length !== SIGNATURE_LENGTH) {
      throw Error('Invalid signatory key length')
    }

    // get validator's public key
    let signatorySet = getSignatorySet(context.validators)
    let validatorKeyBase64 = signatorySet[signatoryIndex]
    if (validatorKeyBase64 == null) {
      throw Error('Invalid signatory index')
    }
    let validatorKey = Buffer.from(validatorKeyHex, 'base64')

    // verify signatory key was signed by validator key
    if (!ed25519.verify(signature, signatoryKey, validatorKey)) {
      throw Error('Invalid signature')
    }

    // add signatory key to state
    state.signatoryKeys[validatorKeyBase64] = signatoryKey
  }

  // peg handler for `coins`
  let coinsModule = {
    initialState: {
      outputs: [],
      amount: 0
    },

    // deposit
    onInput (input, tx, state, ctx) {
      throw Error('Deposit not yet implemented')
    },

    // withdraw
    onOutput () {
      throw Error('Withdraw not yet implemented')
    }
  }

  return [
    {
      type: 'initializer',
      middleware: initializer
    },
    {
      type: 'tx',
      middleware: txHandler
    }
  ]
}
