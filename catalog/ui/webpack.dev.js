const path = require('path');
const { merge } = require("webpack-merge");
const common = require("./webpack.common.js");
const { stylePaths } = require("./stylePaths");
const HOST = process.env.HOST || "localhost";
const PORT = process.env.PORT || "9000";

module.exports = merge(common('development'), {
  mode: "development",
  devtool: "eval-source-map",
  devServer: {
    contentBase: "./dist",
    host: HOST,
    port: PORT,
    compress: true,
    inline: true,
    historyApiFallback: {
      rewrites: [
        { from: /^\/catalog\/.*/, to: '/index.html' },
        { from: /^\/services\/.*/, to: '/index.html' },
      ],
    },
    hot: true,
    overlay: true,
    open: true,
    proxy: {
      "/session": "http://localhost:5000",
      "/api": "http://localhost:5000",
      "/apis": "http://localhost:5000",
    }
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        include: [
          ...stylePaths
        ],
        use: ["style-loader", "css-loader"]
      }
    ]
  }
});
