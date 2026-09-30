// v2.6 plan 13 R2: mutants from the TypeScript AST, so a swap never lands inside a string, a comment
// or a type. The operator set is Stryker's core (equality, relational, logical, arithmetic, negation,
// boolean literal, conditional), kept small so a sampled run on this box finishes in one sitting.
import ts from 'typescript';

const SWAPS = new Map([
  [ts.SyntaxKind.EqualsEqualsEqualsToken, '!=='],
  [ts.SyntaxKind.ExclamationEqualsEqualsToken, '==='],
  [ts.SyntaxKind.EqualsEqualsToken, '!='],
  [ts.SyntaxKind.ExclamationEqualsToken, '=='],
  [ts.SyntaxKind.LessThanToken, '<='],
  [ts.SyntaxKind.LessThanEqualsToken, '<'],
  [ts.SyntaxKind.GreaterThanToken, '>='],
  [ts.SyntaxKind.GreaterThanEqualsToken, '>'],
  [ts.SyntaxKind.AmpersandAmpersandToken, '||'],
  [ts.SyntaxKind.BarBarToken, '&&'],
  [ts.SyntaxKind.QuestionQuestionToken, '&&'],
  [ts.SyntaxKind.PlusToken, '-'],
  [ts.SyntaxKind.MinusToken, '+'],
  [ts.SyntaxKind.AsteriskToken, '/'],
  [ts.SyntaxKind.SlashToken, '*'],
]);

const isStringy = (node) => ts.isStringLiteral(node) || ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node);

const inTypeOrImport = (node) => {
  for (let at = node.parent; at; at = at.parent) {
    if (ts.isTypeNode(at) || ts.isImportDeclaration(at) || ts.isExportDeclaration(at) || ts.isTypeAliasDeclaration(at) || ts.isInterfaceDeclaration(at) || ts.isEnumDeclaration(at)) return true;
  }
  return false;
};

/** Every mutant in one source text: `{ start, end, replacement, operator, line }`, positions into `text`. */
export function mutantsOf(text, fileName = 'file.ts') {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const add = (start, end, replacement, operator) => {
    const line = source.getLineAndCharacterOfPosition(start).line + 1;
    if (/console\.|^\s*\/\//.test(text.split(/\r?\n/)[line - 1] ?? '')) return;
    found.push({ start, end, replacement, operator, line, original: text.slice(start, end) });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return;
    if (ts.isBinaryExpression(node) && SWAPS.has(node.operatorToken.kind) && !inTypeOrImport(node)) {
      const kind = node.operatorToken.kind;
      const arithmetic = kind === ts.SyntaxKind.PlusToken;
      if (!(arithmetic && (isStringy(node.left) || isStringy(node.right)))) {
        add(node.operatorToken.getStart(source), node.operatorToken.getEnd(), SWAPS.get(kind), `${node.operatorToken.getText(source)} -> ${SWAPS.get(kind)}`);
      }
    }
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken && !inTypeOrImport(node)) {
      add(node.getStart(source), node.getEnd(), node.operand.getText(source), 'drop !');
    }
    if ((node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) && !inTypeOrImport(node)) {
      const flipped = node.kind === ts.SyntaxKind.TrueKeyword ? 'false' : 'true';
      add(node.getStart(source), node.getEnd(), flipped, `${node.getText(source)} -> ${flipped}`);
    }
    if (ts.isIfStatement(node)) {
      add(node.expression.getStart(source), node.expression.getEnd(), 'false', 'if (…) -> if (false)');
    }
    if (ts.isConditionalExpression(node) && !inTypeOrImport(node)) {
      add(node.condition.getStart(source), node.condition.getEnd(), 'true', 'cond ? -> true ?');
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name) && ['some', 'every', 'min', 'max'].includes(node.name.text) && ts.isCallExpression(node.parent) && node.parent.expression === node) {
      const swap = { some: 'every', every: 'some', min: 'max', max: 'min' }[node.name.text];
      if ((swap === 'min' || swap === 'max') && node.expression.getText(source) !== 'Math') return ts.forEachChild(node, visit);
      add(node.name.getStart(source), node.name.getEnd(), swap, `.${node.name.text} -> .${swap}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

export const applyAt = (text, mutant) => `${text.slice(0, mutant.start)}${mutant.replacement}${text.slice(mutant.end)}`;
