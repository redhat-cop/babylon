const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const { stylePaths } = require('./stylePaths');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const MinimizerPlugin = require('minimizer-webpack-plugin');
const { cssMinify } = require('webpack').css;

module.exports = merge(common('production'), {
  mode: 'production',
  devtool: 'source-map',
  optimization: {
    minimizer: [
      new MinimizerPlugin({
        test: /\.(?:[cm]?js|css)(\?.*)?$/i,
        minify: [{ implementation: MinimizerPlugin.terserMinify }, { implementation: cssMinify }],
      }),
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].[contenthash:8].css',
      chunkFilename: '[name].[contenthash:8].bundle.css',
      ignoreOrder: true,
    }),
  ],
  module: {
    rules: [
      {
        test: /\.css$/,
        include: [...stylePaths],
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: [
                  [
                    'postcss-custom-media',
                    {
                      importFrom: ['./src/app/custom-media.css'],
                    },
                  ],
                ],
              },
            },
          },
        ],
      },
    ],
  },
});
