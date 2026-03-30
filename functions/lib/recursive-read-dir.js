const fs = require('fs')
const path = require('path')

const recursiveReadDir = (dir) => {
  let results = []
  const list = fs.readdirSync(dir)
  list.forEach(file => {
    file = path.join(dir, file)
    const stat = fs.statSync(file)
    if (stat && stat.isDirectory()) {
      results = results.concat(recursiveReadDir(file))
    } else {
      results.push(file)
    }
  })
  return results
}

module.exports = recursiveReadDir
