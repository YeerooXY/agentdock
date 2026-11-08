'use strict';

const { createHash } = require('node:crypto');
const { parser: baseParser } = require('@lezer/javascript');
const {
  extractSymbols,
  EXTRACTOR,
  MAX_INPUT_BYTES,
  MAX_SYMBOLS,
} = require('./source-symbols.cjs');

// Pre-configured dialect parsers matching source-symbols.cjs
const parsers = {
  js: baseParser,
  jsx: baseParser.configure({ dialect: 'jsx' }),
  ts: baseParser.configure({ dialect: 'ts' }),
  tsx: baseParser.configure({ dialect: 'ts jsx' }),
};

function normalizePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function detectLanguage(filePath) {
  const normalized = normalizePath(filePath).split('?')[0].split('#')[0];
  const lastDot = normalized.lastIndexOf('.');
  if (lastDot === -1) return null;
  const ext = normalized.slice(lastDot).toLowerCase();
  switch (ext) {
    case '.js':
    case '.cjs':
    case '.mjs':
      return { language: 'javascript', parser: parsers.js, ext };
    case '.jsx':
      return { language: 'jsx', parser: parsers.jsx, ext };
    case '.ts':
    case '.cts':
    case '.mts':
      return { language: 'typescript', parser: parsers.ts, ext };
    case '.tsx':
      return { language: 'tsx', parser: parsers.tsx, ext };
    default:
      return null;
  }
}

function findChild(node, name) {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

function isCommentNodeName(name) {
  return name === 'LineComment' || name === 'BlockComment' || name === 'Hashbang';
}

function trimSegmentWithComments(srcText, segFrom, segTo, commentSpans) {
  let start = segFrom;
  let end = segTo;
  let changed = true;
  while (changed && start < end) {
    changed = false;
    while (start < end && /\s/.test(srcText[start])) {
      start++;
      changed = true;
    }
    while (end > start && /\s/.test(srcText[end - 1])) {
      end--;
      changed = true;
    }
    for (let i = 0; i < commentSpans.length; i++) {
      const cm = commentSpans[i];
      if (cm.from === start && cm.to <= end) {
        start = cm.to;
        changed = true;
      }
      if (cm.to === end && cm.from >= start) {
        end = cm.from;
        changed = true;
      }
    }
  }
  return srcText.slice(start, end);
}

function extractParameters(fnNode, srcText) {
  if (!fnNode) return [];

  const paramList = findChild(fnNode, 'ParamList');
  if (paramList) {
    let openParen = null;
    let closeParen = null;
    for (let c = paramList.firstChild; c; c = c.nextSibling) {
      if (c.name === '(' && !openParen) openParen = c;
      if (c.name === ')') closeParen = c;
    }

    if (openParen && closeParen && closeParen.from >= openParen.to) {
      const commaNodes = [];
      const commentSpans = [];
      for (let c = openParen.nextSibling; c && c !== closeParen; c = c.nextSibling) {
        if (c.name === ',') {
          commaNodes.push(c);
        } else if (isCommentNodeName(c.name)) {
          commentSpans.push({ from: c.from, to: c.to });
        }
      }

      const parameters = [];
      const count = commaNodes.length + 1;
      for (let i = 0; i < count; i++) {
        const segFrom = i === 0 ? openParen.to : commaNodes[i - 1].to;
        const segTo = i < commaNodes.length ? commaNodes[i].from : closeParen.from;
        const paramText = trimSegmentWithComments(srcText, segFrom, segTo, commentSpans);
        if (paramText.length > 0) {
          parameters.push(paramText);
        }
      }
      return parameters;
    }

    // Unparenthesized single parameter in ArrowFunction wrapped in ParamList
    const commentSpans = [];
    for (let c = paramList.firstChild; c; c = c.nextSibling) {
      if (isCommentNodeName(c.name)) {
        commentSpans.push({ from: c.from, to: c.to });
      }
    }
    const singleParam = trimSegmentWithComments(srcText, paramList.from, paramList.to, commentSpans);
    return singleParam.length > 0 ? [singleParam] : [];
  }

  if (fnNode.name === 'ArrowFunction') {
    for (let c = fnNode.firstChild; c; c = c.nextSibling) {
      if (c.name === '=>' || c.name === 'Arrow' || c.name === 'Block') break;
      if (c.name === 'VariableDefinition') {
        const text = srcText.slice(c.from, c.to).trim();
        return text.length > 0 ? [text] : [];
      }
    }
  }

  return [];
}

function extractDeclaredReturnType(fnNode, srcText) {
  if (!fnNode) return null;

  let seenParams = false;
  let typeAnnotationNode = null;
  for (let c = fnNode.firstChild; c; c = c.nextSibling) {
    if (c.name === 'ParamList') {
      seenParams = true;
      continue;
    }
    if (c.name === 'Block' || c.name === 'Arrow' || c.name === '=>') {
      break;
    }
    if (seenParams && (c.name === 'TypeAnnotation' || c.name === 'TypePredicate')) {
      typeAnnotationNode = c;
      break;
    }
  }

  if (!typeAnnotationNode) return null;

  const commentSpans = [];
  let colonEnd = typeAnnotationNode.from;
  let foundColon = false;
  for (let c = typeAnnotationNode.firstChild; c; c = c.nextSibling) {
    if (!foundColon && c.name === ':') {
      foundColon = true;
      colonEnd = c.to;
    } else if (isCommentNodeName(c.name)) {
      commentSpans.push({ from: c.from, to: c.to });
    }
  }

  if (!foundColon) {
    const raw = srcText.slice(typeAnnotationNode.from, typeAnnotationNode.to);
    const match = raw.match(/^\s*:\s*/);
    if (match) {
      colonEnd = typeAnnotationNode.from + match[0].length;
    }
  }

  const annotation = trimSegmentWithComments(srcText, colonEnd, typeAnnotationNode.to, commentSpans);
  return annotation.length > 0 ? annotation : null;
}

// Syntax-tree fingerprints are triage facts, never semantic-equivalence proofs.
// Keeping tree structure distinguishes automatic-semicolon-insertion changes.
function computeNormalizedSyntaxHash(srcText, topNode, rangeStart, rangeEnd) {
  const hash = createHash('sha256');
  topNode.toTree().iterate({
    enter(node) {
      const from = node.from + topNode.from, to = node.to + topNode.from;
      if (to < rangeStart || from > rangeEnd || isCommentNodeName(node.name)) return false;
      if (node.name !== 'Script' && from >= rangeStart && to <= rangeEnd) {
        let literal = node.node.firstChild ? null : srcText.slice(from, to);
        // Lezer leaves template text between interpolation nodes unrepresented.
        // Preserve those raw gaps, while parsing interpolation expressions normally.
        if (['TemplateString', 'TemplateType'].includes(node.name) && node.node.firstChild) {
          literal = []; let cursor = from;
          for (let child = node.node.firstChild; child; child = child.nextSibling) {
            literal.push(srcText.slice(cursor, child.from + topNode.from));
            cursor = child.to + topNode.from;
          }
          literal.push(srcText.slice(cursor, to));
        }
        hash.update(JSON.stringify([node.name, literal]));
      }
    },
    leave(node) {
      const from = node.from + topNode.from, to = node.to + topNode.from;
      if (node.name !== 'Script' && from >= rangeStart && to <= rangeEnd && !isCommentNodeName(node.name)) hash.update(']');
    },
  });
  return hash.digest('hex');
}

function collectFunctionValuedVariableNodes(varDeclNode, defaultStart, defaultEnd, nodeByRangeKey) {
  const allVarDefs = [];
  for (let c = varDeclNode.firstChild; c; c = c.nextSibling) {
    if (c.name === 'VariableDefinition') {
      allVarDefs.push(c);
    }
  }

  for (let i = 0; i < allVarDefs.length; i++) {
    const varDef = allVarDefs[i];
    let eqNode = null;
    let valNode = null;
    const nextVarDef = allVarDefs[i + 1] || null;
    const limitPos = nextVarDef ? nextVarDef.from : varDeclNode.to;

    for (let c = varDef.nextSibling; c && c.from < limitPos; c = c.nextSibling) {
      if (c.name === '=' || c.name === 'Equals') {
        eqNode = c;
        let next = c.nextSibling;
        while (next && next.from < limitPos && (next.name === 'LineComment' || next.name === 'BlockComment')) {
          next = next.nextSibling;
        }
        valNode = next;
        break;
      }
    }

    if (!eqNode || !valNode) continue;

    let fnExpr = valNode;
    while (fnExpr && fnExpr.name === 'ParenthesizedExpression') {
      let inner = null;
      for (let c = fnExpr.firstChild; c; c = c.nextSibling) {
        if (c.name !== '(' && c.name !== ')' && !isCommentNodeName(c.name)) {
          inner = c;
          break;
        }
      }
      fnExpr = inner;
    }

    if (!fnExpr || (fnExpr.name !== 'ArrowFunction' && fnExpr.name !== 'FunctionExpression')) {
      continue;
    }

    const start = i === 0 ? defaultStart : varDef.from;
    const end = allVarDefs.length === 1 ? defaultEnd : valNode.to;
    nodeByRangeKey.set(`variable:${start}:${end}`, { declNode: varDeclNode, fnNode: fnExpr });
  }
}

function collectClassNodes(classNode, declStart, declEnd, nodeByRangeKey) {
  nodeByRangeKey.set(`class:${declStart}:${declEnd}`, { declNode: classNode, fnNode: null });
  const body = findChild(classNode, 'ClassBody');
  if (body) {
    for (let member = body.firstChild; member; member = member.nextSibling) {
      if (member.name === 'MethodDeclaration') {
        nodeByRangeKey.set(`method:${member.from}:${member.to}`, { declNode: member, fnNode: member });
      }
    }
  }
}

function collectTopLevelStatementNodes(stmt, nodeByRangeKey) {
  if (stmt.name === 'FunctionDeclaration') {
    nodeByRangeKey.set(`function:${stmt.from}:${stmt.to}`, { declNode: stmt, fnNode: stmt });
  } else if (stmt.name === 'ClassDeclaration') {
    collectClassNodes(stmt, stmt.from, stmt.to, nodeByRangeKey);
  } else if (stmt.name === 'VariableDeclaration') {
    collectFunctionValuedVariableNodes(stmt, stmt.from, stmt.to, nodeByRangeKey);
  } else if (stmt.name === 'ExportDeclaration') {
    const hasDefault = !!findChild(stmt, 'default');
    const innerFn = findChild(stmt, 'FunctionDeclaration') || findChild(stmt, 'AmbientFunctionDeclaration');
    const innerClass = findChild(stmt, 'ClassDeclaration');
    const innerVar = findChild(stmt, 'VariableDeclaration');
    const innerAmbient = findChild(stmt, 'AmbientDeclaration');

    if (innerFn) {
      nodeByRangeKey.set(`function:${stmt.from}:${stmt.to}`, { declNode: stmt, fnNode: innerFn });
    } else if (innerClass) {
      collectClassNodes(innerClass, stmt.from, stmt.to, nodeByRangeKey);
    } else if (innerVar) {
      collectFunctionValuedVariableNodes(innerVar, stmt.from, stmt.to, nodeByRangeKey);
    } else if (innerAmbient) {
      const ambFn = findChild(innerAmbient, 'FunctionDeclaration') || findChild(innerAmbient, 'AmbientFunctionDeclaration');
      const ambClass = findChild(innerAmbient, 'ClassDeclaration');
      const ambVar = findChild(innerAmbient, 'VariableDeclaration');
      if (ambFn) {
        nodeByRangeKey.set(`function:${stmt.from}:${stmt.to}`, { declNode: stmt, fnNode: ambFn });
      } else if (ambClass) {
        collectClassNodes(ambClass, stmt.from, stmt.to, nodeByRangeKey);
      } else if (ambVar) {
        collectFunctionValuedVariableNodes(ambVar, stmt.from, stmt.to, nodeByRangeKey);
      }
    } else if (hasDefault) {
      const arrow = findChild(stmt, 'ArrowFunction');
      const fnExpr = findChild(stmt, 'FunctionExpression');
      const target = arrow || fnExpr;
      if (target) {
        nodeByRangeKey.set(`function:${stmt.from}:${stmt.to}`, { declNode: stmt, fnNode: target });
      }
    }
  } else if (stmt.name === 'AmbientDeclaration') {
    const innerFn = findChild(stmt, 'FunctionDeclaration') || findChild(stmt, 'AmbientFunctionDeclaration');
    const innerClass = findChild(stmt, 'ClassDeclaration');
    const innerVar = findChild(stmt, 'VariableDeclaration');

    if (innerFn) {
      nodeByRangeKey.set(`function:${stmt.from}:${stmt.to}`, { declNode: stmt, fnNode: innerFn });
    } else if (innerClass) {
      collectClassNodes(innerClass, stmt.from, stmt.to, nodeByRangeKey);
    } else if (innerVar) {
      collectFunctionValuedVariableNodes(innerVar, stmt.from, stmt.to, nodeByRangeKey);
    }
  }
}

function buildUnsupportedOrPartialResult(baseResult, { parseError = false } = {}) {
  const unsupported = Boolean(baseResult.coverage && baseResult.coverage.unsupported);
  const partial = Boolean(baseResult.coverage && baseResult.coverage.partial);
  const status = unsupported ? 'unsupported' : 'partial';
  const symbolFacts = {};

  return {
    ...baseResult,
    normalizedSyntaxHash: null,
    safeNoCodeChange: false,
    symbols: [],
    symbolFacts,
    coverage: {
      ...baseResult.coverage,
      status,
      unsupported,
      partial,
      parseError: Boolean(parseError),
      completeDependencyGraph: false,
      completeCallGraph: false,
      inferredSemantics: false,
      inferredReturnBehavior: false,
      inferredTypes: false,
      safeNoCodeChange: false,
      declarationCoverage: 'partial',
      declarationScope: 'Selected JavaScript/TypeScript declarations only.',
      unsupportedForms: [],
    },
  };
}

function extractSourceFacts({ path = '', text = '' } = {}) {
  const srcText = typeof text === 'string' ? text : String(text || '');
  const byteLength = Buffer.byteLength(srcText, 'utf8');
  const baseResult = extractSymbols({ path, text: srcText });

  const langInfo = detectLanguage(path);
  if (!langInfo || baseResult.language === 'unsupported' || baseResult.coverage.unsupported) {
    return buildUnsupportedOrPartialResult(baseResult, { parseError: false });
  }

  if (byteLength > MAX_INPUT_BYTES) {
    return buildUnsupportedOrPartialResult(baseResult, { parseError: false });
  }

  let tree;
  try {
    tree = langInfo.parser.parse(srcText);
  } catch (error) {
    const reasons = Array.isArray(baseResult.coverage?.reasons) ? [...baseResult.coverage.reasons] : [];
    const msg = `Parser exception: ${error.message || String(error)}`;
    if (!reasons.includes(msg)) reasons.push(msg);
    return buildUnsupportedOrPartialResult(
      {
        ...baseResult,
        coverage: {
          ...baseResult.coverage,
          status: 'partial',
          partial: true,
          reasons,
        },
      },
      { parseError: true }
    );
  }

  let hasParseError = false;
  tree.iterate({
    enter(node) {
      if (node.type.isError) {
        hasParseError = true;
        return false;
      }
    },
  });

  const root = tree.topNode;
  const nodeByRangeKey = new Map();
  for (let child = root.firstChild; child; child = child.nextSibling) {
    collectTopLevelStatementNodes(child, nodeByRangeKey);
  }

  const reasons = Array.isArray(baseResult.coverage?.reasons) ? [...baseResult.coverage.reasons] : [];
  const omissions = Array.isArray(baseResult.coverage?.omissions) ? [...baseResult.coverage.omissions] : [];

  const enrichedSymbols = [];
  const symbolFacts = {};
  const indexedNodes = new Set();

  for (let i = 0; i < baseResult.symbols.length; i++) {
    const sym = baseResult.symbols[i];
    const rangeKey = `${sym.kind}:${sym.start}:${sym.end}`;
    const matched = nodeByRangeKey.get(rangeKey);

    if (!matched) {
      const reason = `Unresolved syntax node for symbol "${sym.id}"`;
      if (!reasons.includes(reason)) reasons.push(reason);
      if (!omissions.includes('unresolved_symbol_syntax')) omissions.push('unresolved_symbol_syntax');
    }

    const fnNode = matched ? matched.fnNode : null;
    if (fnNode) indexedNodes.add(`${fnNode.from}:${fnNode.to}`);
    const parameters = extractParameters(fnNode, srcText);
    const declaredReturnType = extractDeclaredReturnType(fnNode, srcText);
    const normalizedSyntaxHash = computeNormalizedSyntaxHash(srcText, root, sym.start, sym.end);

    const enriched = {
      ...sym,
      parameters,
      declaredReturnType,
      normalizedSyntaxHash,
    };

    enrichedSymbols.push(enriched);
    symbolFacts[sym.id] = {
      id: sym.id,
      name: sym.name,
      kind: sym.kind,
      start: sym.start,
      end: sym.end,
      startLine: sym.startLine,
      endLine: sym.endLine,
      signature: sym.signature,
      contentHash: sym.contentHash,
      parameters,
      declaredReturnType,
      normalizedSyntaxHash,
    };
  }

  const isPartial = Boolean(baseResult.coverage?.partial) || hasParseError || reasons.length > 0 || omissions.length > 0;
  const isComplete = !isPartial;
  const fileNormalizedSyntaxHash = isComplete
    ? computeNormalizedSyntaxHash(srcText, root, 0, srcText.length)
    : null;

  const unsupportedForms = [];
  tree.iterate({ enter(node) {
    const callable = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunction', 'MethodDeclaration'].includes(node.name);
    const unindexedType = /^(TypeAliasDeclaration|InterfaceDeclaration|EnumDeclaration|NamespaceDeclaration|ModuleDeclaration|ClassExpression)$/.test(node.name);
    if (unsupportedForms.length < 32 && (unindexedType || (callable && !indexedNodes.has(`${node.from}:${node.to}`)))) unsupportedForms.push({ kind: node.name, start: node.from, end: node.to });
  } });
  const coverage = {
    ...baseResult.coverage,
    status: isComplete ? 'complete' : 'partial',
    unsupported: false,
    partial: isPartial,
    parseError: hasParseError,
    reasons,
    omissions,
    completeDependencyGraph: false,
    completeCallGraph: false,
    inferredSemantics: false,
    inferredReturnBehavior: false,
    inferredTypes: false,
    safeNoCodeChange: false,
    declarationScope: 'Selected top-level functions, classes, methods and function-valued variables. Nested, CommonJS, class-field and type declarations are not exhaustive.',
    declarationCoverage: isPartial || unsupportedForms.length ? 'partial' : 'complete-within-declared-scope',
    unsupportedForms,
  };

  return {
    language: baseResult.language,
    extractor: baseResult.extractor,
    contentHash: baseResult.contentHash,
    normalizedSyntaxHash: fileNormalizedSyntaxHash,
    safeNoCodeChange: false,
    symbols: enrichedSymbols,
    symbolFacts,
    coverage,
  };
}

// Only exact source identity can take the zero-update path. Changed comments,
// directives and formatting never obtain a semantic certificate from this API.
function canClaimSafeNoCodeChange(beforeInput, afterInput) {
  if (typeof beforeInput?.path !== 'string' || typeof afterInput?.path !== 'string' || typeof beforeInput.text !== 'string' || typeof afterInput.text !== 'string') return false;
  if (normalizePath(beforeInput.path) !== normalizePath(afterInput.path) || beforeInput.text !== afterInput.text) return false;
  return extractSourceFacts(beforeInput).coverage.status === 'complete';
}

module.exports = {
  extractSourceFacts,
  canClaimSafeNoCodeChange,
  extractSymbols,
  EXTRACTOR,
  MAX_INPUT_BYTES,
  MAX_SYMBOLS,
};
