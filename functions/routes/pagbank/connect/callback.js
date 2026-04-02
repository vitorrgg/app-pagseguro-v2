const { exchangeCodeForToken, saveConnectTokens } = require('../../../lib/pagseguro/connect-token')
const { logger } = require('../../../context')

exports.get = async ({ admin }, req, res) => {
  const { code, state, error, error_description: errorDesc } = req.query

  if (error) {
    logger.warn('PagBank Connect: authorization denied', { error, errorDesc })
    return res.status(400).send(`
      <html><body style="font-family:sans-serif;padding:40px">
        <h2>❌ Autorização negada</h2>
        <p>${errorDesc || error}</p>
        <p>Feche esta janela e tente novamente nas configurações do app.</p>
      </body></html>
    `)
  }

  const storeId = parseInt(state, 10)
  if (!code || !storeId) {
    return res.status(400).send('Invalid callback parameters')
  }

  try {
    const tokenData = await exchangeCodeForToken(code)
    await saveConnectTokens(storeId, tokenData, admin.firestore())

    logger.info('PagBank Connect: store connected', { storeId })

    res.send(`
      <html><body style="font-family:sans-serif;padding:40px">
        <h2>✅ Conta PagBank conectada com sucesso!</h2>
        <p>A loja <strong>#${storeId}</strong> está autorizada a processar pagamentos via PagBank.</p>
        <p>Você já pode fechar esta janela.</p>
      </body></html>
    `)
  } catch (err) {
    const errData = err.response && err.response.data
    logger.error('PagBank Connect: token exchange failed', { storeId, err: err.message, errData })
    res.status(500).send(`
      <html><body style="font-family:sans-serif;padding:40px">
        <h2>❌ Erro ao conectar conta PagBank</h2>
        <p>${err.message}</p>
        <p>Tente novamente ou entre em contato com o suporte.</p>
      </body></html>
    `)
  }
}
