const getAppData = async ({ appSdk, storeId, auth }) => {
  const { response } = await appSdk.apiRequest(
    storeId,
    'applications.json?app_id=' + require('../../ecom.config').app.app_id +
      '&fields=data,hidden_data',
    'GET',
    null,
    auth
  )
  const application = response.data.result[0]
  if (application) {
    return Object.assign({}, application.data, application.hidden_data)
  }
  return {}
}

module.exports = getAppData
