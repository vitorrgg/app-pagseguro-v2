const pkg = require('./package.json')

const functionName = process.env.FUNCTION_NAME || 'app'

const operatorToken = process.env.SERVER_OPERATOR_TOKEN || ''

let baseUri
const { FIREBASE_CONFIG, GCLOUD_PROJECT, FUNCTION_REGION } = process.env
if (GCLOUD_PROJECT) {
  const region = FUNCTION_REGION || 'us-central1'
  baseUri = `https://${region}-${GCLOUD_PROJECT}.cloudfunctions.net/${functionName}`
} else if (FIREBASE_CONFIG) {
  try {
    const firebaseConfig = JSON.parse(FIREBASE_CONFIG)
    if (firebaseConfig.projectId) {
      baseUri = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/${functionName}`
    }
  } catch (e) {
    // ignore
  }
}
if (!baseUri) {
  baseUri = process.env.BASE_URI || `http://localhost:${process.env.PORT || 3000}`
}

let hostingUri = process.env.HOSTING_URI
if (!hostingUri) {
  if (GCLOUD_PROJECT) {
    hostingUri = `https://${GCLOUD_PROJECT}.web.app`
  } else if (FIREBASE_CONFIG) {
    try {
      const firebaseConfig = JSON.parse(FIREBASE_CONFIG)
      if (firebaseConfig.projectId) {
        hostingUri = `https://${firebaseConfig.projectId}.web.app`
      }
    } catch (e) {
      // ignore
    }
  }
  if (!hostingUri) {
    hostingUri = baseUri
  }
}

module.exports = {
  pkg,
  functionName,
  operatorToken,
  baseUri,
  hostingUri
}
