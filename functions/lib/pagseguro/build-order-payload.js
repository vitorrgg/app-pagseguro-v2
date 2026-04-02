/**
 * Transforms E-Com Plus module params into a PagBank /orders base payload.
 * Does NOT include the `charges` array — that is added by create-transaction.js.
 * @param {object} params - E-Com Plus create_transaction params
 * @returns {object} PagBank order payload (without charges)
 */
const buildOrderPayload = (params) => {
  const { buyer, to, billing_address: billingAddress, items, order_number: orderNumber } = params

  // customer
  const phone = buyer.phone && buyer.phone.number
    ? String(buyer.phone.number).replace(/\D/g, '')
    : null

  const customer = {
    name: String(buyer.fullname || buyer.name || '').substr(0, 100),
    email: String(buyer.email || '').substr(0, 60),
    tax_id: String(buyer.doc_number || buyer.registry_number || '').replace(/\D/g, '')
  }

  if (phone && phone.length >= 10) {
    customer.phones = [{
      country: '55',
      area: phone.substr(0, 2),
      number: phone.substr(2),
      type: 'MOBILE'
    }]
  }

  // shipping address
  const address = to || billingAddress
  let shipping
  if (address) {
    shipping = {
      address: parseAddress(address)
    }
  }

  // items (only include items with positive price)
  const pagbankItems = []
  if (Array.isArray(items)) {
    items.forEach(item => {
      const price = item.final_price || item.price
      if (price > 0) {
        pagbankItems.push({
          reference_id: String(item.sku || item._id || '').substr(0, 64),
          name: String(item.name || item.sku || '').substr(0, 100),
          quantity: item.quantity || 1,
          unit_amount: Math.round(price * 100)
        })
      }
    })
  }

  const payload = {
    reference_id: String(orderNumber || '').substr(0, 64),
    customer,
    items: pagbankItems
  }

  if (shipping) {
    payload.shipping = shipping
  }

  return payload
}

/**
 * Maps an E-Com Plus address to PagBank address format.
 * @param {object} address - E-Com Plus address
 * @returns {object} PagBank address
 */
const parseAddress = (address) => {
  return {
    street: String(address.street || '').substr(0, 100),
    number: String(address.number || 'SN').substr(0, 20),
    complement: address.complement ? String(address.complement).substr(0, 40) : undefined,
    locality: String(address.borough || address.neighborhood || '').substr(0, 60),
    city: String(address.city || '').substr(0, 90),
    region_code: String(address.province_code || address.state || '').substr(0, 2).toUpperCase(),
    country: 'BRA',
    postal_code: String(address.zip || address.postal_code || '').replace(/\D/g, '').substr(0, 8)
  }
}

const parseBoletoAddress = (address) => {
  const stateCode = String(address.province_code || address.state || '').substr(0, 2).toUpperCase()
  return {
    street: String(address.street || '').substr(0, 100),
    number: String(address.number || 'SN').substr(0, 20),
    complement: address.complement ? String(address.complement).substr(0, 40) : undefined,
    locality: String(address.borough || address.neighborhood || '').substr(0, 60),
    city: String(address.city || '').substr(0, 90),
    region_code: stateCode,
    region: stateCode,
    country: 'BRA',
    postal_code: String(address.zip || address.postal_code || '').replace(/\D/g, '').substr(0, 8)
  }
}

module.exports = buildOrderPayload
module.exports.parseAddress = parseAddress
module.exports.parseBoletoAddress = parseBoletoAddress
