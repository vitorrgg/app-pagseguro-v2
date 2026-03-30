const axios = require('axios')

const isSandbox = process.env.PS_SANDBOX === 'true'

const baseURL = isSandbox
  ? 'https://sandbox.api.pagseguro.com'
  : 'https://api.pagseguro.com'

/**
 * Creates an axios instance pre-configured for PagBank API.
 * @param {string} token - Bearer token from store configuration
 * @param {boolean} [sandbox] - Override sandbox mode (default: from PS_SANDBOX env)
 */
const createPagbankAxios = (token, sandbox) => {
  const useSandbox = sandbox !== undefined ? sandbox : isSandbox
  return axios.create({
    baseURL: useSandbox
      ? 'https://sandbox.api.pagseguro.com'
      : 'https://api.pagseguro.com',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  })
}

module.exports = createPagbankAxios
module.exports.baseURL = baseURL
module.exports.isSandbox = isSandbox
