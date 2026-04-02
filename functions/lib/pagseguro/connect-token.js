const axios = require('axios')
const { pagbankClientId, pagbankClientSecret, baseUri } = require('../../__env')

const isSandbox = process.env.PS_SANDBOX === 'true'
const pagbankBaseUrl = isSandbox
  ? 'https://sandbox.api.pagseguro.com'
  : 'https://api.pagseguro.com'

const COLLECTION = 'pagbank_tokens'
const REDIRECT_URI = `${baseUri}/pagbank/connect/callback`

/**
 * Returns the PagBank Connect access_token stored for a given store, or null.
 * @param {number} storeId
 * @param {import('firebase-admin').firestore.Firestore} db
 * @returns {Promise<string|null>}
 */
const getConnectToken = async (storeId, db) => {
  const doc = await db.collection(COLLECTION).doc(String(storeId)).get()
  if (!doc.exists) return null
  const { access_token, expires_at } = doc.data()
  if (!access_token) return null
  // return null if token expired (force refresh cycle to replace it)
  if (expires_at && new Date(expires_at) < new Date()) return null
  return access_token
}

/**
 * Saves PagBank Connect tokens for a store.
 * @param {number} storeId
 * @param {{ access_token, refresh_token, expires_in }} tokenData
 * @param {import('firebase-admin').firestore.Firestore} db
 */
const saveConnectTokens = async (storeId, tokenData, db) => {
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null
  await db.collection(COLLECTION).doc(String(storeId)).set({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString()
  }, { merge: true })
}

/**
 * Exchanges an authorization code for access_token + refresh_token.
 * @param {string} code
 * @returns {Promise<object>} token response body
 */
const exchangeCodeForToken = async (code) => {
  const { data } = await axios.post(
    `${pagbankBaseUrl}/oauth2/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${pagbankClientId}:${pagbankClientSecret}`).toString('base64')}`
      }
    }
  )
  return data
}

/**
 * Refreshes a stored PagBank Connect token using the refresh_token.
 * @param {number} storeId
 * @param {string} refreshToken
 * @param {import('firebase-admin').firestore.Firestore} db
 */
const refreshConnectToken = async (storeId, refreshToken, db) => {
  const { data } = await axios.post(
    `${pagbankBaseUrl}/oauth2/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${pagbankClientId}:${pagbankClientSecret}`).toString('base64')}`
      }
    }
  )
  await saveConnectTokens(storeId, data, db)
  return data
}

module.exports = {
  REDIRECT_URI,
  getConnectToken,
  saveConnectTokens,
  exchangeCodeForToken,
  refreshConnectToken
}
