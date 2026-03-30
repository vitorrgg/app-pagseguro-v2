exports.get = ({ appSdk }, req, res) => {
  /* This endpoint MUST BE PRIVATE */
  appSdk.getAuth(req.storeId)
    .then(auth => {
      res.send(auth.row)
    })
    .catch(err => {
      console.error(err)
      res.status(500).send({
        error: 'GET_AUTH_ERR',
        message: err.message
      })
    })
}
