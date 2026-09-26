import fs from "node:fs";

const [file, pattern] = process.argv.slice(2);
const text = fs.readFileSync(file).toString("latin1");
const found = new Set(text.match(new RegExp(pattern, "g")) ?? []);
console.log([...found].sort().join("\n"));
