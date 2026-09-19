const tailwindcss = require("@tailwindcss/postcss");
module.exports = {
  plugins: [["postcss-preset-env", { features: { "cascade-layers": false } }], tailwindcss],
};
