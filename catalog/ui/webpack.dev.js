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
        target: 'http://localhost:5000',
        secure: false,
        changeOrigin: true,
        headers: {
          Connection: 'keep-alive',
        },
      },
      {
        context: ['/apis'],
        target: 'http://localhost:5000',
        secure: false,
        changeOrigin: true,
        headers: {
          Connection: 'keep-alive',
        },
      },
      {
        context: ['/auth'],
        target: 'http://localhost:5000',
        secure: false,
        changeOrigin: true,
        headers: {
          Connection: 'keep-alive',
        },
      },
    ],
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        include: [...stylePaths],
        use: [
          'style-loader',
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
