const { pagbankClientId, baseUri } = require('../../../__env')

const isSandbox = process.env.PS_SANDBOX === 'true'
const pagbankConnectBase = isSandbox
  ? 'https://connect.sandbox.pagseguro.uol.com.br'
  : 'https://connect.pagseguro.uol.com.br'

const REDIRECT_URI = `${baseUri}/pagbank/connect/callback`
const SCOPE = 'payments.create+payments.read'

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

  res.redirect(`${pagbankConnectBase}/oauth2/authorize?${params.toString()}`)
}
