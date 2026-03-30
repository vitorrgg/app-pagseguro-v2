/**
 * Maps PagBank charge/order status to E-Com Plus payment status.
 * @param {string} pagbankStatus - Status string from PagBank API
 * @returns {string} E-Com Plus payment status
 */
const parseChargeStatus = (pagbankStatus) => {
  switch (pagbankStatus) {
    case 'PAID':
    case 'AUTHORIZED':
      return 'paid'
    case 'IN_ANALYSIS':
    case 'WAITING':
      return 'under_analysis'
    case 'DECLINED':
      return 'unauthorized'
    case 'CANCELED':
    case 'REFUNDED':
      return 'voided'
    case 'IN_DISPUTE':
      return 'in_dispute'
    default:
      return 'pending'
  }
}

module.exports = parseChargeStatus
