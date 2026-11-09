const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || '9000';

module.exports = merge(common('development'), {
  mode: 'development',
  devtool: 'eval-source-map',
  devServer: {
    static: './dist',
    server: 'http',
    host: HOST,
    port: PORT,
    compress: true,
    hot: true,
    historyApiFallback: {
      rewrites: [
        { from: /^\/admin\/.*/, to: '/index.html' },
        { from: /^\/catalog\/.*/, to: '/index.html' },
        { from: /^\/services\/.*/, to: '/index.html' },
      ],
    },
    open: true,
    proxy: [
      {
        context: ['/api'],
        target: 'http://localhost:8080',
        secure: false,
        changeOrigin: true,
        headers: {
          Connection: 'keep-alive',
        },
      },
      {
        context: ['/apis'],
        target: 'http://localhost:8080',
        secure: false,
        changeOrigin: true,
        headers: {
          Connection: 'keep-alive',
        },
      },
      {
        context: ['/auth'],
        target: 'http://localhost:8080',
        secure: false,
        changeOrigin: true,
        headers: {
          Connection: 'keep-alive',
        },
      },
    ],
  },
});
