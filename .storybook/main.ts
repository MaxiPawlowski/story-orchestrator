import type { StorybookConfig } from "@storybook/react-webpack5";
import path from "path";
import { existsSync, readFileSync } from "fs";

const stRootFile = path.resolve(__dirname, "..", ".st-root");
const stPublic = process.env.ST_PUBLIC ?? (process.env.ST_ROOT ? path.join(process.env.ST_ROOT, "public") : existsSync(stRootFile) ? path.join(readFileSync(stRootFile, "utf8").trim(), "public") : "");
const stWebfonts = stPublic ? path.resolve(stPublic, "webfonts") : "";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  staticDirs: stWebfonts && existsSync(stWebfonts) ? [{ from: stWebfonts, to: "/st-public/webfonts" }] : [],
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
    cfg.cache = { type: "filesystem", name: `storybook-${cfg.mode ?? "production"}`, cacheDirectory: path.resolve(__dirname, "..", ".build", "webpack-cache"), buildDependencies: { config: [__filename] } };
    cfg.resolve = cfg.resolve || {};
    cfg.resolve.extensions = [".tsx", ".ts", ".jsx", ".js", ...(cfg.resolve.extensions || [])];
    cfg.resolve.alias = {
      ...(cfg.resolve.alias || {}),
      "@services/STAPI": path.resolve(__dirname, "./mocks/STAPI.ts"),
      "@services/stHost/image$": path.resolve(__dirname, "./mocks/STAPI.ts"),
      "@services/stHost/imageSurface$": path.resolve(__dirname, "./mocks/STAPI.ts"),
      "@services/stHost/sprites$": path.resolve(__dirname, "./mocks/STAPI.ts"),
      "@services/stHost/gpuBroker$": path.resolve(__dirname, "./mocks/STAPI.ts"),
      "@services/stHost/media$": path.resolve(__dirname, "./mocks/STAPI.ts"),
      "@services/stHost/stImage$": path.resolve(__dirname, "./mocks/STAPI.ts"),
      "@components": path.resolve(__dirname, "../src/components"),
      "@services": path.resolve(__dirname, "../src/services"),
      "@utils": path.resolve(__dirname, "../src/utils"),
      "@constants": path.resolve(__dirname, "../src/constants"),
      "@engine": path.resolve(__dirname, "../src/engine"),
      "@runtime": path.resolve(__dirname, "../src/runtime"),
      "@extraction": path.resolve(__dirname, "../src/extraction"),
      "@pacing": path.resolve(__dirname, "../src/pacing"),
      "@generation": path.resolve(__dirname, "../src/generation"),
      "@memory": path.resolve(__dirname, "../src/memory"),
      "@copilot": path.resolve(__dirname, "../src/copilot"),
      "@talk": path.resolve(__dirname, "../src/talk"),
      "@wizard": path.resolve(__dirname, "../src/wizard"),
      "@stagecraft": path.resolve(__dirname, "../src/stagecraft"),
      "@judge": path.resolve(__dirname, "../src/judge"),
      "@features": path.resolve(__dirname, "../src/features"),
      "@guide": path.resolve(__dirname, "../src/guide"),
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
