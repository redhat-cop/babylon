const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common('production'), {
  mode: 'production',
  devtool: 'source-map',
  output: {
    cssFilename: '[name].[contenthash:8].css',
    cssChunkFilename: '[name].[contenthash:8].bundle.css',
  },
});
