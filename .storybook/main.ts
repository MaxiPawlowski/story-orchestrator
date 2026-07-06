import type { StorybookConfig } from "@storybook/react-webpack5";
import path from "path";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  staticDirs: [{ from: path.resolve(__dirname, "../../../../../webfonts"), to: "/st-public/webfonts" }],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-a11y",
    "@storybook/addon-interactions",
  ],
  framework: {
    name: "@storybook/react-webpack5",
    options: {},
  },
  webpackFinal: async (cfg) => {
    cfg.resolve = cfg.resolve || {};
    cfg.resolve.extensions = [".tsx", ".ts", ".jsx", ".js", ...(cfg.resolve.extensions || [])];
    cfg.resolve.alias = {
      ...(cfg.resolve.alias || {}),
      "@services/STAPI": path.resolve(__dirname, "./mocks/STAPI.ts"),
      "@components": path.resolve(__dirname, "../src/components"),
      "@services": path.resolve(__dirname, "../src/services"),
      "@hooks": path.resolve(__dirname, "../src/hooks"),
      "@utils": path.resolve(__dirname, "../src/utils"),
      "@constants": path.resolve(__dirname, "../src/constants"),
      "@controllers": path.resolve(__dirname, "../src/controllers"),
      "@store": path.resolve(__dirname, "../src/store"),
      "@engine": path.resolve(__dirname, "../src/engine"),
      "@runtime": path.resolve(__dirname, "../src/runtime"),
      "@extraction": path.resolve(__dirname, "../src/extraction"),
      "@pacing": path.resolve(__dirname, "../src/pacing"),
      "@generation": path.resolve(__dirname, "../src/generation"),
      "@memory": path.resolve(__dirname, "../src/memory"),
    };
    cfg.resolve.fallback = {
      ...(cfg.resolve.fallback || {}),
      fs: false,
      http: false,
      https: false,
      url: false,
      crypto: false,
    };

    const stripCssRules = (rules: any[]): any[] =>
      rules
        .filter((rule) => {
          if (!rule || typeof rule !== "object") {
            return true;
          }
          if (rule.test instanceof RegExp && rule.test.test("file.css")) {
            return false;
          }
          return true;
        })
        .map((rule) => {
          if (!rule || typeof rule !== "object") {
            return rule;
          }
          if (Array.isArray(rule.oneOf)) {
            return { ...rule, oneOf: stripCssRules(rule.oneOf) };
          }
          if (Array.isArray(rule.rules)) {
            return { ...rule, rules: stripCssRules(rule.rules) };
          }
          return rule;
        });

    cfg.module = cfg.module || { rules: [] };
    cfg.module.rules = stripCssRules(cfg.module.rules || []);
    cfg.module.rules.push({
      test: /\.(ts|tsx|js|jsx)$/,
      exclude: /node_modules/,
      use: {
        loader: "babel-loader",
        options: {
          cacheDirectory: true,
          presets: [
            "@babel/preset-env",
            ["@babel/preset-react", { runtime: "automatic" }],
            "@babel/preset-typescript",
          ],
        },
      },
    });
    cfg.module.rules.push({
      test: /\.css$/i,
      include: [
        path.resolve(__dirname, "../src"),
        path.resolve(__dirname, "."),
      ],
      use: ["style-loader", "css-loader", "postcss-loader"],
    });

    return cfg;
  },
};

export default config;
