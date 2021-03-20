module.exports = {
  publicPath: '/ui/',
  devServer: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000/'
      },
      '/apis': {
        target: 'http://localhost:5000/'
      },
      '/session': {
        target: 'http://localhost:5000/'
      }
    }
  }
}
