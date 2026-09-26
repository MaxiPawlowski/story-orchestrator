import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import * as ts from "typescript";

export const ROOT = resolve(__dirname, "../..");
export const SRC = join(ROOT, "src");
export const EFFECTIVE_WIDTH = 120;

export const rel = (path: string): string => relative(ROOT, path).replace(/\\/g, "/");

export const effectiveLines = (text: string): number =>
  text.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.replace(/\r$/, "").length / EFFECTIVE_WIDTH)), 0);

const walkAll = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walkAll(path) : [path];
  });

export const isProdSource = (path: string): boolean =>
  /\.tsx?$/.test(path) && !/\.d\.ts$/.test(path) && !/\.(test|stories)\.tsx?$/.test(path) && !/[\\/]__mocks__[\\/]/.test(path);

export const prodFiles = (dir = SRC): string[] => walkAll(dir).filter(isProdSource).sort();

export const sourceFiles = (dir: string): string[] =>
  existsSync(dir) ? walkAll(dir).filter((path) => /\.(tsx?|mts|mjs|cjs|js)$/.test(path) && !/\.d\.ts$/.test(path)).sort() : [];

export const parse = (path: string, text = readFileSync(path, "utf8")): ts.SourceFile =>
  ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

export interface FunctionMetric {
  file: string;
  name: string;
  line: number;
  lines: number;
  branches: number;
  nesting: number;
}

type FunctionLike = ts.FunctionLikeDeclaration & { body?: ts.Node };

const isFunctionLike = (node: ts.Node): node is FunctionLike =>
  (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) ||
    ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && !!node.body;

const propertyName = (name: ts.PropertyName | ts.BindingName | undefined, sf: ts.SourceFile): string | null => {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText(sf);
};

const functionName = (node: FunctionLike, sf: ts.SourceFile): string => {
  if (ts.isConstructorDeclaration(node)) return `${className(node, sf)}.constructor`;
  if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    const owner = ts.isClassLike(node.parent) ? `${className(node, sf)}.` : "";
    return `${owner}${propertyName(node.name, sf)}`;
  }
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent)) return propertyName(parent.name, sf) ?? "<anonymous>";
  if (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) {
    const owner = ts.isPropertyDeclaration(parent) && ts.isClassLike(parent.parent) ? `${className(parent, sf)}.` : "";
    return `${owner}${propertyName(parent.name, sf)}`;
  }
  if (ts.isFunctionExpression(node) && node.name) return node.name.text;
  let cursor: ts.Node | undefined = parent;
  while (cursor && !isFunctionLike(cursor)) cursor = cursor.parent;
  return cursor ? `${functionName(cursor, sf)}>callback` : "<anonymous>";
};

const className = (node: ts.Node, sf: ts.SourceFile): string => {
  let cursor: ts.Node | undefined = node.parent;
  while (cursor && !ts.isClassLike(cursor)) cursor = cursor.parent;
  return cursor && cursor.name ? cursor.name.getText(sf) : "<class>";
};

const BRANCH_OPERATORS = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]);

const isNestingNode = (node: ts.Node): boolean =>
  ts.isIfStatement(node) || ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node) ||
  ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isSwitchStatement(node) || ts.isTryStatement(node);

const isBranchNode = (node: ts.Node): boolean =>
  ts.isIfStatement(node) || ts.isConditionalExpression(node) || ts.isCaseClause(node) || ts.isCatchClause(node) ||
  ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) ||
  (ts.isBinaryExpression(node) && BRANCH_OPERATORS.has(node.operatorToken.kind));


const measureBody = (body: ts.Node): { branches: number; nesting: number } => {
  let branches = 0;
  let nesting = 0;
  const visit = (node: ts.Node, depth: number) => {
    if (isFunctionLike(node)) return;
    if (isBranchNode(node)) branches += 1;
    const nests = isNestingNode(node);
    const next = nests ? depth + 1 : depth;
    if (next > nesting) nesting = next;
    ts.forEachChild(node, (child) => visit(child, next));
  };
  ts.forEachChild(body, (child) => visit(child, 0));
  return { branches, nesting };
};

export const functionMetrics = (path: string, text = readFileSync(path, "utf8")): FunctionMetric[] => {
  const sf = parse(path, text);
  const out: FunctionMetric[] = [];
  const visit = (node: ts.Node) => {
    if (isFunctionLike(node) && node.body) {
      const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
      const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
      const { branches, nesting } = measureBody(node.body);
      out.push({ file: rel(path), name: functionName(node, sf), line: start + 1, lines: end - start + 1, branches, nesting });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
};

export interface LongLine {
  file: string;
  line: number;
  length: number;
}

export const longLines = (path: string, limit: number, text = readFileSync(path, "utf8")): LongLine[] =>
  text.split("\n").flatMap((line, index) => {
    const length = line.replace(/\r$/, "").length;
    return length > limit ? [{ file: rel(path), line: index + 1, length }] : [];
  });

const ALIAS = /^@(components|services|utils|constants|engine|runtime|extraction|pacing|generation|memory|copilot|talk|wizard|stagecraft|judge)\/(.*)$/;
const EXTENSIONS = [".ts", ".tsx", ".d.ts", ".mts", ".js", ".json"];

export const resolveSpecifier = (from: string, specifier: string, known: ReadonlySet<string> = new Set()): string | null => {
  let base: string;
  const alias = ALIAS.exec(specifier);
  if (alias) base = join(SRC, alias[1], alias[2]);
  else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else return null;
  const candidates = [base, ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => join(base, `index${ext}`))];
  for (const candidate of candidates) {
    if (known.has(candidate) || (existsSync(candidate) && statSync(candidate).isFile())) return candidate;
  }
  return null;
};

export interface ImportEdge {
  specifier: string;
  target: string | null;
  typeOnly: boolean;
  dynamic: boolean;
}

const importClauseIsTypeOnly = (clause: ts.ImportClause | undefined): boolean => {
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  const bindings = clause.namedBindings;
  if (!bindings) return false;
  if (ts.isNamespaceImport(bindings)) return false;
  return bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
};

export const importEdges = (path: string, text = readFileSync(path, "utf8"), known: ReadonlySet<string> = new Set()): ImportEdge[] => {
  const sf = parse(path, text);
  const edges: ImportEdge[] = [];
  const add = (specifier: string, typeOnly: boolean, dynamic: boolean) =>
    edges.push({ specifier, target: resolveSpecifier(path, specifier, known), typeOnly, dynamic });
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      add(node.moduleSpecifier.text, importClauseIsTypeOnly(node.importClause), false);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const typeOnly = node.isTypeOnly || (!!node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 &&
        node.exportClause.elements.every((element) => element.isTypeOnly));
      add(node.moduleSpecifier.text, typeOnly, false);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      add(node.arguments[0].text, false, true);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
      add(node.moduleReference.expression.text, node.isTypeOnly, false);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return edges;
};

export type Graph = Map<string, string[]>;

export const buildGraph = (files: string[], options: { includeDynamic: boolean; includeTypeOnly?: boolean }, read: (path: string) => string = (path) => readFileSync(path, "utf8")): Graph => {
  const graph: Graph = new Map();
  const known = new Set(files);
  for (const file of files) {
    const targets = importEdges(file, read(file), known)
      .filter((edge) => edge.target && (options.includeTypeOnly || !edge.typeOnly) && (options.includeDynamic || !edge.dynamic))
      .map((edge) => edge.target as string);
    graph.set(file, [...new Set(targets)]);
  }
  return graph;
};

export const stronglyConnected = (graph: Graph): string[][] => {
  let index = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const out: string[][] = [];
  const connect = (node: string) => {
    indices.set(node, index);
    low.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next)) continue;
      if (!indices.has(next)) {
        connect(next);
        low.set(node, Math.min(low.get(node) as number, low.get(next) as number));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) as number, indices.get(next) as number));
      }
    }
    if (low.get(node) === indices.get(node)) {
      const component: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop() as string;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      const selfLoop = (graph.get(node) ?? []).includes(node);
      if (component.length > 1 || selfLoop) out.push(component.map(rel).sort());
    }
  };
  for (const node of graph.keys()) if (!indices.has(node)) connect(node);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
};

export const reachableFrom = (graph: Graph, entry: string, read: (path: string) => string = (path) => readFileSync(path, "utf8")): Set<string> => {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const node = queue.shift() as string;
    if (seen.has(node)) continue;
    seen.add(node);
    const targets = graph.get(node) ?? importEdges(node, read(node)).filter((edge) => edge.target && !edge.typeOnly).map((edge) => edge.target as string);
    for (const target of targets) if (!seen.has(target)) queue.push(target);
  }
  return seen;
};

export const pathsTo = (graph: Graph, from: string, matches: (path: string) => boolean): string[][] => {
  const out: string[][] = [];
  const visit = (node: string, trail: string[], seen: Set<string>) => {
    for (const next of graph.get(node) ?? []) {
      if (seen.has(next)) continue;
      const nextTrail = [...trail, next];
      if (matches(next)) {
        out.push(nextTrail.map(rel));
        continue;
      }
      if (!graph.has(next)) continue;
      seen.add(next);
      visit(next, nextTrail, seen);
    }
  };
  visit(from, [from], new Set([from]));
  return out;
};

export interface ExportedSymbol {
  file: string;
  name: string;
  kind: "value" | "type";
}

const hasExportModifier = (node: ts.Node): boolean =>
  !!(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));

export const exportedSymbols = (path: string, text = readFileSync(path, "utf8")): ExportedSymbol[] => {
  const sf = parse(path, text);
  const out: ExportedSymbol[] = [];
  for (const statement of sf.statements) {
    if (!hasExportModifier(statement)) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) out.push({ file: rel(path), name: declaration.name.text, kind: "value" });
      }
    } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) {
      out.push({ file: rel(path), name: statement.name.text, kind: "value" });
    } else if ((ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) && statement.name) {
      out.push({ file: rel(path), name: statement.name.text, kind: "type" });
    }
  }
  return out;
};

export const identifierCounts = (text: string): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const match of text.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) counts.set(match[0], (counts.get(match[0]) ?? 0) + 1);
  return counts;
};

export const deadExports = (prod: string[], corpus: string[], read: (path: string) => string = (path) => readFileSync(path, "utf8")): ExportedSymbol[] => {
  const totals = new Map<string, number>();
  for (const file of corpus) {
    for (const [name, count] of identifierCounts(read(file))) totals.set(name, (totals.get(name) ?? 0) + count);
  }
  const out: ExportedSymbol[] = [];
  for (const file of prod) {
    const own = identifierCounts(read(file));
    for (const symbol of exportedSymbols(file, read(file))) {
      const total = totals.get(symbol.name) ?? 0;
      const inOwnFile = own.get(symbol.name) ?? 0;
      if (total <= 1 || (total === inOwnFile && inOwnFile <= 1)) out.push(symbol);
    }
  }
  return out;
};

export interface Site {
  file: string;
  line: number;
  text: string;
}

const siteOf = (sf: ts.SourceFile, node: ts.Node, path: string): Site => ({
  file: rel(path),
  line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
  text: node.getText(sf).replace(/\s+/g, " ").slice(0, 160),
});

export const nodeSites = (path: string, predicate: (node: ts.Node, sf: ts.SourceFile) => boolean, text = readFileSync(path, "utf8")): Site[] => {
  const sf = parse(path, text);
  const out: Site[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node, sf)) out.push(siteOf(sf, node, path));
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
};

export const isUnknownDoubleCast = (node: ts.Node): boolean =>
  ts.isAsExpression(node) && ts.isAsExpression(node.expression) && node.expression.type.kind === ts.SyntaxKind.UnknownKeyword;

export const isNonNull = (node: ts.Node): boolean => ts.isNonNullExpression(node);

export const isConsoleCall = (node: ts.Node): boolean =>
  ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) &&
  node.expression.expression.text === "console";

export const isBareCatch = (node: ts.Node): boolean => ts.isCatchClause(node) && !node.variableDeclaration;

export interface CommentLine {
  file: string;
  line: number;
  text: string;
  jsdoc: boolean;
}

export const commentLines = (path: string, text = readFileSync(path, "utf8")): CommentLine[] => {
  const sf = parse(path, text);
  const out: CommentLine[] = [];
  const seen = new Set<number>();
  const collect = (pos: number) => {
    for (const range of [...(ts.getLeadingCommentRanges(text, pos) ?? []), ...(ts.getTrailingCommentRanges(text, pos) ?? [])]) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      const body = text.slice(range.pos, range.end);
      const first = sf.getLineAndCharacterOfPosition(range.pos).line;
      body.split("\n").forEach((line, offset) => out.push({ file: rel(path), line: first + offset + 1, text: line.replace(/\r$/, "").trim(), jsdoc: body.startsWith("/**") }));
    }
  };
  const visit = (node: ts.Node) => {
    collect(node.getFullStart());
    collect(node.getEnd());
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out.sort((a, b) => a.line - b.line);
};

export interface Ratchet {
  unexpected: string[];
  stale: string[];
}

export const ratchetCounts = (measured: Record<string, number>, listed: Record<string, number>): Ratchet => {
  const unexpected: string[] = [];
  const stale: string[] = [];
  for (const [key, count] of Object.entries(measured)) {
    const allowed = listed[key] ?? 0;
    if (count > allowed) unexpected.push(`${key}: ${count}, listed ${allowed}`);
  }
  for (const [key, allowed] of Object.entries(listed)) {
    const count = measured[key] ?? 0;
    if (count < allowed) stale.push(`${key}: listed ${allowed}, now ${count} (shrink the list)`);
  }
  return { unexpected: unexpected.sort(), stale: stale.sort() };
};

export const ratchetSet = (measured: string[], listed: string[]): Ratchet =>
  ratchetCounts(countBy(measured, (key) => key), countBy(listed, (key) => key));

export const countBy = <T>(items: T[], key: (item: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
};

const printer = ts.createPrinter({ removeComments: true });

const normalisedBody = (node: FunctionLike, sf: ts.SourceFile): string | null => {
  const body = node.body;
  if (!body || !ts.isBlock(body) || body.statements.length < 3) return null;
  return printer.printNode(ts.EmitHint.Unspecified, body, sf).replace(/\s+/g, " ").trim();
};

export const duplicateBodies = (files: string[], read: (path: string) => string = (path) => readFileSync(path, "utf8")): string[][] => {
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const sf = parse(file, read(file));
    const visit = (node: ts.Node) => {
      if (isFunctionLike(node)) {
        const text = normalisedBody(node, sf);
        if (text) groups.set(text, [...(groups.get(text) ?? []), `${rel(file)}#${functionName(node, sf)}`]);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return [...groups.values()].filter((group) => group.length > 1).map((group) => [...group].sort()).sort((a, b) => a[0].localeCompare(b[0]));
};

const declaredNames = (path: string, text: string): string[] => {
  const sf = parse(path, text);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name && ts.isIdentifier(node.name)) out.push(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
};

export interface HelperRule {
  names: string[];
  home: string;
}

export const helpersOutsideHome = (files: string[], rules: HelperRule[], read: (path: string) => string = (path) => readFileSync(path, "utf8")): string[] => {
  const out: string[] = [];
  for (const file of files) {
    const names = declaredNames(file, read(file));
    for (const rule of rules) {
      if (rel(file) === rule.home) continue;
      for (const name of names) if (rule.names.includes(name)) out.push(`${rel(file)}#${name}`);
    }
  }
  return out.sort();
};

const stringValue = (node: ts.Node): string | null =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;

const EQUALITY = [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken];

export const withholdingSites = (files: string[], home: string, read: (path: string) => string = (path) => readFileSync(path, "utf8")): string[] => {
  const out: string[] = [];
  for (const file of files) {
    const path = rel(file);
    if (path === home || path.startsWith("src/services/stHost/")) continue;
    const sf = parse(file, read(file));
    const visit = (node: ts.Node) => {
      if (ts.isArrayLiteralExpression(node)) {
        const values = node.elements.map(stringValue);
        if (values.length === 2 && values.includes("quiet") && values.includes("impersonate")) out.push(`${path}#set`);
      }
      if (ts.isBinaryExpression(node) && EQUALITY.includes(node.operatorToken.kind)) {
        const value = stringValue(node.right) ?? stringValue(node.left);
        if (value === "quiet" || value === "impersonate") out.push(`${path}#compare`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out.sort();
};

const FNV_OFFSET = /\b(?:2166136261|0x811c9dc5)\b/i;

export const fnvSites = (files: string[], home: string, read: (path: string) => string = (path) => readFileSync(path, "utf8")): string[] =>
  files.filter((file) => rel(file) !== home && FNV_OFFSET.test(read(file))).map(rel).sort();

export const CITATION = /\bplan\s*\d{1,2}\b|\bv\d\.\d\b|\b(?:V|S|T|L|C|H|A|D|E|F|M|P|Q|R|U|X|AE|PR|J)\d{1,3}[a-z]?\b|\b\d{2}-H\d+\b|\b20\d\d-\d\d-\d\d\b/gi;
const HOST_CITATION = /[\w./-]+\.(?:js|mjs|cjs):\d+(?:[-–]\d+)?/g;

export const citationOffends = (line: string): boolean => {
  const spans = [...line.matchAll(HOST_CITATION)].map((match) => [match.index ?? 0, (match.index ?? 0) + match[0].length]);
  return [...line.matchAll(CITATION)].some((match) => {
    const at = match.index ?? 0;
    return !spans.some(([start, end]) => at >= start && at < end);
  });
};

const exportedJsDocLines = (sf: ts.SourceFile): Array<[number, number]> => {
  const ranges: Array<[number, number]> = [];
  for (const statement of sf.statements) {
    if (!hasExportModifier(statement)) continue;
    for (const range of ts.getLeadingCommentRanges(sf.text, statement.getFullStart()) ?? []) {
      if (sf.text.slice(range.pos, range.pos + 3) === "/**") ranges.push([sf.getLineAndCharacterOfPosition(range.pos).line + 1, sf.getLineAndCharacterOfPosition(range.end).line + 1]);
    }
  }
  return ranges;
};

export const citationComments = (path: string, text = readFileSync(path, "utf8")): CommentLine[] => {
  const allowed = rel(path).startsWith("src/services/stHost/") ? exportedJsDocLines(parse(path, text)) : [];
  return commentLines(path, text).filter((line) => citationOffends(line.text) && !allowed.some(([start, end]) => line.line >= start && line.line <= end));
};

export const jsonCommentLines = (path: string, text = readFileSync(path, "utf8")): CommentLine[] =>
  text.split("\n").flatMap((raw, index) => {
    const line = raw.replace(/\r$/, "");
    const at = line.search(/^\s*\/\//);
    return at >= 0 ? [{ file: rel(path), line: index + 1, text: line.trim(), jsdoc: false }] : [];
  });

export const hostReach = (graph: Graph, from: string, isHost: (path: string) => boolean): string[] => {
  const firstHops = new Set<string>();
  for (const hop of graph.get(from) ?? []) {
    const seen = new Set<string>([from]);
    const queue = [hop];
    while (queue.length) {
      const node = queue.shift() as string;
      if (seen.has(node)) continue;
      seen.add(node);
      if (isHost(node)) {
        firstHops.add(rel(hop));
        break;
      }
      for (const next of graph.get(node) ?? []) if (!seen.has(next)) queue.push(next);
    }
  }
  return [...firstHops].sort();
};

const MODEL_CALL = /\b(?:callExtractionModel|callExtractionReply|sendConnectionProfileRequest)\b/;

export const modelCallSites = (files: string[], allowed: string[], read: (path: string) => string = (path) => readFileSync(path, "utf8")): string[] =>
  files.filter((file) => {
    const path = rel(file);
    return !allowed.some((prefix) => path === prefix || (prefix.endsWith("/") && path.startsWith(prefix))) && MODEL_CALL.test(read(file));
  }).map(rel).sort();

export interface ErrorCopySite {
  site: string;
  kind: 1 | 2 | 3;
  template: string;
}

const TOAST_SEAMS = new Set(["showConfirmPopup", "showChoicePopup", "showTextPopup", "toast"]);
const ERROR_NAMES = new Set(["error", "err", "e", "cause", "reason"]);

const calleeName = (expression: ts.Expression): string | null => {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const owner = expression.expression;
    const ownerName = ts.isIdentifier(owner) ? owner.text : ts.isPropertyAccessExpression(owner) ? owner.name.text : null;
    if (ownerName === "toastr") return "toastr";
    return expression.name.text;
  }
  return null;
};

const enclosingName = (node: ts.Node, sf: ts.SourceFile): string => {
  let cursor: ts.Node | undefined = node.parent;
  while (cursor && !isFunctionLike(cursor)) cursor = cursor.parent;
  return cursor ? functionName(cursor, sf) : "<module>";
};

const isConstantExpression = (node: ts.Node): boolean =>
  ts.isLiteralExpression(node) || node.kind === ts.SyntaxKind.NullKeyword || node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword ||
  (ts.isIdentifier(node) && node.text === "undefined") || (ts.isArrayLiteralExpression(node) && node.elements.length === 0) ||
  (ts.isObjectLiteralExpression(node) && node.properties.length === 0) || (ts.isParenthesizedExpression(node) && isConstantExpression(node.expression)) ||
  (ts.isVoidExpression(node) && ts.isLiteralExpression(node.expression));

const templateText = (node: ts.Node, sf: ts.SourceFile): string => node.getText(sf).replace(/\s+/g, " ").trim();

export const errorCopySites = (path: string, text = readFileSync(path, "utf8")): ErrorCopySite[] => {
  const sf = parse(path, text);
  const caught = new Set(ERROR_NAMES);
  const collectCaught = (node: ts.Node) => {
    if (ts.isCatchClause(node) && node.variableDeclaration && ts.isIdentifier(node.variableDeclaration.name)) caught.add(node.variableDeclaration.name.text);
    ts.forEachChild(node, collectCaught);
  };
  collectCaught(sf);
  const out = new Map<string, ErrorCopySite>();
  const catchOrdinals = new Map<string, number>();
  const add = (node: ts.Node, kind: 1 | 2 | 3, template: string) => {
    const site = `${rel(path)}#${enclosingName(node, sf)}`;
    const entry = { site, kind, template };
    out.set(`${site}|${kind}|${template}`, entry);
  };
  const isErrorSpan = (expression: ts.Expression): boolean => {
    if (ts.isPropertyAccessExpression(expression) && expression.name.text === "message") return true;
    if (ts.isIdentifier(expression) && caught.has(expression.text)) return true;
    if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "String") {
      const argument = expression.arguments[0];
      return !!argument && ts.isIdentifier(argument) && caught.has(argument.text);
    }
    if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isNonNullExpression(expression)) return isErrorSpan(expression.expression);
    if (ts.isConditionalExpression(expression)) return isErrorSpan(expression.whenTrue) || isErrorSpan(expression.whenFalse);
    if (ts.isBinaryExpression(expression)) return isErrorSpan(expression.left) || isErrorSpan(expression.right);
    return false;
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      const first = node.arguments[0];
      if (name && (name === "toastr" || TOAST_SEAMS.has(name)) && first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first) || ts.isTemplateExpression(first))) {
        add(node, 1, templateText(first, sf));
      }
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "catch" && first && (ts.isArrowFunction(first) || ts.isFunctionExpression(first))) {
        const body = first.body;
        if (body && !ts.isBlock(body) && isConstantExpression(body)) add(node, 3, `.catch(() => ${templateText(body, sf)})`);
      }
    }
    if (ts.isTemplateExpression(node) && node.templateSpans.some((span) => isErrorSpan(span.expression))) add(node, 2, templateText(node, sf));
    if (ts.isCatchClause(node) && !node.variableDeclaration) {
      const site = `${rel(path)}#${enclosingName(node, sf)}`;
      const ordinal = (catchOrdinals.get(site) ?? 0) + 1;
      catchOrdinals.set(site, ordinal);
      add(node, 3, `catch {} #${ordinal}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return [...out.values()];
};

export const timingOffenders =(path: string, text = readFileSync(path, "utf8")): string[] => {
  const out: string[] = [];
  const fake = /useFakeTimers/.test(text);
  const sf = parse(path, text);
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "performance" && node.expression.name.text === "now") out.push(`${rel(path)}#performance.now`);
    if (!fake && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "setTimeout") {
      const delay = node.arguments[1];
      if (delay && ts.isNumericLiteral(delay) && Number(delay.text) > 50) out.push(`${rel(path)}#setTimeout`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
};
