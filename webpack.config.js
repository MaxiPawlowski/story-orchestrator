const path = require("path");
const webpack = require("webpack");
const TerserPlugin = require("terser-webpack-plugin");
const LiveReloadPlugin = require("webpack-livereload-plugin");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
const { BundledPackagesPlugin } = require("./scripts/release/bundledPackages.cjs");

const OUTPUT_DIRS = { prod: "dist", dev: "dist-dev" };
const BUNDLE_BUDGET_BYTES = 1250000;
const HOST_BROWSER_FLOOR = { chrome: "89", edge: "89", firefox: "90", safari: "15", ios: "15", opera: "75", samsung: "15" };

module.exports = (env = {}, argv = {}) => {
  const mode = argv.mode || process.env.NODE_ENV || "production";
  const flavor = env.flavor === "dev" || mode === "development" ? "dev" : "prod";
  return {
    entry: path.join(__dirname, "src/index.tsx"),
    output: {
      path: path.join(__dirname, OUTPUT_DIRS[flavor]),
      filename: `index.js`,
      clean: true,
    },
    target: "web",
    mode,
    devtool: flavor === "dev" ? "source-map" : false,
    resolve: {
      extensions: [".tsx", ".ts", ".jsx", ".js"],
      alias: {
        "@components": path.resolve(__dirname, "src/components"),
        "@services": path.resolve(__dirname, "src/services"),
        "@utils": path.resolve(__dirname, "src/utils"),
        "@constants": path.resolve(__dirname, "src/constants"),
        "@engine": path.resolve(__dirname, "src/engine"),
        "@runtime": path.resolve(__dirname, "src/runtime"),
        "@extraction": path.resolve(__dirname, "src/extraction"),
        "@pacing": path.resolve(__dirname, "src/pacing"),
        "@generation": path.resolve(__dirname, "src/generation"),
        "@memory": path.resolve(__dirname, "src/memory"),
        "@copilot": path.resolve(__dirname, "src/copilot"),
        "@talk": path.resolve(__dirname, "src/talk"),
        "@wizard": path.resolve(__dirname, "src/wizard"),
        "@stagecraft": path.resolve(__dirname, "src/stagecraft"),
        "@judge": path.resolve(__dirname, "src/judge"),
        "@features": path.resolve(__dirname, "src/features"),
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
              ["@babel/preset-env", { targets: HOST_BROWSER_FLOOR, exclude: ["@babel/plugin-transform-unicode-regex", "@babel/plugin-transform-unicode-property-regex"] }],
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
    performance: flavor === "prod" ? { hints: "error", maxEntrypointSize: BUNDLE_BUDGET_BYTES, maxAssetSize: BUNDLE_BUDGET_BYTES } : false,
    optimization: {
      minimize: true,
      minimizer: [
        new TerserPlugin({
          extractComments: false,
        }),
      ],
    },
    plugins: [
      new webpack.DefinePlugin({ __SO_DEV__: JSON.stringify(flavor === "dev") }),
      ...(argv.watch ? [new LiveReloadPlugin({ appendScriptTag: true })] : []),
      new ForkTsCheckerWebpackPlugin(),
      new BundledPackagesPlugin({ out: path.join(__dirname, ".build", `packages-${flavor}.json`), webpackDir: path.dirname(require.resolve("webpack/package.json")) }),
    ],
  };
};
