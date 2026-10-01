const tailwindcss = require("@tailwindcss/postcss");

const compactWhitespace = () => ({
  postcssPlugin: "so-compact-whitespace",
  OnceExit(root) {
    root.walkComments((comment) => {
      if (!comment.text.startsWith("!")) comment.remove();
    });
    root.walk((node) => {
      node.raws.before = "";
      node.raws.after = "";
      if (node.type === "decl") node.raws.between = ":";
      if (node.type === "rule") node.raws.between = "";
      if (node.type === "atrule" && node.nodes) node.raws.between = "";
      if (node.type === "rule" || node.type === "atrule") node.raws.semicolon = false;
    });
    root.raws.after = "";
  },
});
compactWhitespace.postcss = true;

module.exports = {
  plugins: [["postcss-preset-env", { features: { "cascade-layers": false, "is-pseudo-class": false } }], tailwindcss, compactWhitespace],
};
