const { app } = require('../ecom.config')
const { baseUri } = require('../__env')

module.exports = (req, res) => {
  res.json({
    ...app,
    base_uri: baseUri
  })
}
