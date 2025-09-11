const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");
var LiveReloadPlugin = require("webpack-livereload-plugin");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
const webpack = require("webpack");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: path.join(__dirname, "src/index.tsx"),
  output: {
    path: path.join(__dirname, "dist/"),
    filename: `index.js`,
  },
  target: "web",
  mode: process.env.NODE_ENV || "production",
  devtool: process.env.NODE_ENV === "development" ? "source-map" : false,
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js"],
    // Path aliases to mirror tsconfig paths for IDE + bundler parity
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@components": path.resolve(__dirname, "src/components"),
      "@services": path.resolve(__dirname, "src/services"),
      "@hooks": path.resolve(__dirname, "src/hooks"),
      "@utils": path.resolve(__dirname, "src/utils"),
      "@constants": path.resolve(__dirname, "src/constants"),
      "@checkpoints": path.resolve(__dirname, "src/checkpoints"),
    },
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx|js|jsx)$/,
        exclude: /node_modules/,
        options: {
          cacheDirectory: true,
          presets: [
            "@babel/preset-env",
            ["@babel/preset-react", { runtime: "automatic" }],
            "@babel/preset-typescript",
          ],
        },
        loader: "babel-loader",
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
      }),
    ],
  },
  plugins: [
    new LiveReloadPlugin({
      appendScriptTag: true,
    }),
    new ForkTsCheckerWebpackPlugin(),
    // Optional: help webpack understand the context if you still need a replacement
    new webpack.ContextReplacementPlugin(
      /checkpoints$/,
      path.resolve(__dirname, "src/checkpoints")
    ),

    // Copy the entire checkpoints folder into the output path (dist/checkpoints).
    // Using a folder 'from' and a relative 'to' ensures the plugin creates the directory under output.path.
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, "src/checkpoints"),
          to: "checkpoints",
          noErrorOnMissing: true,
        },
      ],
    }),
  ],
};
