const createPagbankAxios = require('../../lib/pagseguro/axios-instance')
const getAppData = require('../../lib/store-api/get-app-data')
const { logger } = require('../../context')

const ECHO_SUCCESS = 'SUCCESS'
const ECHO_SKIP = 'SKIP'
const SKIP_TRIGGER_NAME = 'SkipTrigger'

exports.post = async ({ appSdk }, req, res) => {
  const { storeId } = req
  const trigger = req.body
  const resourceId = trigger.resource_id || trigger.inserted_id

  try {
    const auth = await appSdk.getAuth(storeId)
    const config = await getAppData({ appSdk, storeId, auth })

    // check if this trigger should be ignored
    if (Array.isArray(config.ignore_triggers) && config.ignore_triggers.includes(trigger.resource)) {
      const err = new Error()
      err.name = SKIP_TRIGGER_NAME
      throw err
    }

    const { resource, body, action } = trigger

    if (resource !== 'orders') {
      return res.send(ECHO_SKIP)
    }

    // only react to financial_status changes toward 'voided' (cancellation)
    const newStatus = body && body.financial_status && body.financial_status.current
    if (!newStatus || newStatus !== 'voided') {
      return res.send(ECHO_SKIP)
    }

    if (!config.pagbank_token) {
      return res.send(ECHO_SKIP)
    }

    // get the order to find the PagBank charge ID
    const { response: orderResponse } = await appSdk.apiRequest(
      storeId,
      `orders/${resourceId}.json?fields=_id,transactions`,
      'GET',
      null,
      auth
    )
    const order = orderResponse && orderResponse.data

    if (!order || !order.transactions || !order.transactions.length) {
      return res.send(ECHO_SKIP)
    }

    // find PagBank transaction
    const pagbankTransaction = order.transactions.find(t => {
      return t.intermediator &&
        t.intermediator.transaction_code &&
        t.app && t.app.intermediator && t.app.intermediator.code === 'pagseguro'
    }) || order.transactions.find(t => {
      return t.intermediator && t.intermediator.transaction_code
    })

    if (!pagbankTransaction) {
      return res.send(ECHO_SKIP)
    }

    const chargeId = pagbankTransaction.intermediator.transaction_code
    const isSandbox = config.sandbox === true
    const pagbank = createPagbankAxios(config.pagbank_token, isSandbox)

    logger.info(`E-Com webhook: canceling PagBank charge ${chargeId} for order ${resourceId}`, { storeId })

    try {
      await pagbank.post(`/charges/${chargeId}/cancel`, {
        amount: { value: 0 } // full cancellation
      })
      logger.info(`PagBank charge ${chargeId} canceled successfully`, { storeId })
    } catch (cancelErr) {
      // charge might already be canceled or not cancelable (e.g. already paid)
      const cancelStatus = cancelErr.response && cancelErr.response.status
      if (cancelStatus !== 422 && cancelStatus !== 409) {
        logger.warn(`PagBank cancel charge ${chargeId} failed`, {
          storeId,
          status: cancelStatus,
          err: cancelErr.message
        })
      }
    }

    res.send(ECHO_SUCCESS)
  } catch (err) {
    if (err.name === SKIP_TRIGGER_NAME) {
      return res.send(ECHO_SKIP)
    }
    if (err.appWithoutAuth === true) {
      const msg = `Webhook for store ${storeId} with no authentication`
      logger.warn(msg, { trigger: JSON.stringify(trigger) })
      return res.status(412).send(msg)
    }
    logger.error('E-Com webhook error', { storeId, err: err.message })
    res.status(500).send({
      error: 'WEBHOOK_ERR',
      message: err.message
    })
  }
}
