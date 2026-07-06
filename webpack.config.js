const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");
var LiveReloadPlugin = require("webpack-livereload-plugin");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

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
    alias: {
      "@components": path.resolve(__dirname, "src/components"),
      "@services": path.resolve(__dirname, "src/services"),
      "@hooks": path.resolve(__dirname, "src/hooks"),
      "@utils": path.resolve(__dirname, "src/utils"),
      "@constants": path.resolve(__dirname, "src/constants"),
      "@controllers": path.resolve(__dirname, "src/controllers"),
      "@store": path.resolve(__dirname, "src/store"),
      "@engine": path.resolve(__dirname, "src/engine"),
      "@runtime": path.resolve(__dirname, "src/runtime"),
      "@extraction": path.resolve(__dirname, "src/extraction"),
      "@pacing": path.resolve(__dirname, "src/pacing"),
      "@generation": path.resolve(__dirname, "src/generation"),
      "@memory": path.resolve(__dirname, "src/memory"),
      "@copilot": path.resolve(__dirname, "src/copilot"),
    },
    fallback: {
      fs: false,
      http: false,
      https: false,
      url: false,
      crypto: false,
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
        test: /\.css$/i,
        include: path.resolve(__dirname, "src"),
        use: ["style-loader", "css-loader", "postcss-loader"],
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
  ],
};
