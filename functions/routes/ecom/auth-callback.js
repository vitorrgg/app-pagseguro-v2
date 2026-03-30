exports.post = ({ appSdk }, req, res) => {
  // https://developers.e-com.plus/docs/api/#/store/applications/applications
  appSdk.handleCallback(req.storeId, req.body)
    .then(({ isNew, storeId }) => {
      if (isNew) {
        console.log(`New store authenticated: #${storeId}`)
      }
      res.sendStatus(204)
    })
    .catch(err => {
      console.error('E-Com auth callback error:', err)
      res.status(500).send({
        error: 'AUTH_CALLBACK_ERR',
        message: err.message
      })
    })
}
