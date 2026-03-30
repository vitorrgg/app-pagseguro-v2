const createPagbankAxios = require('../../../lib/pagseguro/axios-instance')
const buildOrderPayload = require('../../../lib/pagseguro/build-order-payload')
const { parseAddress } = require('../../../lib/pagseguro/build-order-payload')
const parseChargeStatus = require('../../../lib/pagseguro/parse-status')
const { baseUri } = require('../../../__env')
const { logger } = require('../../../context')

exports.post = async ({ appSdk }, req, res) => {
  // https://apx-mods.e-com.plus/api/v1/create_transaction/schema.json?store_id=100
  const { params, application } = req.body
  const { storeId } = req

  const config = Object.assign({}, application.data, application.hidden_data)

  if (!config.pagbank_token) {
    return res.status(409).send({
      error: 'NO_PAGBANK_TOKEN',
      message: 'Token PagBank não configurado'
    })
  }

  const isSandbox = config.sandbox === true
  const pagbank = createPagbankAxios(config.pagbank_token, isSandbox)

  const { transaction, buyer, to, billing_address: billingAddress, order_number: orderNumber } = params
  const methodCode = transaction.payment_method.code

  // calculate amounts in cents
  const amountTotal = Math.round((params.amount.total || 0) * 100)
  const amountDiscount = Math.round((params.amount.discount || 0) * 100)
  const chargeAmount = Math.max(amountTotal - amountDiscount, 0)

  // build base order payload (items, customer, shipping)
  const basePayload = buildOrderPayload(params)
  // embed storeId in notification URL so webhook knows which store this charge belongs to
  basePayload.notification_urls = [`${baseUri}/pagseguro/webhook?store_id=${storeId}`]

  try {
    let responseData
    let ecomTransaction

    switch (methodCode) {
      case 'credit_card': {
        // extract encrypted card hash (may come as "ENCRYPTED // BRAND cardnumber")
        const rawHash = params.credit_card && params.credit_card.hash
        const encryptedCard = rawHash && rawHash.includes(' // ')
          ? rawHash.split(' // ')[0]
          : rawHash

        if (!encryptedCard) {
          return res.status(400).send({
            error: 'MISSING_CARD_HASH',
            message: 'Hash do cartão criptografado não encontrado'
          })
        }

        const installmentsNumber = params.installments_number || 1
        const holderName = params.credit_card && params.credit_card.holder_name

        const charge = {
          reference_id: String(orderNumber).substr(0, 64),
          description: `Pedido #${orderNumber}`.substr(0, 64),
          amount: {
            value: chargeAmount,
            currency: 'BRL'
          },
          payment_method: {
            type: 'CREDIT_CARD',
            installments: installmentsNumber,
            capture: true,
            card: {
              encrypted: encryptedCard,
              store: false
            }
          }
        }

        if (holderName) {
          charge.payment_method.card.holder = {
            name: String(holderName).substr(0, 30),
            tax_id: String(buyer.doc_number || buyer.registry_number || '').replace(/\D/g, '')
          }
        }

        const { data } = await pagbank.post('/orders', {
          ...basePayload,
          charges: [charge]
        })

        responseData = data
        const responseCharge = data.charges && data.charges[0]
        const chargeId = responseCharge && responseCharge.id
        const chargeStatus = responseCharge && responseCharge.status

        // installment value calculation
        const installmentValue = Math.round(chargeAmount / installmentsNumber) / 100
        const installmentsConfig = config.installments_option || {}
        const interestFree = installmentsConfig.interest_free_installments || 1
        const hasTax = installmentsNumber > interestFree && (installmentsConfig.tax_value || 0) > 0

        ecomTransaction = {
          amount: chargeAmount / 100,
          currency_id: 'BRL',
          creditor_fees: {
            installment: installmentsNumber,
            intermediation: responseCharge && responseCharge.amount && responseCharge.amount.fees
              ? (responseCharge.amount.fees.buyer_fees || 0) / 100
              : 0
          },
          installments: {
            number: installmentsNumber,
            tax: hasTax,
            total: chargeAmount / 100,
            value: installmentValue
          },
          intermediator: {
            payment_method: {
              code: 'credit_card',
              name: 'Cartão de Crédito'
            },
            transaction_id: chargeId,
            transaction_code: chargeId,
            transaction_reference: String(data.id || '')
          },
          status: {
            current: parseChargeStatus(chargeStatus),
            updated_at: new Date().toISOString()
          }
        }
        break
      }

      case 'banking_billet': {
        const boletoConfig = config.banking_billet || {}
        const expirationDays = boletoConfig.expiration_days || 3
        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + expirationDays)
        const dueDateStr = dueDate.toISOString().substr(0, 10)

        const address = billingAddress || to
        if (!address) {
          return res.status(400).send({
            error: 'MISSING_ADDRESS',
            message: 'Endereço de cobrança necessário para boleto'
          })
        }

        const instructionLines = boletoConfig.instruction_lines || {}

        const charge = {
          reference_id: String(orderNumber).substr(0, 64),
          description: `Pedido #${orderNumber}`.substr(0, 64),
          amount: {
            value: chargeAmount,
            currency: 'BRL'
          },
          payment_method: {
            type: 'BOLETO',
            boleto: {
              template: 'COBRANCA',
              due_date: dueDateStr,
              days_until_expiration: String(expirationDays),
              holder: {
                name: String(buyer.fullname || buyer.name || '').substr(0, 100),
                tax_id: String(buyer.doc_number || buyer.registry_number || '').replace(/\D/g, ''),
                email: String(buyer.email || '').substr(0, 60),
                address: parseAddress(address)
              },
              instruction_lines: {
                line_1: instructionLines.first || 'Atenção: não receber após vencimento.',
                line_2: instructionLines.second || 'Pague em qualquer casa lotérica.'
              }
            }
          }
        }

        const { data } = await pagbank.post('/orders', {
          ...basePayload,
          charges: [charge]
        })

        responseData = data
        const responseCharge = data.charges && data.charges[0]
        const chargeId = responseCharge && responseCharge.id
        const chargeStatus = responseCharge && responseCharge.status
        const boletoData = responseCharge && responseCharge.payment_method && responseCharge.payment_method.boleto

        // find PDF link
        const links = responseCharge && responseCharge.links
        const pdfLink = links && links.find(l => l.media === 'application/pdf')
        const boletoUrl = (pdfLink && pdfLink.href) ||
          (links && links.find(l => l.rel === 'BOLETO.PDF') && links.find(l => l.rel === 'BOLETO.PDF').href)

        ecomTransaction = {
          amount: chargeAmount / 100,
          currency_id: 'BRL',
          installments: { number: 1 },
          banking_billet: {
            link: boletoUrl,
            code: boletoData && boletoData.formatted_barcode
          },
          payment_link: boletoUrl,
          intermediator: {
            payment_method: {
              code: 'banking_billet',
              name: 'Boleto Bancário'
            },
            transaction_id: chargeId,
            transaction_code: chargeId,
            transaction_reference: String(data.id || '')
          },
          status: {
            current: parseChargeStatus(chargeStatus),
            updated_at: new Date().toISOString()
          }
        }
        break
      }

      case 'account_deposit': {
        // PIX
        const pixConfig = config.pix || {}
        const expirationMinutes = pixConfig.expiration_minutes || 1440
        const pixExpirationDate = new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString()

        const charge = {
          reference_id: String(orderNumber).substr(0, 64),
          description: `Pedido #${orderNumber}`.substr(0, 64),
          amount: {
            value: chargeAmount,
            currency: 'BRL'
          },
          payment_method: {
            type: 'PIX',
            pix: {
              expiration_date: pixExpirationDate
            }
          }
        }

        const { data } = await pagbank.post('/orders', {
          ...basePayload,
          charges: [charge]
        })

        responseData = data
        const responseCharge = data.charges && data.charges[0]
        const chargeId = responseCharge && responseCharge.id
        const chargeStatus = responseCharge && responseCharge.status

        // extract QR code data
        const qrCodes = responseCharge && responseCharge.payment_method &&
          responseCharge.payment_method.qr_codes
        const qrCode = qrCodes && qrCodes[0]
        const qrLinks = qrCode && qrCode.links
        const qrPngLink = qrLinks &&
          (qrLinks.find(l => l.rel === 'QRCODE.PNG') || qrLinks.find(l => l.media === 'image/png'))

        ecomTransaction = {
          amount: chargeAmount / 100,
          currency_id: 'BRL',
          installments: { number: 1 },
          pix: {
            qr_code: qrCode && qrCode.text,
            qr_code_url: qrPngLink && qrPngLink.href
          },
          intermediator: {
            payment_method: {
              code: 'account_deposit',
              name: 'PIX'
            },
            transaction_id: chargeId,
            transaction_code: chargeId,
            transaction_reference: String(data.id || '')
          },
          status: {
            current: parseChargeStatus(chargeStatus),
            updated_at: new Date().toISOString()
          }
        }
        break
      }

      case 'balance_on_intermediary': {
        // PagBank Checkout link
        const checkoutPayload = {
          reference_id: String(orderNumber).substr(0, 64),
          customer: basePayload.customer,
          items: basePayload.items,
          payment_methods: [
            { type: 'CREDIT_CARD' },
            { type: 'BOLETO' },
            { type: 'PIX' }
          ],
          notification_urls: basePayload.notification_urls
        }

        const { data } = await pagbank.post('/checkouts', checkoutPayload)

        const links = data.links
        const payLink = links && (links.find(l => l.rel === 'PAY') || links.find(l => l.rel === 'CHECKOUT'))

        ecomTransaction = {
          amount: chargeAmount / 100,
          currency_id: 'BRL',
          installments: { number: 1 },
          payment_link: payLink && payLink.href,
          intermediator: {
            payment_method: {
              code: 'balance_on_intermediary',
              name: 'Link de pagamento PagBank'
            },
            transaction_id: data.id,
            transaction_code: data.id,
            transaction_reference: String(data.id || '')
          },
          status: {
            current: 'pending',
            updated_at: new Date().toISOString()
          }
        }

        return res.send({
          redirect_to_payment: true,
          transaction: ecomTransaction
        })
      }

      default:
        return res.status(400).send({
          error: 'UNSUPPORTED_PAYMENT_METHOD',
          message: `Método de pagamento não suportado: ${methodCode}`
        })
    }

    logger.info(`PagBank transaction created for order #${orderNumber}`, {
      storeId,
      method: methodCode,
      chargeId: ecomTransaction.intermediator && ecomTransaction.intermediator.transaction_id
    })

    res.send({
      redirect_to_payment: false,
      transaction: ecomTransaction
    })
  } catch (err) {
    const errResponse = err.response && err.response.data
    const status = err.response && err.response.status

    logger.error('PagBank create transaction error', {
      storeId,
      orderNumber,
      method: methodCode,
      status,
      message: err.message,
      response: errResponse
    })

    if (status === 401) {
      return res.status(401).send({
        error: 'PAGBANK_AUTH_ERROR',
        message: 'Token PagBank inválido ou expirado'
      })
    }

    const errorMessages = errResponse && (errResponse.error_messages || errResponse.message)
    const errorDetail = Array.isArray(errorMessages)
      ? errorMessages.map(e => e.description || e.message || e).join('; ')
      : (typeof errorMessages === 'string' ? errorMessages : JSON.stringify(errResponse))

    if (status === 400 || status === 422) {
      return res.status(400).send({
        error: 'CREATE_TRANSACTION_ERR',
        message: `Erro ao criar transação no PagBank: ${errorDetail}`
      })
    }

    res.status(500).send({
      error: 'CREATE_TRANSACTION_ERR',
      message: err.message
    })
  }
}
