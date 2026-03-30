exports.post = ({ appSdk }, req, res) => {
  appSdk.updateTokens()
    .then(() => res.sendStatus(204))
    .catch(err => {
      console.error('Refresh tokens error:', err)
      res.status(500).send({
        error: 'REFRESH_TOKENS_ERR',
        message: err.message
      })
    })
}
