import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";
import * as ts from "typescript";

const SRC = join(__dirname, "..");

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });

const isThisAccess = (node: ts.Node): node is ts.PropertyAccessExpression => ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword;

const deferred = (node: ts.Node) => ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isClassExpression(node);

const ctorAssigned = (ctor: ts.ConstructorDeclaration): string[] => {
  const names: string[] = [];
  const visit = (node: ts.Node) => {
    if (deferred(node)) return;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && isThisAccess(node.left)) names.push(node.left.name.text);
    ts.forEachChild(node, visit);
  };
  if (ctor.body) visit(ctor.body);
  return names;
};

const eagerReads = (source: string): string[] => {
  const file = ts.createSourceFile("probe.tsx", source.replace(/\r\n/g, "\n"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const line = (node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const inspect = (klass: ts.ClassLikeDeclaration) => {
    const ctor = klass.members.find(ts.isConstructorDeclaration);
    if (!ctor) return;
    const params = ctor.parameters.filter((param) => ts.getModifiers(param)?.some((modifier) => [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.PublicKeyword,
      ts.SyntaxKind.ProtectedKeyword, ts.SyntaxKind.ReadonlyKeyword].includes(modifier.kind))).map((param) => param.name.getText(file));
    const late = new Set([...params, ...ctorAssigned(ctor)]);
    klass.members.filter(ts.isPropertyDeclaration).forEach((property) => {
      if (!property.initializer || ts.getModifiers(property)?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword)) return;
      const visit = (node: ts.Node) => {
        if (deferred(node)) return;
        if (ts.isCallExpression(node) && isThisAccess(node.expression)) found.push(`${line(node)}: this.${node.expression.name.text}(`);
        else if (isThisAccess(node) && late.has(node.name.text)) found.push(`${line(node)}: this.${node.name.text}`);
        ts.forEachChild(node, visit);
      };
      visit(property.initializer);
    });
  };
  const scan = (node: ts.Node) => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) inspect(node);
    ts.forEachChild(node, scan);
  };
  scan(file);
  return found;
};

describe("class field initializers never read a constructor parameter property eagerly", () => {
  it("the production bundle (babel, define semantics) runs field initializers before parameter properties are assigned", () => {
    const offenders = walk(SRC).flatMap((path) => eagerReads(readFileSync(path, "utf8")).map((hit) => `${relative(SRC, path)}:${hit}`));
    expect(offenders).toEqual([]);
  });

  it("flags the shape that crashed every story import (memoryCoordinator chapters, 2026-09-30)", () => {
    const planted = "class A {\n  readonly port = new Port({ deps: this.deps, read: () => this.deps.x });\n  constructor(private readonly deps: Deps) {}\n}\n";
    expect(eagerReads(planted)).toEqual(["2: this.deps"]);
  });

  it("CR-E12: flags an initializer that calls a method, or reads a field the constructor body assigns", () => {
    const method = "class A {\n  readonly port = this.build();\n  constructor() {}\n  private build() { return 1; }\n}\n";
    expect(eagerReads(method)).toEqual(["2: this.build("]);
    const assigned = "class B {\n  readonly count = this.state.size;\n  private state: Map<string, number>;\n  constructor() {\n    this.state = new Map();\n  }\n}\n";
    expect(eagerReads(assigned)).toEqual(["2: this.state"]);
  });

  it("CR-E12: a method call or a constructor-assigned field behind an arrow is deferred, and a field initialized earlier is fine", () => {
    const safe = "class C {\n  private ready = 1;\n  readonly read = () => this.build(this.state);\n  readonly copy = this.ready;\n  private state: number;\n  constructor() {\n    this.state = 2;\n  }\n  private build(value: number) { return value; }\n}\n";
    expect(eagerReads(safe)).toEqual([]);
  });

  it("accepts a read deferred behind an arrow", () => {
    const safe = "class A {\n  readonly port = new Port({ read: () => this.deps.x, get: () => this.deps });\n  constructor(private readonly deps: Deps) {}\n}\n";
    expect(eagerReads(safe)).toEqual([]);
  });
});
