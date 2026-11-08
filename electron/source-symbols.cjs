'use strict';

const { createHash } = require('node:crypto');
const { parser: baseParser } = require('@lezer/javascript');

const EXTRACTOR = '@lezer/javascript@1.5.6:paddock-v1';
const MAX_INPUT_BYTES = 256 * 1024; // 256 KiB = 262,144 bytes
const MAX_SYMBOLS = 1000;

// Pre-configured dialect parsers
const parsers = {
  js: baseParser,
  jsx: baseParser.configure({ dialect: 'jsx' }),
  ts: baseParser.configure({ dialect: 'ts' }),
  tsx: baseParser.configure({ dialect: 'ts jsx' }),
};

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

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

function buildLineIndex(text) {
  const lineStarts = [0];
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 13 /* \r */) {
      if (i + 1 < len && text.charCodeAt(i + 1) === 10 /* \n */) {
        i++;
      }
      lineStarts.push(i + 1);
    } else if (ch === 10 /* \n */) {
      lineStarts.push(i + 1);
    }
  }
  return lineStarts;
}

function getLineNumber(lineStarts, offset) {
  let low = 0, high = lineStarts.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lineStarts[mid] <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return high + 1;
}

function findChild(node, name) {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

function findArrowToken(node) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === '=>' || c.name === 'Arrow') return c;
  }
  return null;
}

function getMethodName(methodNode, text) {
  for (let c = methodNode.firstChild; c; c = c.nextSibling) {
    if (c.name === 'PropertyDefinition' || c.name === 'PrivatePropertyDefinition' || c.name === 'PropertyName') {
      return text.slice(c.from, c.to);
    }
    if (c.name === 'String' || c.name === 'Number') {
      return text.slice(c.from, c.to);
    }
    if (c.name === '[') {
      let endBracket = c;
      for (let s = c.nextSibling; s; s = s.nextSibling) {
        if (s.name === ']') {
          endBracket = s;
          break;
        }
      }
      return text.slice(c.from, endBracket.to);
    }
  }
  return 'anonymous';
}

function deriveSignature(start, end, bodyNode, text, isArrowConcise, arrowNode) {
  if (bodyNode) {
    return text.slice(start, bodyNode.from).trim();
  }
  if (isArrowConcise && arrowNode) {
    return text.slice(start, arrowNode.to).trim();
  }
  return text.slice(start, end).replace(/;$/, '').trim();
}

function getFunctionValuedVariables(varDeclNode, text, defaultStart, defaultEnd) {
  const results = [];
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
        if (c.name !== '(' && c.name !== ')') {
          inner = c;
          break;
        }
      }
      fnExpr = inner;
    }

    if (!fnExpr || (fnExpr.name !== 'ArrowFunction' && fnExpr.name !== 'FunctionExpression')) {
      continue;
    }

    const name = text.slice(varDef.from, varDef.to);
    const start = (i === 0) ? defaultStart : varDef.from;
    const end = (allVarDefs.length === 1) ? defaultEnd : valNode.to;

    let signature;
    const block = findChild(fnExpr, 'Block');
    if (block) {
      signature = text.slice(start, block.from).trim();
    } else if (fnExpr.name === 'ArrowFunction') {
      const arrowToken = findArrowToken(fnExpr);
      if (arrowToken) {
        signature = text.slice(start, arrowToken.to).trim();
      } else {
        signature = text.slice(start, fnExpr.to).trim();
      }
    } else {
      signature = text.slice(start, fnExpr.to).trim();
    }

    results.push({
      name,
      kind: 'variable',
      start,
      end,
      signature
    });
  }

  return results;
}

function extractSymbols({ path = '', text = '' } = {}) {
  const normalizedPath = normalizePath(path);
  const srcText = typeof text === 'string' ? text : String(text || '');
  const byteLength = Buffer.byteLength(srcText, 'utf8');
  const fileHash = sha256(srcText);

  const langInfo = detectLanguage(normalizedPath);
  if (!langInfo) {
    const lastDot = normalizedPath.lastIndexOf('.');
    const ext = lastDot !== -1 ? normalizedPath.slice(lastDot).toLowerCase() : '';
    return {
      language: 'unsupported',
      extractor: EXTRACTOR,
      contentHash: fileHash,
      symbols: [],
      coverage: {
        status: 'unsupported',
        unsupported: true,
        partial: false,
        reasons: [`Unsupported file extension: "${ext || 'none'}"`],
        omissions: [],
        completeDependencyGraph: false,
      }
    };
  }

  const { language, parser } = langInfo;

  if (byteLength > MAX_INPUT_BYTES) {
    return {
      language,
      extractor: EXTRACTOR,
      contentHash: fileHash,
      symbols: [],
      coverage: {
        status: 'partial',
        partial: true,
        reasons: [`Input exceeds maximum bound of 256KiB (${byteLength} bytes > ${MAX_INPUT_BYTES} bytes)`],
        omissions: ['input_size_exceeded'],
        completeDependencyGraph: false,
      }
    };
  }

  const lineStarts = buildLineIndex(srcText);
  let tree;
  try {
    tree = parser.parse(srcText);
  } catch (error) {
    return {
      language,
      extractor: EXTRACTOR,
      contentHash: fileHash,
      symbols: [],
      coverage: {
        status: 'partial',
        partial: true,
        reasons: [`Parser exception: ${error.message || String(error)}`],
        omissions: [],
        completeDependencyGraph: false,
      }
    };
  }

  const reasons = [];
  const omissions = [];
  const errors = []; let tooManyErrors = false;
  let symbolLimitExceeded = false;

  // Scan tree for syntax error nodes
  tree.iterate({
    enter(node) {
      if (node.type.isError) {
        const line = getLineNumber(lineStarts, node.from);
        if (reasons.length < 50) reasons.push(`Syntax error at line ${line} (offset ${node.from})`);
        if (errors.length < 2048) errors.push(node.from); else tooManyErrors = true;
        return false;
      }
    }
  });

  const symbols = [];
  const seenCounts = new Map();

  function createSymbolId(modPath, name, kind) {
    const baseId = `${modPath}:${name}:${kind}`;
    const count = (seenCounts.get(baseId) || 0) + 1;
    seenCounts.set(baseId, count);
    return count === 1 ? baseId : `${baseId}#${count}`;
  }

  function addSymbol(item) {
    if (tooManyErrors || errors.some(offset => offset >= item.start && offset <= item.end)) {
      if (!omissions.includes('syntax_declarations_omitted')) omissions.push('syntax_declarations_omitted');
      return;
    }
    if (symbols.length >= MAX_SYMBOLS) {
      if (!symbolLimitExceeded) {
        symbolLimitExceeded = true;
        omissions.push('symbol_count_exceeded');
        reasons.push(`Symbol count exceeded limit of ${MAX_SYMBOLS}`);
      }
      return;
    }

    const { name, kind, start, end, signature } = item;
    const slice = srcText.slice(start, end);
    const contentHash = sha256(slice);
    const startLine = getLineNumber(lineStarts, start);
    const endLine = getLineNumber(lineStarts, Math.max(start, end - 1));
    const id = createSymbolId(normalizedPath, name, kind);

    symbols.push({
      id,
      name,
      kind,
      start,
      end,
      startLine,
      endLine,
      signature,
      contentHash,
    });
  }

  function processClassDeclaration(classNode, declStart, declEnd, isDefaultExport) {
    const varDef = findChild(classNode, 'VariableDefinition');
    const className = varDef ? srcText.slice(varDef.from, varDef.to) : (isDefaultExport ? 'default' : 'anonymous');
    const body = findChild(classNode, 'ClassBody');
    const signature = deriveSignature(declStart, declEnd, body, srcText);

    addSymbol({
      name: className,
      kind: 'class',
      start: declStart,
      end: declEnd,
      signature,
    });

    if (body) {
      for (let member = body.firstChild; member; member = member.nextSibling) {
        if (member.name === 'MethodDeclaration') {
          const methodName = getMethodName(member, srcText);
          const qualifiedName = `${className}.${methodName}`;
          const mBody = findChild(member, 'Block');
          const mSignature = deriveSignature(member.from, member.to, mBody, srcText);

          addSymbol({
            name: qualifiedName,
            kind: 'method',
            start: member.from,
            end: member.to,
            signature: mSignature,
          });
        }
      }
    }
  }

  function processFunctionDeclaration(fnNode, declStart, declEnd, isDefaultExport) {
    const varDef = findChild(fnNode, 'VariableDefinition');
    const name = varDef ? srcText.slice(varDef.from, varDef.to) : (isDefaultExport ? 'default' : 'anonymous');
    const body = findChild(fnNode, 'Block');
    const signature = deriveSignature(declStart, declEnd, body, srcText);

    addSymbol({
      name,
      kind: 'function',
      start: declStart,
      end: declEnd,
      signature,
    });
  }

  function processTopLevelStatement(stmt) {
    if (stmt.name === 'FunctionDeclaration') {
      processFunctionDeclaration(stmt, stmt.from, stmt.to, false);
    } else if (stmt.name === 'ClassDeclaration') {
      processClassDeclaration(stmt, stmt.from, stmt.to, false);
    } else if (stmt.name === 'VariableDeclaration') {
      const vars = getFunctionValuedVariables(stmt, srcText, stmt.from, stmt.to);
      for (const v of vars) addSymbol(v);
    } else if (stmt.name === 'ExportDeclaration') {
      const hasDefault = !!findChild(stmt, 'default');
      const innerFn = findChild(stmt, 'FunctionDeclaration') || findChild(stmt, 'AmbientFunctionDeclaration');
      const innerClass = findChild(stmt, 'ClassDeclaration');
      const innerVar = findChild(stmt, 'VariableDeclaration');
      const innerAmbient = findChild(stmt, 'AmbientDeclaration');

      if (innerFn) {
        processFunctionDeclaration(innerFn, stmt.from, stmt.to, hasDefault);
      } else if (innerClass) {
        processClassDeclaration(innerClass, stmt.from, stmt.to, hasDefault);
      } else if (innerVar) {
        const vars = getFunctionValuedVariables(innerVar, srcText, stmt.from, stmt.to);
        for (const v of vars) addSymbol(v);
      } else if (innerAmbient) {
        const ambFn = findChild(innerAmbient, 'FunctionDeclaration') || findChild(innerAmbient, 'AmbientFunctionDeclaration');
        const ambClass = findChild(innerAmbient, 'ClassDeclaration');
        const ambVar = findChild(innerAmbient, 'VariableDeclaration');
        if (ambFn) processFunctionDeclaration(ambFn, stmt.from, stmt.to, hasDefault);
        else if (ambClass) processClassDeclaration(ambClass, stmt.from, stmt.to, hasDefault);
        else if (ambVar) {
          const vars = getFunctionValuedVariables(ambVar, srcText, stmt.from, stmt.to);
          for (const v of vars) addSymbol(v);
        }
      } else if (hasDefault) {
        // e.g. export default () => {} or export default function() {}
        const arrow = findChild(stmt, 'ArrowFunction');
        const fnExpr = findChild(stmt, 'FunctionExpression');
        const target = arrow || fnExpr;
        if (target) {
          const body = findChild(target, 'Block');
          const arrowToken = (target.name === 'ArrowFunction') ? findArrowToken(target) : null;
          const signature = deriveSignature(stmt.from, stmt.to, body, srcText, !!arrowToken, arrowToken);
          addSymbol({
            name: 'default',
            kind: 'function',
            start: stmt.from,
            end: stmt.to,
            signature,
          });
        }
      }
    } else if (stmt.name === 'AmbientDeclaration') {
      // TypeScript declare ...
      const innerFn = findChild(stmt, 'FunctionDeclaration') || findChild(stmt, 'AmbientFunctionDeclaration');
      const innerClass = findChild(stmt, 'ClassDeclaration');
      const innerVar = findChild(stmt, 'VariableDeclaration');

      if (innerFn) {
        processFunctionDeclaration(innerFn, stmt.from, stmt.to, false);
      } else if (innerClass) {
        processClassDeclaration(innerClass, stmt.from, stmt.to, false);
      } else if (innerVar) {
        const vars = getFunctionValuedVariables(innerVar, srcText, stmt.from, stmt.to);
        for (const v of vars) addSymbol(v);
      }
    }
  }

  const root = tree.topNode;
  for (let child = root.firstChild; child; child = child.nextSibling) {
    processTopLevelStatement(child);
  }

  const isPartial = reasons.length > 0 || omissions.length > 0;
  const coverage = {
    status: isPartial ? 'partial' : 'complete',
    partial: isPartial,
    reasons,
    omissions,
    completeDependencyGraph: false,
  };

  return {
    language,
    extractor: EXTRACTOR,
    contentHash: fileHash,
    symbols,
    coverage,
  };
}

module.exports = {
  extractSymbols,
  EXTRACTOR,
  MAX_INPUT_BYTES,
  MAX_SYMBOLS,
};
