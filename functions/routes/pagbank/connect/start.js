const { pagbankClientId, baseUri } = require('../../../__env')
const { logger } = require('../../../context')

const isSandbox = process.env.PS_SANDBOX === 'true'
const pagbankConnectBase = isSandbox
  ? 'https://connect.sandbox.pagbank.com.br'
  : 'https://connect.pagbank.com.br'

const REDIRECT_URI = `${baseUri}/pagbank/connect/callback`
const SCOPE = 'payments.create payments.read'

exports.get = ({ appSdk }, req, res) => {
  const storeId = parseInt(req.query.store_id, 10)
  if (!storeId) {
    return res.status(400).send('Missing store_id parameter')
  }
  if (!pagbankClientId) {
    return res.status(500).send('PAGBANK_CLIENT_ID not configured')
  }

  const params = new URLSearchParams({
    client_id: pagbankClientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state: String(storeId)
  })

  const authUrl = `${pagbankConnectBase}/oauth2/authorize?${params.toString()}`

  logger.info('PagBank Connect: redirecting to authorization', {
    isSandbox,
    client_id: pagbankClientId,
    redirect_uri: REDIRECT_URI,
    authUrl
  })

  // debug: return the URL instead of redirecting so we can inspect it
  if (req.query.debug === '1') {
    return res.json({ isSandbox, client_id: pagbankClientId, redirect_uri: REDIRECT_URI, authUrl })
  }

  res.redirect(authUrl)
}
