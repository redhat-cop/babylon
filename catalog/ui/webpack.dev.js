const path = require('path');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const { stylePaths } = require('./stylePaths');
const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || '9000';

module.exports = merge(common('development'), {
  mode: 'development',
  devtool: 'eval-source-map',
  devServer: {
    static: './dist',
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
    proxy: {
      '/api': 'http://localhost:5000',
      '/apis': 'http://localhost:5000',
      '/auth': 'http://localhost:5000',
    },
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        include: [...stylePaths],
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
});
