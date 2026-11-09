const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const { IgnorePlugin } = require('webpack');
const { stylePaths } = require('./stylePaths');

const BG_IMAGES_DIRNAME = 'bgimages';
const ASSET_PATH = process.env.ASSET_PATH || '/';

module.exports = () => {
  return {
    // Native CSS replaces css-loader, style-loader and mini-css-extract-plugin.
    // Forced on because the postcss-loader rule below matches `.css` files.
    experiments: {
      css: true,
    },
    // Equivalent of mini-css-extract-plugin's `ignoreOrder: true`.
    ignoreWarnings: [/Conflicting order/],
    optimization: {
      sideEffects: true,
      usedExports: true,
    },
    module: {
      rules: [
        {
          // These URLs locate Node-only data directories, not browser assets.
          test: /[\\/]@asciidoctor[\\/]core[\\/]build[\\/]browser[\\/]index\.js$/,
          parser: { url: false },
        },
        {
          test: /\.css$/,
          include: [...stylePaths],
          type: 'css/auto',
          use: [
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
        {
          test: /\.(js|jsx|tsx|ts)$/,
          exclude: /node_modules/,
          loader: 'babel-loader',
        },
        {
          test: /\.(woff|woff2|eot|ttf|otf)$/i,
          type: 'asset/resource',
        },
        {
          test: /\.svg$/,
          // only process SVG modules with this loader if they live under a 'bgimages' directory
          // this is primarily useful when applying a CSS background using an SVG
          include: (input) => input.indexOf(BG_IMAGES_DIRNAME) > -1 || input.indexOf('components') > -1,
          type: 'asset/inline',
        },
        {
          test: /\.svg$/,
          // only process SVG modules with this loader when they don't live under a 'bgimages',
          // 'fonts',  'pficon' or 'components' directory, those are handled with other loaders
          include: (input) =>
            input.indexOf(BG_IMAGES_DIRNAME) === -1 &&
            input.indexOf('fonts') === -1 &&
            input.indexOf('pficon') === -1 &&
            input.indexOf('components') === -1,
          oneOf: [
            // Referenced from CSS `url()`: emit as a file
            { dependency: 'url', type: 'asset/resource' },
            { type: 'asset/source' },
          ],
        },
        {
          test: /\.(jpg|jpeg|png|gif)$/i,
          include: [
            path.resolve(__dirname, 'src'),
            path.resolve(__dirname, 'node_modules/@patternfly/react-styles/css/assets/images'),
            path.resolve(__dirname, 'node_modules/@patternfly/react-core/dist/styles/assets/images'),
            path.resolve(
              __dirname,
              'node_modules/@patternfly/react-core/node_modules/@patternfly/react-styles/css/assets/images'
            ),
            path.resolve(
              __dirname,
              'node_modules/@patternfly/react-table/node_modules/@patternfly/react-styles/css/assets/images'
            ),
          ],
          type: 'asset',
          parser: {
            dataUrlCondition: { maxSize: 5000 },
          },
          generator: {
            filename: 'images/[name][ext]',
          },
        },
      ],
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].[contenthash:8].bundle.js',
      chunkFilename: '[name].[contenthash:8].bundle.js',
      publicPath: ASSET_PATH,
      assetModuleFilename: 'fonts/[hash:8][ext][query]',
    },
    plugins: [
      // Asciidoctor's browser bundle retains optional Node imports. Let its
      // browser fallbacks handle their absence rather than bundling polyfills.
      new IgnorePlugin({
        resourceRegExp: /^node:(?:async_hooks|fs(?:\/promises)?|path)$/,
        contextRegExp: /[\\/]@asciidoctor[\\/]core[\\/]build[\\/]browser/,
      }),
      new Dotenv({
        systemvars: true,
        silent: true,
      }),
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, 'src', 'index.html'),
        TRACKING_ENABLED: process.env.TRACKING_ENABLED,
      }),
      new CopyPlugin({
        patterns: [
          { from: path.resolve(__dirname, 'src/favicon.ico'), to: 'images' },
          { from: path.resolve(__dirname, 'src/public'), to: 'public' },
        ],
      }),
    ],
    resolve: {
      extensions: ['.js', '.ts', '.tsx', '.jsx'],
      plugins: [
        new TsconfigPathsPlugin({
          configFile: path.resolve(__dirname, './tsconfig.json'),
        }),
      ],
      symlinks: false,
      cacheWithContext: false,
      fallback: { crypto: false, buffer: false },
    },
  };
};
