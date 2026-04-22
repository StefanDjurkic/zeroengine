// ============================================================================
// JSPP Prototype Transpiler â€” Lexer + Parser + CodeGen in one file
// Usage: node jspp.mjs input.jspp [-o output.cpp] [--tokens] [--ast]
// ============================================================================

import { readFileSync, writeFileSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { pathToFileURL } from "url";
import { TypeChecker } from "./typechecker.js";

// ============================================================================
// LEXER
// ============================================================================

const TokenType = {
  // Keywords
  KW_LET: "KW_LET", KW_CONST: "KW_CONST", KW_FUNCTION: "KW_FUNCTION",
  KW_RETURN: "KW_RETURN", KW_IF: "KW_IF", KW_ELSE: "KW_ELSE",
  KW_FOR: "KW_FOR", KW_WHILE: "KW_WHILE", KW_DO: "KW_DO",
  KW_SWITCH: "KW_SWITCH", KW_CASE: "KW_CASE", KW_DEFAULT: "KW_DEFAULT",
  KW_BREAK: "KW_BREAK", KW_CONTINUE: "KW_CONTINUE",
  KW_TYPE: "KW_TYPE", KW_CLASS: "KW_CLASS",
  KW_NEW: "KW_NEW", KW_THIS: "KW_THIS", KW_SUPER: "KW_SUPER",
  KW_EXTENDS: "KW_EXTENDS", KW_IMPORT: "KW_IMPORT", KW_FROM: "KW_FROM",
  KW_EXPORT: "KW_EXPORT", KW_ENUM: "KW_ENUM",
  KW_TRY: "KW_TRY", KW_CATCH: "KW_CATCH", KW_THROW: "KW_THROW",
  KW_OF: "KW_OF", KW_REF: "KW_REF", KW_NULL: "KW_NULL",
  KW_TRUE: "KW_TRUE", KW_FALSE: "KW_FALSE",
  KW_CPP: "KW_CPP", KW_CPP_INCLUDE: "KW_CPP_INCLUDE",

  // Type keywords
  TYPE_INT: "TYPE_INT", TYPE_FLOAT: "TYPE_FLOAT", TYPE_DOUBLE: "TYPE_DOUBLE",
  TYPE_BOOL: "TYPE_BOOL", TYPE_STRING: "TYPE_STRING", TYPE_CHAR: "TYPE_CHAR",
  TYPE_VOID: "TYPE_VOID", TYPE_AUTO: "TYPE_AUTO",
  TYPE_I8: "TYPE_I8", TYPE_I16: "TYPE_I16", TYPE_I32: "TYPE_I32", TYPE_I64: "TYPE_I64",
  TYPE_U8: "TYPE_U8", TYPE_U16: "TYPE_U16", TYPE_U32: "TYPE_U32", TYPE_U64: "TYPE_U64",
  TYPE_SIZE: "TYPE_SIZE",

  // Literals
  LIT_INT: "LIT_INT", LIT_FLOAT: "LIT_FLOAT", LIT_STRING: "LIT_STRING",
  LIT_CHAR: "LIT_CHAR", LIT_TEMPLATE: "LIT_TEMPLATE",

  // Operators
  OP_PLUS: "OP_PLUS", OP_MINUS: "OP_MINUS", OP_STAR: "OP_STAR",
  OP_SLASH: "OP_SLASH", OP_PERCENT: "OP_PERCENT",
  OP_ASSIGN: "OP_ASSIGN",
  OP_PLUS_ASSIGN: "OP_PLUS_ASSIGN", OP_MINUS_ASSIGN: "OP_MINUS_ASSIGN",
  OP_STAR_ASSIGN: "OP_STAR_ASSIGN", OP_SLASH_ASSIGN: "OP_SLASH_ASSIGN",
  OP_PERCENT_ASSIGN: "OP_PERCENT_ASSIGN",
  OP_STRICT_EQ: "OP_STRICT_EQ", OP_STRICT_NEQ: "OP_STRICT_NEQ",
  OP_EQ: "OP_EQ", OP_NEQ: "OP_NEQ",
  OP_LT: "OP_LT", OP_GT: "OP_GT", OP_LTE: "OP_LTE", OP_GTE: "OP_GTE",
  OP_AND: "OP_AND", OP_OR: "OP_OR", OP_NOT: "OP_NOT",
  OP_BIT_AND: "OP_BIT_AND", OP_BIT_OR: "OP_BIT_OR",
  OP_BIT_XOR: "OP_BIT_XOR", OP_BIT_NOT: "OP_BIT_NOT",
  OP_LSHIFT: "OP_LSHIFT", OP_RSHIFT: "OP_RSHIFT",
  OP_INCREMENT: "OP_INCREMENT", OP_DECREMENT: "OP_DECREMENT",
  OP_ARROW: "OP_ARROW", OP_DOT: "OP_DOT",
  OP_QUESTION: "OP_QUESTION", OP_COLON: "OP_COLON",

  // Delimiters
  DL_LPAREN: "DL_LPAREN", DL_RPAREN: "DL_RPAREN",
  DL_LBRACE: "DL_LBRACE", DL_RBRACE: "DL_RBRACE",
  DL_LBRACKET: "DL_LBRACKET", DL_RBRACKET: "DL_RBRACKET",
  DL_SEMICOLON: "DL_SEMICOLON", DL_COMMA: "DL_COMMA",

  // Special
  IDENTIFIER: "IDENTIFIER", EOF: "EOF",
};

const KEYWORDS = {
  let: TokenType.KW_LET, const: TokenType.KW_CONST, function: TokenType.KW_FUNCTION,
  return: TokenType.KW_RETURN, if: TokenType.KW_IF, else: TokenType.KW_ELSE,
  for: TokenType.KW_FOR, while: TokenType.KW_WHILE, do: TokenType.KW_DO,
  switch: TokenType.KW_SWITCH, case: TokenType.KW_CASE, default: TokenType.KW_DEFAULT,
  break: TokenType.KW_BREAK, continue: TokenType.KW_CONTINUE,
  type: TokenType.KW_TYPE, class: TokenType.KW_CLASS,
  new: TokenType.KW_NEW, this: TokenType.KW_THIS, super: TokenType.KW_SUPER,
  extends: TokenType.KW_EXTENDS, import: TokenType.KW_IMPORT, from: TokenType.KW_FROM,
  export: TokenType.KW_EXPORT, enum: TokenType.KW_ENUM,
  try: TokenType.KW_TRY, catch: TokenType.KW_CATCH, throw: TokenType.KW_THROW,
  of: TokenType.KW_OF, ref: TokenType.KW_REF, null: TokenType.KW_NULL,
  true: TokenType.KW_TRUE, false: TokenType.KW_FALSE,
  cpp: TokenType.KW_CPP, cpp_include: TokenType.KW_CPP_INCLUDE,
  // Type keywords
  int: TokenType.TYPE_INT, float: TokenType.TYPE_FLOAT, double: TokenType.TYPE_DOUBLE,
  bool: TokenType.TYPE_BOOL, string: TokenType.TYPE_STRING, char: TokenType.TYPE_CHAR,
  void: TokenType.TYPE_VOID, auto: TokenType.TYPE_AUTO,
  i8: TokenType.TYPE_I8, i16: TokenType.TYPE_I16, i32: TokenType.TYPE_I32, i64: TokenType.TYPE_I64,
  u8: TokenType.TYPE_U8, u16: TokenType.TYPE_U16, u32: TokenType.TYPE_U32, u64: TokenType.TYPE_U64,
  size: TokenType.TYPE_SIZE,
};

class Lexer {
  constructor(source, filename = "<stdin>") {
    this.source = source;
    this.filename = filename;
    this.pos = 0;
    this.line = 1;
    this.col = 1;
  }

  tokenize() {
    const tokens = [];
    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) break;

      const ch = this.source[this.pos];
      const loc = { line: this.line, col: this.col };

      // String
      if (ch === '"') { tokens.push(this.readString(loc)); continue; }
      // Char
      if (ch === "'" && this.source[this.pos + 2] === "'") { tokens.push(this.readChar(loc)); continue; }
      // Template literal
      if (ch === '`') { tokens.push(this.readTemplate(loc)); continue; }
      // Number
      if (this.isDigit(ch)) { tokens.push(this.readNumber(loc)); continue; }
      // Identifier / keyword
      if (this.isAlpha(ch)) { tokens.push(this.readIdentifier(loc)); continue; }
      // Operators & delimiters
      const tok = this.readOperator(loc);
      if (tok) { tokens.push(tok); continue; }

      this.error(`Unexpected character '${ch}'`, loc);
      this.advance();
    }
    tokens.push({ type: TokenType.EOF, value: "", line: this.line, col: this.col });
    return tokens;
  }

  skipWhitespaceAndComments() {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === ' ' || ch === '\t' || ch === '\r') { this.advance(); continue; }
      if (ch === '\n') { this.advance(); this.line++; this.col = 1; continue; }
      // Line comment
      if (ch === '/' && this.source[this.pos + 1] === '/') {
        while (this.pos < this.source.length && this.source[this.pos] !== '\n') this.advance();
        continue;
      }
      // Block comment
      if (ch === '/' && this.source[this.pos + 1] === '*') {
        this.advance(); this.advance();
        while (this.pos < this.source.length) {
          if (this.source[this.pos] === '\n') { this.line++; this.col = 0; }
          if (this.source[this.pos] === '*' && this.source[this.pos + 1] === '/') {
            this.advance(); this.advance(); break;
          }
          this.advance();
        }
        continue;
      }
      break;
    }
  }

  readString(loc) {
    this.advance(); // skip "
    let val = "";
    while (this.pos < this.source.length && this.source[this.pos] !== '"') {
      if (this.source[this.pos] === '\\') {
        this.advance();
        const esc = this.source[this.pos];
        val += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc === '\\' ? '\\' : esc === '"' ? '"' : esc;
      } else {
        val += this.source[this.pos];
      }
      this.advance();
    }
    this.advance(); // skip "
    return { type: TokenType.LIT_STRING, value: val, ...loc };
  }

  readChar(loc) {
    this.advance(); // skip '
    const val = this.source[this.pos];
    this.advance();
    this.advance(); // skip '
    return { type: TokenType.LIT_CHAR, value: val, ...loc };
  }

  readTemplate(loc) {
    this.advance(); // skip `
    let raw = "";
    while (this.pos < this.source.length && this.source[this.pos] !== '`') {
      if (this.source[this.pos] === '\n') { this.line++; this.col = 0; }
      raw += this.source[this.pos];
      this.advance();
    }
    this.advance(); // skip `
    return { type: TokenType.LIT_TEMPLATE, value: raw, ...loc };
  }

  readNumber(loc) {
    let num = "";
    // Hex / binary
    if (this.source[this.pos] === '0' && (this.source[this.pos + 1] === 'x' || this.source[this.pos + 1] === 'b')) {
      num += this.source[this.pos]; this.advance();
      num += this.source[this.pos]; this.advance();
      while (this.pos < this.source.length && this.isAlphaNum(this.source[this.pos])) {
        num += this.source[this.pos]; this.advance();
      }
      return { type: TokenType.LIT_INT, value: num, ...loc };
    }
    while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
      num += this.source[this.pos]; this.advance();
    }
    if (this.pos < this.source.length && this.source[this.pos] === '.' && this.isDigit(this.source[this.pos + 1])) {
      num += '.'; this.advance();
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        num += this.source[this.pos]; this.advance();
      }
      return { type: TokenType.LIT_FLOAT, value: num, ...loc };
    }
    return { type: TokenType.LIT_INT, value: num, ...loc };
  }

  readIdentifier(loc) {
    let id = "";
    while (this.pos < this.source.length && this.isAlphaNum(this.source[this.pos])) {
      id += this.source[this.pos]; this.advance();
    }
    // cpp_include is two-word keyword
    if (id === "cpp" && this.source.substring(this.pos, this.pos + 8) === "_include") {
      for (let i = 0; i < 8; i++) { id += this.source[this.pos]; this.advance(); }
    }
    const kw = KEYWORDS[id];
    if (kw) return { type: kw, value: id, ...loc };
    return { type: TokenType.IDENTIFIER, value: id, ...loc };
  }

  readOperator(loc) {
    const s = this.source;
    const p = this.pos;
    // 3-char
    if (s[p] === '=' && s[p+1] === '=' && s[p+2] === '=') { this.advance(); this.advance(); this.advance(); return { type: TokenType.OP_STRICT_EQ, value: "===", ...loc }; }
    if (s[p] === '!' && s[p+1] === '=' && s[p+2] === '=') { this.advance(); this.advance(); this.advance(); return { type: TokenType.OP_STRICT_NEQ, value: "!==", ...loc }; }
    // 2-char
    const two = s[p] + (s[p+1] || '');
    const twoMap = {
      '==': TokenType.OP_EQ, '!=': TokenType.OP_NEQ,
      '<=': TokenType.OP_LTE, '>=': TokenType.OP_GTE,
      '&&': TokenType.OP_AND, '||': TokenType.OP_OR,
      '<<': TokenType.OP_LSHIFT, '>>': TokenType.OP_RSHIFT,
      '++': TokenType.OP_INCREMENT, '--': TokenType.OP_DECREMENT,
      '+=': TokenType.OP_PLUS_ASSIGN, '-=': TokenType.OP_MINUS_ASSIGN,
      '*=': TokenType.OP_STAR_ASSIGN, '/=': TokenType.OP_SLASH_ASSIGN,
      '%=': TokenType.OP_PERCENT_ASSIGN, '=>': TokenType.OP_ARROW,
    };
    if (twoMap[two]) { this.advance(); this.advance(); return { type: twoMap[two], value: two, ...loc }; }
    // 1-char
    const oneMap = {
      '+': TokenType.OP_PLUS, '-': TokenType.OP_MINUS, '*': TokenType.OP_STAR,
      '/': TokenType.OP_SLASH, '%': TokenType.OP_PERCENT, '=': TokenType.OP_ASSIGN,
      '<': TokenType.OP_LT, '>': TokenType.OP_GT,
      '!': TokenType.OP_NOT, '&': TokenType.OP_BIT_AND, '|': TokenType.OP_BIT_OR,
      '^': TokenType.OP_BIT_XOR, '~': TokenType.OP_BIT_NOT,
      '.': TokenType.OP_DOT, '?': TokenType.OP_QUESTION, ':': TokenType.OP_COLON,
      '(': TokenType.DL_LPAREN, ')': TokenType.DL_RPAREN,
      '{': TokenType.DL_LBRACE, '}': TokenType.DL_RBRACE,
      '[': TokenType.DL_LBRACKET, ']': TokenType.DL_RBRACKET,
      ';': TokenType.DL_SEMICOLON, ',': TokenType.DL_COMMA,
    };
    if (oneMap[s[p]]) { this.advance(); return { type: oneMap[s[p]], value: s[p], ...loc }; }
    return null;
  }

  advance() { this.pos++; this.col++; }
  isDigit(c) { return c >= '0' && c <= '9'; }
  isAlpha(c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'; }
  isAlphaNum(c) { return this.isAlpha(c) || this.isDigit(c); }
  error(msg, loc) { console.error(`Lexer error at ${this.filename}:${loc.line}:${loc.col}: ${msg}`); }
}

// ============================================================================
// PARSER â€” Recursive descent producing an AST
// ============================================================================

class Parser {
  constructor(tokens, filename = "<stdin>") {
    this.tokens = tokens;
    this.pos = 0;
    this.filename = filename;
  }

  parse() {
    const body = [];
    while (!this.atEnd()) {
      body.push(this.parseTopLevel());
    }
    return { type: "Program", body };
  }

  // ---- Helpers ----
  cur()  { return this.tokens[this.pos]; }
  peek(n = 1) { return this.tokens[this.pos + n] || { type: TokenType.EOF }; }
  atEnd() { return this.cur().type === TokenType.EOF; }
  advance() { const t = this.cur(); this.pos++; return t; }
  expect(type, msg) {
    if (this.cur().type !== type) this.error(msg || `Expected ${type}, got ${this.cur().type} ('${this.cur().value}')`);
    return this.advance();
  }
  match(type) { if (this.cur().type === type) { this.advance(); return true; } return false; }
  check(type) { return this.cur().type === type; }
  error(msg) {
    const t = this.cur();
    throw new Error(`Parse error at ${this.filename}:${t.line}:${t.col}: ${msg}`);
  }

  // ---- Top level ----
  parseTopLevel() {
    const t = this.cur();
    if (t.type === TokenType.KW_FUNCTION)   return this.parseFunctionDecl();
    if (t.type === TokenType.KW_LET || t.type === TokenType.KW_CONST) return this.parseVarDecl();
    if (t.type === TokenType.KW_CLASS)      return this.parseClassDecl();
    if (t.type === TokenType.KW_TYPE)       return this.parseTypeDecl();
    if (t.type === TokenType.KW_ENUM)       return this.parseEnumDecl();
    if (t.type === TokenType.KW_IMPORT)     return this.parseImport();
    if (t.type === TokenType.KW_EXPORT)     return this.parseExport();
    if (t.type === TokenType.KW_CPP_INCLUDE) return this.parseCppInclude();
    if (t.type === TokenType.KW_CPP)        return this.parseCppBlock();
    return this.parseStatement();
  }

  // ---- Statements ----
  parseStatement() {
    const t = this.cur();
    if (t.type === TokenType.KW_LET || t.type === TokenType.KW_CONST) return this.parseVarDecl();
    if (t.type === TokenType.KW_RETURN)    return this.parseReturn();
    if (t.type === TokenType.KW_IF)        return this.parseIf();
    if (t.type === TokenType.KW_FOR)       return this.parseFor();
    if (t.type === TokenType.KW_WHILE)     return this.parseWhile();
    if (t.type === TokenType.KW_DO)        return this.parseDoWhile();
    if (t.type === TokenType.KW_SWITCH)    return this.parseSwitchStmt();
    if (t.type === TokenType.KW_TRY)       return this.parseTryCatch();
    if (t.type === TokenType.KW_THROW)     return this.parseThrow();
    if (t.type === TokenType.KW_BREAK)     { this.advance(); this.expect(TokenType.DL_SEMICOLON); return { type: "BreakStmt" }; }
    if (t.type === TokenType.KW_CONTINUE)  { this.advance(); this.expect(TokenType.DL_SEMICOLON); return { type: "ContinueStmt" }; }
    if (t.type === TokenType.KW_CPP)       return this.parseCppBlock();
    if (t.type === TokenType.DL_LBRACE)    return this.parseBlock();
    if (t.type === TokenType.KW_FUNCTION)  return this.parseFunctionDecl();
    // Expression statement
    const expr = this.parseExpression();
    this.expect(TokenType.DL_SEMICOLON, "Expected ';' after expression");
    return { type: "ExprStmt", expr };
  }

  parseBlock() {
    this.expect(TokenType.DL_LBRACE);
    const body = [];
    while (!this.check(TokenType.DL_RBRACE) && !this.atEnd()) {
      body.push(this.parseStatement());
    }
    this.expect(TokenType.DL_RBRACE);
    return { type: "Block", body };
  }

  parseBlockOrStmt() {
    if (this.check(TokenType.DL_LBRACE)) return this.parseBlock();
    const stmt = this.parseStatement();
    return { type: "Block", body: [stmt] };
  }

  // ---- Variable declarations ----
  parseVarDecl() {
    const kind = this.advance().value; // let or const
    const name = this.expect(TokenType.IDENTIFIER, "Expected variable name").value;
    let typeAnnotation = null;
    if (this.match(TokenType.OP_COLON)) {
      typeAnnotation = this.parseTypeExpr();
    }
    let init = null;
    if (this.match(TokenType.OP_ASSIGN)) {
      init = this.parseExpression();
    }
    this.expect(TokenType.DL_SEMICOLON, "Expected ';' after variable declaration");
    return { type: "VarDecl", kind, name, typeAnnotation, init };
  }

  // ---- Functions ----
  parseFunctionDecl() {
    this.expect(TokenType.KW_FUNCTION);
    const name = this.expect(TokenType.IDENTIFIER, "Expected function name").value;
    const genericParams = this.parseOptionalGenericParams();
    this.expect(TokenType.DL_LPAREN);
    const params = this.parseParamList();
    this.expect(TokenType.DL_RPAREN);
    let returnType = null;
    if (this.match(TokenType.OP_COLON)) returnType = this.parseTypeExpr();
    const body = this.parseBlock();
    return { type: "FunctionDecl", name, genericParams, params, returnType, body };
  }

  parseParamList() {
    const params = [];
    while (!this.check(TokenType.DL_RPAREN) && !this.atEnd()) {
      const isRef = this.match(TokenType.KW_REF);
      // Accept identifier or soft keywords as a parameter name.
      const t = this.cur();
      const isSoftKw =
        t.type === TokenType.KW_TYPE ||
        t.type === TokenType.KW_OF ||
        t.type === TokenType.KW_FROM ||
        t.type === TokenType.KW_AS;
      if (t.type !== TokenType.IDENTIFIER && !isSoftKw) {
        this.error("Expected parameter name");
      }
      const name = this.advance().value;
      let typeAnnotation = null;
      if (this.match(TokenType.OP_COLON)) typeAnnotation = this.parseTypeExpr();
      let defaultValue = null;
      if (this.match(TokenType.OP_ASSIGN)) defaultValue = this.parseExpression();
      params.push({ name, typeAnnotation, defaultValue, isRef });
      if (!this.check(TokenType.DL_RPAREN)) this.expect(TokenType.DL_COMMA);
    }
    return params;
  }

  parseOptionalGenericParams() {
    if (!this.check(TokenType.OP_LT)) return [];
    // Disambiguate: only parse generics if it looks like <Ident, Ident>
    const saved = this.pos;
    this.advance(); // <
    const params = [];
    if (this.check(TokenType.IDENTIFIER)) {
      params.push(this.advance().value);
      while (this.match(TokenType.DL_COMMA)) {
        params.push(this.expect(TokenType.IDENTIFIER).value);
      }
      if (this.match(TokenType.OP_GT)) return params;
    }
    this.pos = saved; // backtrack
    return [];
  }

  // ---- Type expressions ----
  parseTypeExpr() {
    let name = "";
    if (this.cur().type.startsWith("TYPE_") || this.cur().type === TokenType.IDENTIFIER) {
      name = this.advance().value;
    } else {
      this.error("Expected type");
    }
    let isArray = false;
    if (this.check(TokenType.DL_LBRACKET) && this.peek().type === TokenType.DL_RBRACKET) {
      this.advance(); this.advance();
      isArray = true;
    }
    let isOptional = false;
    if (this.match(TokenType.OP_QUESTION)) isOptional = true;
    return { type: "TypeExpr", name, isArray, isOptional };
  }

  // ---- Control flow ----
  parseReturn() {
    this.advance(); // return
    let value = null;
    if (!this.check(TokenType.DL_SEMICOLON)) value = this.parseExpression();
    this.expect(TokenType.DL_SEMICOLON, "Expected ';' after return");
    return { type: "ReturnStmt", value };
  }

  parseIf() {
    this.advance(); // if
    this.expect(TokenType.DL_LPAREN);
    const condition = this.parseExpression();
    this.expect(TokenType.DL_RPAREN);
    const then = this.parseBlockOrStmt();
    let elseBody = null;
    if (this.match(TokenType.KW_ELSE)) {
      if (this.check(TokenType.KW_IF)) {
        elseBody = { type: "Block", body: [this.parseIf()] };
      } else {
        elseBody = this.parseBlockOrStmt();
      }
    }
    return { type: "IfStmt", condition, then, else: elseBody };
  }

  parseFor() {
    this.advance(); // for
    this.expect(TokenType.DL_LPAREN);
    // Check for for-of
    if ((this.check(TokenType.KW_LET) || this.check(TokenType.KW_CONST)) &&
        this.peek().type === TokenType.IDENTIFIER &&
        this.peek(2).type === TokenType.KW_OF) {
      const kind = this.advance().value;
      const varName = this.advance().value;
      this.advance(); // of
      const iterable = this.parseExpression();
      this.expect(TokenType.DL_RPAREN);
      const body = this.parseBlockOrStmt();
      return { type: "ForOfStmt", kind, varName, iterable, body };
    }
    // C-style for
    let init = null;
    if (!this.check(TokenType.DL_SEMICOLON)) {
      if (this.check(TokenType.KW_LET) || this.check(TokenType.KW_CONST)) {
        const kind = this.advance().value;
        const name = this.expect(TokenType.IDENTIFIER).value;
        let typeAnnotation = null;
        if (this.match(TokenType.OP_COLON)) typeAnnotation = this.parseTypeExpr();
        this.expect(TokenType.OP_ASSIGN);
        const val = this.parseExpression();
        init = { type: "VarDecl", kind, name, typeAnnotation, init: val };
      } else {
        init = { type: "ExprStmt", expr: this.parseExpression() };
      }
    }
    this.expect(TokenType.DL_SEMICOLON);
    let condition = null;
    if (!this.check(TokenType.DL_SEMICOLON)) condition = this.parseExpression();
    this.expect(TokenType.DL_SEMICOLON);
    let update = null;
    if (!this.check(TokenType.DL_RPAREN)) update = this.parseExpression();
    this.expect(TokenType.DL_RPAREN);
    const body = this.parseBlockOrStmt();
    return { type: "ForStmt", init, condition, update, body };
  }

  parseWhile() {
    this.advance(); // while
    this.expect(TokenType.DL_LPAREN);
    const condition = this.parseExpression();
    this.expect(TokenType.DL_RPAREN);
    const body = this.parseBlockOrStmt();
    return { type: "WhileStmt", condition, body };
  }

  parseDoWhile() {
    this.advance(); // do
    const body = this.parseBlock();
    this.expect(TokenType.KW_WHILE);
    this.expect(TokenType.DL_LPAREN);
    const condition = this.parseExpression();
    this.expect(TokenType.DL_RPAREN);
    this.expect(TokenType.DL_SEMICOLON);
    return { type: "DoWhileStmt", condition, body };
  }

  parseSwitchStmt() {
    this.advance(); // switch
    this.expect(TokenType.DL_LPAREN);
    const disc = this.parseExpression();
    this.expect(TokenType.DL_RPAREN);
    this.expect(TokenType.DL_LBRACE);
    const cases = [];
    let defaultCase = null;
    while (!this.check(TokenType.DL_RBRACE) && !this.atEnd()) {
      if (this.match(TokenType.KW_CASE)) {
        const val = this.parseExpression();
        this.expect(TokenType.OP_COLON);
        const body = [];
        while (!this.check(TokenType.KW_CASE) && !this.check(TokenType.KW_DEFAULT) && !this.check(TokenType.DL_RBRACE)) {
          body.push(this.parseStatement());
        }
        cases.push({ value: val, body });
      } else if (this.match(TokenType.KW_DEFAULT)) {
        this.expect(TokenType.OP_COLON);
        const body = [];
        while (!this.check(TokenType.KW_CASE) && !this.check(TokenType.DL_RBRACE)) {
          body.push(this.parseStatement());
        }
        defaultCase = { body };
      }
    }
    this.expect(TokenType.DL_RBRACE);
    return { type: "SwitchStmt", discriminant: disc, cases, default: defaultCase };
  }

  parseTryCatch() {
    this.advance(); // try
    const tryBlock = this.parseBlock();
    this.expect(TokenType.KW_CATCH);
    this.expect(TokenType.DL_LPAREN);
    const param = this.expect(TokenType.IDENTIFIER).value;
    let paramType = null;
    if (this.match(TokenType.OP_COLON)) paramType = this.parseTypeExpr();
    this.expect(TokenType.DL_RPAREN);
    const catchBlock = this.parseBlock();
    return { type: "TryCatch", tryBlock, param, paramType, catchBlock };
  }

  parseThrow() {
    this.advance(); // throw
    const value = this.parseExpression();
    this.expect(TokenType.DL_SEMICOLON);
    return { type: "ThrowStmt", value };
  }

  // ---- Class ----
  parseClassDecl() {
    this.advance(); // class
    const name = this.expect(TokenType.IDENTIFIER).value;
    let base = null;
    if (this.match(TokenType.KW_EXTENDS)) base = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.DL_LBRACE);
    const fields = [], methods = [];
    let ctor = null;
    while (!this.check(TokenType.DL_RBRACE) && !this.atEnd()) {
      if (this.cur().value === "constructor") {
        this.advance();
        this.expect(TokenType.DL_LPAREN);
        const params = this.parseParamList();
        this.expect(TokenType.DL_RPAREN);
        const body = this.parseBlock();
        ctor = { params, body };
      } else if (this.check(TokenType.KW_FUNCTION)) {
        methods.push(this.parseFunctionDecl());
      } else if (
        this.check(TokenType.IDENTIFIER) ||
        this.cur().type.startsWith("TYPE_") ||
        // Allow soft keywords as field names (JS has no such restriction).
        this.check(TokenType.KW_TYPE) ||
        this.check(TokenType.KW_OF) ||
        this.check(TokenType.KW_FROM) ||
        this.check(TokenType.KW_AS)
      ) {
        // Field: name: type [= expr];
        const fname = this.advance().value;
        let ftype = null;
        if (this.match(TokenType.OP_COLON)) ftype = this.parseTypeExpr();
        let defaultVal = null;
        if (this.match(TokenType.OP_ASSIGN)) defaultVal = this.parseExpression();
        this.expect(TokenType.DL_SEMICOLON);
        fields.push({ name: fname, typeAnnotation: ftype, defaultValue: defaultVal });
      } else {
        this.error("Unexpected token in class body: " + this.cur().value);
      }
    }
    this.expect(TokenType.DL_RBRACE);
    return { type: "ClassDecl", name, base, fields, constructor: ctor, methods };
  }

  // ---- Type decl ----
  parseTypeDecl() {
    this.advance(); // type
    const name = this.expect(TokenType.IDENTIFIER).value;
    const genericParams = this.parseOptionalGenericParams();
    this.expect(TokenType.OP_ASSIGN);
    this.expect(TokenType.DL_LBRACE);
    const fields = [], methods = [];
    while (!this.check(TokenType.DL_RBRACE) && !this.atEnd()) {
      if (this.check(TokenType.KW_FUNCTION)) {
        methods.push(this.parseFunctionDecl());
      } else {
        const fname = this.expect(TokenType.IDENTIFIER).value;
        this.expect(TokenType.OP_COLON);
        const ftype = this.parseTypeExpr();
        let def = null;
        if (this.match(TokenType.OP_ASSIGN)) def = this.parseExpression();
        this.expect(TokenType.DL_SEMICOLON);
        fields.push({ name: fname, typeAnnotation: ftype, defaultValue: def });
      }
    }
    this.expect(TokenType.DL_RBRACE);
    this.expect(TokenType.DL_SEMICOLON);
    return { type: "TypeDecl", name, genericParams, fields, methods };
  }

  // ---- Enum ----
  parseEnumDecl() {
    this.advance(); // enum
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.DL_LBRACE);
    const members = [];
    while (!this.check(TokenType.DL_RBRACE) && !this.atEnd()) {
      const mname = this.expect(TokenType.IDENTIFIER).value;
      let val = null;
      if (this.match(TokenType.OP_ASSIGN)) val = this.parseExpression();
      members.push({ name: mname, value: val });
      this.match(TokenType.DL_COMMA);
    }
    this.expect(TokenType.DL_RBRACE);
    return { type: "EnumDecl", name, members };
  }

  // ---- Import / Export ----
  parseImport() {
    this.advance(); // import
    let names = [], alias = null;
    if (this.match(TokenType.OP_STAR)) {
      this.expect(TokenType.KW_AS, "Expected 'as'"); // as
      alias = this.expect(TokenType.IDENTIFIER).value;
    } else {
      this.expect(TokenType.DL_LBRACE);
      while (!this.check(TokenType.DL_RBRACE)) {
        names.push(this.expect(TokenType.IDENTIFIER).value);
        if (!this.check(TokenType.DL_RBRACE)) this.expect(TokenType.DL_COMMA);
      }
      this.expect(TokenType.DL_RBRACE);
    }
    this.expect(TokenType.KW_FROM);
    const source = this.expect(TokenType.LIT_STRING).value;
    this.expect(TokenType.DL_SEMICOLON);
    return { type: "ImportDecl", names, alias, source };
  }

  parseExport() {
    this.advance(); // export
    const decl = this.parseTopLevel();
    return { type: "ExportDecl", declaration: decl };
  }

  parseCppInclude() {
    this.advance(); // cpp_include
    const header = this.expect(TokenType.LIT_STRING).value;
    this.expect(TokenType.DL_SEMICOLON);
    return { type: "CppInclude", header };
  }

  parseCppBlock() {
    this.advance(); // cpp
    this.expect(TokenType.DL_LBRACE);
    // Read raw until matching brace
    let depth = 1, code = "";
    while (depth > 0 && this.pos < this.tokens.length) {
      const t = this.cur();
      if (t.type === TokenType.DL_LBRACE) depth++;
      if (t.type === TokenType.DL_RBRACE) { depth--; if (depth === 0) break; }
      code += t.value + " ";
      this.advance();
    }
    this.expect(TokenType.DL_RBRACE);
    return { type: "CppBlock", code: code.trim() };
  }

  // ---- Expressions ----
  parseExpression() { return this.parseAssignment(); }

  parseAssignment() {
    const left = this.parseTernary();
    const assignOps = [TokenType.OP_ASSIGN, TokenType.OP_PLUS_ASSIGN, TokenType.OP_MINUS_ASSIGN,
                       TokenType.OP_STAR_ASSIGN, TokenType.OP_SLASH_ASSIGN, TokenType.OP_PERCENT_ASSIGN];
    if (assignOps.includes(this.cur().type)) {
      const op = this.advance().value;
      const right = this.parseAssignment();
      return { type: "AssignExpr", op, left, right };
    }
    return left;
  }

  parseTernary() {
    let expr = this.parseOr();
    if (this.match(TokenType.OP_QUESTION)) {
      const then_ = this.parseExpression();
      this.expect(TokenType.OP_COLON);
      const else_ = this.parseTernary();
      return { type: "TernaryExpr", condition: expr, then: then_, else: else_ };
    }
    return expr;
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.match(TokenType.OP_OR)) { left = { type: "BinaryExpr", op: "||", left, right: this.parseAnd() }; }
    return left;
  }
  parseAnd() {
    let left = this.parseBitOr();
    while (this.match(TokenType.OP_AND)) { left = { type: "BinaryExpr", op: "&&", left, right: this.parseBitOr() }; }
    return left;
  }
  parseBitOr() {
    let left = this.parseBitXor();
    while (this.match(TokenType.OP_BIT_OR)) { left = { type: "BinaryExpr", op: "|", left, right: this.parseBitXor() }; }
    return left;
  }
  parseBitXor() {
    let left = this.parseBitAnd();
    while (this.match(TokenType.OP_BIT_XOR)) { left = { type: "BinaryExpr", op: "^", left, right: this.parseBitAnd() }; }
    return left;
  }
  parseBitAnd() {
    let left = this.parseEquality();
    while (this.match(TokenType.OP_BIT_AND)) { left = { type: "BinaryExpr", op: "&", left, right: this.parseEquality() }; }
    return left;
  }
  parseEquality() {
    let left = this.parseRelational();
    while (true) {
      if (this.match(TokenType.OP_STRICT_EQ))  { left = { type: "BinaryExpr", op: "===", left, right: this.parseRelational() }; continue; }
      if (this.match(TokenType.OP_STRICT_NEQ)) { left = { type: "BinaryExpr", op: "!==", left, right: this.parseRelational() }; continue; }
      if (this.match(TokenType.OP_EQ))  { left = { type: "BinaryExpr", op: "==", left, right: this.parseRelational() }; continue; }
      if (this.match(TokenType.OP_NEQ)) { left = { type: "BinaryExpr", op: "!=", left, right: this.parseRelational() }; continue; }
      break;
    }
    return left;
  }
  parseRelational() {
    let left = this.parseShift();
    while (true) {
      if (this.match(TokenType.OP_LT))  { left = { type: "BinaryExpr", op: "<",  left, right: this.parseShift() }; continue; }
      if (this.match(TokenType.OP_GT))  { left = { type: "BinaryExpr", op: ">",  left, right: this.parseShift() }; continue; }
      if (this.match(TokenType.OP_LTE)) { left = { type: "BinaryExpr", op: "<=", left, right: this.parseShift() }; continue; }
      if (this.match(TokenType.OP_GTE)) { left = { type: "BinaryExpr", op: ">=", left, right: this.parseShift() }; continue; }
      break;
    }
    return left;
  }
  parseShift() {
    let left = this.parseAdditive();
    while (true) {
      if (this.match(TokenType.OP_LSHIFT)) { left = { type: "BinaryExpr", op: "<<", left, right: this.parseAdditive() }; continue; }
      if (this.match(TokenType.OP_RSHIFT)) { left = { type: "BinaryExpr", op: ">>", left, right: this.parseAdditive() }; continue; }
      break;
    }
    return left;
  }
  parseAdditive() {
    let left = this.parseMultiplicative();
    while (true) {
      if (this.match(TokenType.OP_PLUS))  { left = { type: "BinaryExpr", op: "+", left, right: this.parseMultiplicative() }; continue; }
      if (this.match(TokenType.OP_MINUS)) { left = { type: "BinaryExpr", op: "-", left, right: this.parseMultiplicative() }; continue; }
      break;
    }
    return left;
  }
  parseMultiplicative() {
    let left = this.parseUnary();
    while (true) {
      if (this.match(TokenType.OP_STAR))    { left = { type: "BinaryExpr", op: "*", left, right: this.parseUnary() }; continue; }
      if (this.match(TokenType.OP_SLASH))   { left = { type: "BinaryExpr", op: "/", left, right: this.parseUnary() }; continue; }
      if (this.match(TokenType.OP_PERCENT)) { left = { type: "BinaryExpr", op: "%", left, right: this.parseUnary() }; continue; }
      break;
    }
    return left;
  }
  parseUnary() {
    if (this.match(TokenType.OP_NOT))       return { type: "UnaryExpr", op: "!",  operand: this.parseUnary(), prefix: true };
    if (this.match(TokenType.OP_MINUS))     return { type: "UnaryExpr", op: "-",  operand: this.parseUnary(), prefix: true };
    if (this.match(TokenType.OP_BIT_NOT))   return { type: "UnaryExpr", op: "~",  operand: this.parseUnary(), prefix: true };
    if (this.match(TokenType.OP_INCREMENT)) return { type: "UnaryExpr", op: "++", operand: this.parseUnary(), prefix: true };
    if (this.match(TokenType.OP_DECREMENT)) return { type: "UnaryExpr", op: "--", operand: this.parseUnary(), prefix: true };
    return this.parsePostfix();
  }

  parsePostfix() {
    let expr = this.parsePrimary();
    while (true) {
      if (this.match(TokenType.OP_INCREMENT)) { expr = { type: "UnaryExpr", op: "++", operand: expr, prefix: false }; continue; }
      if (this.match(TokenType.OP_DECREMENT)) { expr = { type: "UnaryExpr", op: "--", operand: expr, prefix: false }; continue; }
      if (this.check(TokenType.DL_LPAREN)) {
        this.advance();
        const args = [];
        while (!this.check(TokenType.DL_RPAREN) && !this.atEnd()) {
          args.push(this.parseExpression());
          if (!this.check(TokenType.DL_RPAREN)) this.expect(TokenType.DL_COMMA);
        }
        this.expect(TokenType.DL_RPAREN);
        expr = { type: "CallExpr", callee: expr, args };
        continue;
      }
      if (this.match(TokenType.OP_DOT)) {
        // Accept identifier or soft keywords as a member name (JS has no
        // restriction: `foo.type`, `foo.of`, `foo.from`, `foo.as` are all fine).
        const mt = this.cur();
        const isSoftKw =
          mt.type === TokenType.KW_TYPE ||
          mt.type === TokenType.KW_OF ||
          mt.type === TokenType.KW_FROM ||
          mt.type === TokenType.KW_AS;
        if (mt.type !== TokenType.IDENTIFIER && !isSoftKw) {
          this.error("Expected member name");
        }
        const member = this.advance().value;
        expr = { type: "MemberExpr", object: expr, member };
        continue;
      }
      if (this.check(TokenType.DL_LBRACKET)) {
        this.advance();
        const index = this.parseExpression();
        this.expect(TokenType.DL_RBRACKET);
        expr = { type: "IndexExpr", object: expr, index };
        continue;
      }
      break;
    }
    return expr;
  }

  parsePrimary() {
    const t = this.cur();
    // Literals
    if (t.type === TokenType.LIT_INT)    { this.advance(); return { type: "IntLiteral", value: parseInt(t.value) }; }
    if (t.type === TokenType.LIT_FLOAT)  { this.advance(); return { type: "FloatLiteral", value: parseFloat(t.value) }; }
    if (t.type === TokenType.LIT_STRING) { this.advance(); return { type: "StringLiteral", value: t.value }; }
    if (t.type === TokenType.LIT_CHAR)   { this.advance(); return { type: "CharLiteral", value: t.value }; }
    if (t.type === TokenType.LIT_TEMPLATE) { this.advance(); return this.parseTemplateParts(t.value); }
    if (t.type === TokenType.KW_TRUE)    { this.advance(); return { type: "BoolLiteral", value: true }; }
    if (t.type === TokenType.KW_FALSE)   { this.advance(); return { type: "BoolLiteral", value: false }; }
    if (t.type === TokenType.KW_NULL)    { this.advance(); return { type: "NullLiteral" }; }
    if (t.type === TokenType.KW_THIS)    { this.advance(); return { type: "ThisExpr" }; }
    if (t.type === TokenType.KW_SUPER)   { this.advance(); return { type: "SuperExpr" }; }
    // Anonymous function expression
    if (t.type === TokenType.KW_FUNCTION && this.peek().type === TokenType.DL_LPAREN) {
      return this.parseFunctionExpr();
    }
    // Named function expression (function name(...) { })
    if (t.type === TokenType.KW_FUNCTION && this.peek().type === TokenType.IDENTIFIER) {
      return this.parseFunctionExpr();
    }
    // new
    if (t.type === TokenType.KW_NEW) {
      this.advance();
      const name = this.expect(TokenType.IDENTIFIER).value;
      this.expect(TokenType.DL_LPAREN);
      const args = [];
      while (!this.check(TokenType.DL_RPAREN) && !this.atEnd()) {
        args.push(this.parseExpression());
        if (!this.check(TokenType.DL_RPAREN)) this.expect(TokenType.DL_COMMA);
      }
      this.expect(TokenType.DL_RPAREN);
      return { type: "NewExpr", name, args };
    }
    // Identifier
    if (t.type === TokenType.IDENTIFIER) { this.advance(); return { type: "Identifier", name: t.value }; }
    // Soft keywords usable as identifiers in expressions (matches JS behavior).
    if (
      t.type === TokenType.KW_TYPE ||
      t.type === TokenType.KW_OF ||
      t.type === TokenType.KW_FROM ||
      t.type === TokenType.KW_AS
    ) {
      this.advance();
      return { type: "Identifier", name: t.value };
    }
    // Parenthesized or arrow
    if (t.type === TokenType.DL_LPAREN) {
      // Try arrow function: (...) =>
      const saved = this.pos;
      try {
        return this.tryParseArrow();
      } catch {
        this.pos = saved;
        this.advance(); // (
        const expr = this.parseExpression();
        this.expect(TokenType.DL_RPAREN);
        return expr;
      }
    }
    // Array literal
    if (t.type === TokenType.DL_LBRACKET) {
      this.advance();
      const elements = [];
      while (!this.check(TokenType.DL_RBRACKET) && !this.atEnd()) {
        elements.push(this.parseExpression());
        if (!this.check(TokenType.DL_RBRACKET)) this.expect(TokenType.DL_COMMA);
      }
      this.expect(TokenType.DL_RBRACKET);
      return { type: "ArrayLiteral", elements };
    }
    // Object literal
    if (t.type === TokenType.DL_LBRACE) {
      this.advance();
      const fields = [];
      while (!this.check(TokenType.DL_RBRACE) && !this.atEnd()) {
        const key = this.expect(TokenType.IDENTIFIER, "Expected field name").value;
        this.expect(TokenType.OP_COLON);
        const val = this.parseExpression();
        fields.push({ key, value: val });
        if (!this.check(TokenType.DL_RBRACE)) this.expect(TokenType.DL_COMMA);
      }
      this.expect(TokenType.DL_RBRACE);
      return { type: "ObjectLiteral", fields };
    }
    this.error(`Unexpected token: ${t.type} ('${t.value}')`);
  }

  parseFunctionExpr() {
    this.advance(); // function
    let name = null;
    if (this.check(TokenType.IDENTIFIER)) name = this.advance().value;
    this.expect(TokenType.DL_LPAREN);
    const params = this.parseParamList();
    this.expect(TokenType.DL_RPAREN);
    let returnType = null;
    if (this.match(TokenType.OP_COLON)) returnType = this.parseTypeExpr();
    const body = this.parseBlock();
    return { type: "FunctionExpr", name, params, returnType, body };
  }

  tryParseArrow() {
    this.advance(); // (
    const params = this.parseParamList();
    this.expect(TokenType.DL_RPAREN);
    let returnType = null;
    if (this.match(TokenType.OP_COLON)) returnType = this.parseTypeExpr();
    this.expect(TokenType.OP_ARROW);
    let body, isBlock = false;
    if (this.check(TokenType.DL_LBRACE)) {
      body = this.parseBlock();
      isBlock = true;
    } else {
      body = this.parseExpression();
    }
    return { type: "ArrowFunction", params, returnType, body, isBlock };
  }

  parseTemplateParts(raw) {
    const strings = [];
    const expressions = [];
    let i = 0, cur = "";
    while (i < raw.length) {
      if (raw[i] === '$' && raw[i+1] === '{') {
        strings.push(cur); cur = "";
        i += 2;
        let depth = 1, exprStr = "";
        while (i < raw.length && depth > 0) {
          if (raw[i] === '{') depth++;
          if (raw[i] === '}') { depth--; if (depth === 0) { i++; break; } }
          exprStr += raw[i]; i++;
        }
        // Parse the inner expression
        const innerLexer = new Lexer(exprStr, this.filename);
        const innerTokens = innerLexer.tokenize();
        const innerParser = new Parser(innerTokens, this.filename);
        expressions.push(innerParser.parseExpression());
      } else {
        cur += raw[i]; i++;
      }
    }
    strings.push(cur);
    return { type: "TemplateLiteral", strings, expressions };
  }
}

// ============================================================================
// CODE GENERATOR â€” AST â†’ C++
// ============================================================================

class CodeGenerator {
  constructor() {
    this.includes = new Set();
    this.helpersPrint = false;
    this.helpersSetVec = false;
    this.indent = 0;
    this.anonCount = 0;
    // Track struct definitions that need to be emitted before main
    this.structDefs = [];
  }

  generate(ast) {
    // Two-pass: first collect info, then emit
    const bodyCode = this.emitProgram(ast);

    let out = "// Generated by JSPP compiler\n\n";
    for (const inc of [...this.includes].sort()) out += `#include ${inc}\n`;
    out += "\n";

    // Emit helpers
    if (this.helpersPrint) {
      out += `template<typename... Args>\nvoid print(Args&&... args) {\n`;
      out += `    bool __first = true;\n`;
      out += `    ((std::cout << (__first ? "" : " ") << args, __first = false), ...);\n`;
      out += `    std::cout << std::endl;\n}\n\n`;
    }
    if (this.helpersSetVec) {
      out += `template<typename T>\nvoid __jspp_set(std::vector<T>& v, size_t i, T val) {\n`;
      out += `    if (i >= v.size()) v.resize(i + 1);\n`;
      out += `    v[i] = std::move(val);\n}\n\n`;
    }
    // Emit struct defs
    for (const s of this.structDefs) out += s + "\n\n";

    out += bodyCode;
    return out;
  }

  emitProgram(ast) {
    // Separate: top-level declarations vs executable statements
    const decls = [];  // functions, classes, types, enums, imports, cpp blocks
    const exec = [];   // everything else goes in main()
    let hasMain = false;

    for (const stmt of ast.body) {
      if (stmt.type === "FunctionDecl") {
        if (stmt.name === "main") hasMain = true;
        decls.push(stmt);
      } else if (["ClassDecl", "TypeDecl", "EnumDecl", "ImportDecl",
                   "ExportDecl", "CppInclude", "CppBlock"].includes(stmt.type)) {
        decls.push(stmt);
      } else {
        exec.push(stmt);
      }
    }

    let out = "";
    for (const d of decls) out += this.emitNode(d);

    // If there are executable statements and no explicit main(), wrap them
    if (exec.length > 0 && !hasMain) {
      out += "int main() {\n";
      this.indent++;
      for (const s of exec) out += this.emitNode(s);
      out += this.pad() + "return 0;\n";
      this.indent--;
      out += "}\n";
    }
    return out;
  }

  emitNode(node) {
    switch (node.type) {
      case "VarDecl":       return this.emitVarDecl(node);
      case "FunctionDecl":  return this.emitFunctionDecl(node);
      case "ClassDecl":     return this.emitClassDecl(node);
      case "TypeDecl":      return this.emitTypeDecl(node);
      case "EnumDecl":      return this.emitEnumDecl(node);
      case "ImportDecl":    return this.emitImport(node);
      case "ExportDecl":    return this.emitNode(node.declaration);
      case "CppInclude":    return this.emitCppInclude(node);
      case "CppBlock":      return this.emitCppBlock(node);
      case "Block":         return this.emitBlock(node);
      case "ExprStmt":      return this.pad() + this.emitExpr(node.expr) + ";\n";
      case "ReturnStmt":    return this.emitReturn(node);
      case "IfStmt":        return this.emitIf(node);
      case "ForStmt":       return this.emitFor(node);
      case "ForOfStmt":     return this.emitForOf(node);
      case "WhileStmt":     return this.emitWhile(node);
      case "DoWhileStmt":   return this.emitDoWhile(node);
      case "SwitchStmt":    return this.emitSwitch(node);
      case "TryCatch":      return this.emitTryCatch(node);
      case "ThrowStmt":     return this.pad() + `throw std::string(${this.emitExpr(node.value)});\n`;
      case "BreakStmt":     return this.pad() + "break;\n";
      case "ContinueStmt":  return this.pad() + "continue;\n";
      default:
        return this.pad() + `/* unknown node: ${node.type} */\n`;
    }
  }

  // ---- Declarations ----
  emitVarDecl(node) {
    let cppType = node.typeAnnotation ? this.emitType(node.typeAnnotation) : null;
    const prefix = node.kind === "const" ? "const " : "";

    if (node.init) {
      // Infer type from initializer when no annotation
      if (!cppType) {
        cppType = this.inferExprType(node.init);
      }
      let initStr = this.emitExprWithType(node.init, cppType);
      return this.pad() + `${prefix}${cppType} ${node.name} = ${initStr};\n`;
    }
    return this.pad() + `${prefix}${cppType || "auto"} ${node.name};\n`;
  }

  emitFunctionDecl(node) {
    const retType = node.returnType ? this.emitType(node.returnType) : "auto";
    const params = node.params.map(p => {
      const t = p.typeAnnotation ? this.emitType(p.typeAnnotation) : "auto";
      const ref = p.isRef ? "&" : "";
      let s = `${t}${ref} ${p.name}`;
      if (p.defaultValue) s += ` = ${this.emitExpr(p.defaultValue)}`;
      return s;
    }).join(", ");
    let gen = "";
    if (node.genericParams && node.genericParams.length > 0) {
      gen = `template<${node.genericParams.map(g => `typename ${g}`).join(", ")}>\n`;
    }
    let out = gen + this.pad() + `${retType} ${node.name}(${params}) {\n`;
    this.indent++;
    for (const s of node.body.body) out += this.emitNode(s);
    this.indent--;
    out += this.pad() + "}\n\n";
    return out;
  }

  emitClassDecl(node) {
    let out = this.pad() + `class ${node.name}`;
    if (node.base) out += ` : public ${node.base}`;
    out += " {\npublic:\n";
    this.indent++;
    // Fields
    for (const f of node.fields) {
      const t = f.typeAnnotation ? this.emitType(f.typeAnnotation) : "auto";
      let line = this.pad() + `${t} ${f.name}`;
      if (f.defaultValue) line += ` = ${this.emitExpr(f.defaultValue)}`;
      out += line + ";\n";
    }
    out += "\n";
    // Constructor
    if (node.constructor) {
      const params = node.constructor.params.map(p => {
        const t = p.typeAnnotation ? this.emitType(p.typeAnnotation) : "auto";
        return `${t} ${p.name}`;
      }).join(", ");
      out += this.pad() + `${node.name}(${params}) {\n`;
      this.indent++;
      for (const s of node.constructor.body.body) out += this.emitNode(s);
      this.indent--;
      out += this.pad() + "}\n\n";
    }
    // Methods
    for (const m of node.methods) {
      out += this.emitFunctionDecl(m);
    }
    this.indent--;
    out += this.pad() + "};\n\n";
    return out;
  }

  emitTypeDecl(node) {
    let gen = "";
    if (node.genericParams && node.genericParams.length > 0) {
      gen = `template<${node.genericParams.map(g => `typename ${g}`).join(", ")}>\n`;
    }
    let out = gen + this.pad() + `struct ${node.name} {\n`;
    this.indent++;
    for (const f of node.fields) {
      const t = this.emitType(f.typeAnnotation);
      let line = this.pad() + `${t} ${f.name}`;
      if (f.defaultValue) line += ` = ${this.emitExpr(f.defaultValue)}`;
      out += line + ";\n";
    }
    for (const m of node.methods) out += this.emitFunctionDecl(m);
    this.indent--;
    out += this.pad() + "};\n\n";
    return out;
  }

  emitEnumDecl(node) {
    let out = this.pad() + `enum class ${node.name} {\n`;
    this.indent++;
    for (const m of node.members) {
      out += this.pad() + m.name;
      if (m.value !== null) out += ` = ${this.emitExpr(m.value)}`;
      out += ",\n";
    }
    this.indent--;
    out += this.pad() + "};\n\n";
    return out;
  }

  emitImport(node) {
    let header = node.source.replace(/^\.\//, "").replace(/\.[^.]+$/, "");
    return `#include "${header}.hpp"\n`;
  }

  emitCppInclude(node) {
    const h = node.header;
    this.includes.add(h.startsWith("<") ? h : h);
    return "";
  }

  emitCppBlock(node) {
    return this.pad() + node.code + "\n";
  }

  // ---- Statements ----
  emitBlock(node) {
    let out = this.pad() + "{\n";
    this.indent++;
    for (const s of node.body) out += this.emitNode(s);
    this.indent--;
    out += this.pad() + "}\n";
    return out;
  }

  emitReturn(node) {
    if (node.value) return this.pad() + `return ${this.emitExpr(node.value)};\n`;
    return this.pad() + "return;\n";
  }

  emitIf(node) {
    let out = this.pad() + `if (${this.emitExpr(node.condition)}) {\n`;
    this.indent++;
    for (const s of node.then.body) out += this.emitNode(s);
    this.indent--;
    if (node.else) {
      if (node.else.body.length === 1 && node.else.body[0].type === "IfStmt") {
        out += this.pad() + "} else ";
        // Remove leading indent from nested if
        out += this.emitIf(node.else.body[0]).trimStart();
      } else {
        out += this.pad() + "} else {\n";
        this.indent++;
        for (const s of node.else.body) out += this.emitNode(s);
        this.indent--;
        out += this.pad() + "}\n";
      }
    } else {
      out += this.pad() + "}\n";
    }
    return out;
  }

  emitFor(node) {
    let init = "";
    if (node.init) {
      if (node.init.type === "VarDecl") {
        const t = node.init.typeAnnotation ? this.emitType(node.init.typeAnnotation) : this.inferExprType(node.init.init);
        const initVal = node.init.init ? this.emitExprWithType(node.init.init, t) : "";
        init = `${t} ${node.init.name} = ${initVal}`;
      } else {
        init = this.emitExpr(node.init.expr);
      }
    }
    const cond = node.condition ? this.emitExpr(node.condition) : "";
    const upd = node.update ? this.emitExpr(node.update) : "";
    let out = this.pad() + `for (${init}; ${cond}; ${upd}) {\n`;
    this.indent++;
    for (const s of node.body.body) out += this.emitNode(s);
    this.indent--;
    out += this.pad() + "}\n";
    return out;
  }

  emitForOf(node) {
    this.includes.add("<vector>");
    let out = this.pad() + `for (auto& ${node.varName} : ${this.emitExpr(node.iterable)}) {\n`;
    this.indent++;
    for (const s of node.body.body) out += this.emitNode(s);
    this.indent--;
    out += this.pad() + "}\n";
    return out;
  }

  emitWhile(node) {
    let out = this.pad() + `while (${this.emitExpr(node.condition)}) {\n`;
    this.indent++;
    for (const s of node.body.body) out += this.emitNode(s);
    this.indent--;
    out += this.pad() + "}\n";
    return out;
  }

  emitDoWhile(node) {
    let out = this.pad() + "do {\n";
    this.indent++;
    for (const s of node.body.body) out += this.emitNode(s);
    this.indent--;
    out += this.pad() + `} while (${this.emitExpr(node.condition)});\n`;
    return out;
  }

  emitSwitch(node) {
    let out = this.pad() + `switch (${this.emitExpr(node.discriminant)}) {\n`;
    this.indent++;
    for (const c of node.cases) {
      out += this.pad() + `case ${this.emitExpr(c.value)}:\n`;
      this.indent++;
      for (const s of c.body) out += this.emitNode(s);
      this.indent--;
    }
    if (node.default) {
      out += this.pad() + "default:\n";
      this.indent++;
      for (const s of node.default.body) out += this.emitNode(s);
      this.indent--;
    }
    this.indent--;
    out += this.pad() + "}\n";
    return out;
  }

  emitTryCatch(node) {
    let out = this.pad() + "try {\n";
    this.indent++;
    for (const s of node.tryBlock.body) out += this.emitNode(s);
    this.indent--;
    const ptype = node.paramType ? `const ${this.emitType(node.paramType)}&` : "const auto&";
    out += this.pad() + `} catch (${ptype} ${node.param}) {\n`;
    this.indent++;
    for (const s of node.catchBlock.body) out += this.emitNode(s);
    this.indent--;
    out += this.pad() + "}\n";
    return out;
  }

  // ---- Expressions ----
  emitExpr(node) {
    switch (node.type) {
      case "IntLiteral":     return String(node.value);
      case "FloatLiteral":   return String(node.value);
      case "StringLiteral":  return `"${this.escapeString(node.value)}"`;
      case "CharLiteral":    return `'${node.value}'`;
      case "BoolLiteral":    return node.value ? "true" : "false";
      case "NullLiteral":    return "nullptr";
      case "Identifier":     return node.name;
      case "ThisExpr":       return "this";
      case "SuperExpr":      return this.emitSuper();
      case "BinaryExpr":     return this.emitBinary(node);
      case "UnaryExpr":      return this.emitUnary(node);
      case "AssignExpr":     return this.emitAssign(node);
      case "CallExpr":       return this.emitCall(node);
      case "MemberExpr":     return this.emitMember(node);
      case "IndexExpr":      return this.emitIndex(node);
      case "ArrayLiteral":   return this.emitArray(node);
      case "ObjectLiteral":  return this.emitObject(node);
      case "TemplateLiteral": return this.emitTemplate(node);
      case "TernaryExpr":    return `(${this.emitExpr(node.condition)} ? ${this.emitExpr(node.then)} : ${this.emitExpr(node.else)})`;
      case "NewExpr":        return this.emitNew(node);
      case "ArrowFunction":  return this.emitArrow(node);
      case "FunctionExpr":   return this.emitFuncExpr(node);
      default:               return `/* unknown expr: ${node.type} */`;
    }
  }

  emitBinary(node) {
    const l = this.emitExpr(node.left);
    const r = this.emitExpr(node.right);
    let op = node.op;
    if (op === "===") op = "==";
    if (op === "!==") op = "!=";
    return `(${l} ${op} ${r})`;
  }

  emitUnary(node) {
    const o = this.emitExpr(node.operand);
    if (node.prefix) return `(${node.op}${o})`;
    return `(${o}${node.op})`;
  }

  emitAssign(node) {
    // Check for array index assignment: arr[i] = val â†’ __jspp_set
    if (node.op === "=" && node.left.type === "IndexExpr") {
      this.helpersSetVec = true;
      this.includes.add("<vector>");
      const obj = this.emitExpr(node.left.object);
      const idx = this.emitExpr(node.left.index);
      const val = this.emitExpr(node.right);
      return `__jspp_set(${obj}, (size_t)(${idx}), ${val})`;
    }
    return `${this.emitExpr(node.left)} ${node.op} ${this.emitExpr(node.right)}`;
  }

  emitCall(node) {
    // Special cases: print, console.log
    if (node.callee.type === "Identifier" && node.callee.name === "print") {
      this.helpersPrint = true;
      this.includes.add("<iostream>");
      const args = node.args.map(a => this.emitExpr(a)).join(", ");
      return `print(${args})`;
    }
    if (node.callee.type === "MemberExpr" && node.callee.object.type === "Identifier" &&
        node.callee.object.name === "console" && node.callee.member === "log") {
      this.includes.add("<iostream>");
      const parts = node.args.map(a => this.emitExpr(a));
      return `(std::cout << ${parts.join(' << " " << ')} << std::endl)`;
    }
    // Array methods
    if (node.callee.type === "MemberExpr") {
      const obj = this.emitExpr(node.callee.object);
      const method = node.callee.member;
      if (method === "push") {
        this.includes.add("<vector>");
        return `${obj}.push_back(${node.args.map(a => this.emitExpr(a)).join(", ")})`;
      }
      if (method === "pop") {
        return `${obj}.pop_back()`;
      }
      if (method === "includes") {
        this.includes.add("<algorithm>");
        const val = this.emitExpr(node.args[0]);
        return `(std::find(${obj}.begin(), ${obj}.end(), ${val}) != ${obj}.end())`;
      }
    }
    // Super call
    if (node.callee.type === "SuperExpr") {
      // This is handled in constructor context as base class init
      const args = node.args.map(a => this.emitExpr(a)).join(", ");
      return `/* super(${args}) */`;
    }
    const callee = this.emitExpr(node.callee);
    const args = node.args.map(a => this.emitExpr(a)).join(", ");
    return `${callee}(${args})`;
  }

  emitMember(node) {
    const obj = this.emitExpr(node.object);
    // Math.* â†’ std::*
    if (node.object.type === "Identifier" && node.object.name === "Math") {
      this.includes.add("<cmath>");
      const mathMap = { sqrt: "std::sqrt", abs: "std::abs", floor: "std::floor",
                        ceil: "std::ceil", max: "std::max", min: "std::min",
                        PI: "M_PI", random: "((double)rand() / RAND_MAX)" };
      if (mathMap[node.member]) return mathMap[node.member];
    }
    // .length â†’ .size()
    if (node.member === "length") {
      this.includes.add("<vector>");
      return `${obj}.size()`;
    }
    return `${obj}.${node.member}`;
  }

  emitIndex(node) {
    return `${this.emitExpr(node.object)}[${this.emitExpr(node.index)}]`;
  }

  emitArray(node) {
    this.includes.add("<vector>");
    if (node.elements.length === 0) return "std::vector<int>{}";
    const innerType = this.inferExprType(node.elements[0]);
    const els = node.elements.map(e => this.emitExpr(e)).join(", ");
    return `std::vector<${innerType}>{${els}}`;
  }

  emitObject(node) {
    // Generate anonymous struct
    const name = `__anon_${this.anonCount++}`;
    const fields = node.fields.map(f => {
      const val = this.emitExpr(f.value);
      const cppType = this.inferLiteralType(f.value);
      return { name: f.key, type: cppType, value: val };
    });
    const structDef = `struct ${name} {\n${fields.map(f => `    ${f.type} ${f.name};`).join("\n")}\n};`;
    this.structDefs.push(structDef);
    const initList = fields.map(f => f.value).join(", ");
    return `${name}{${initList}}`;
  }

  emitTemplate(node) {
    this.includes.add("<format>");
    const formatStr = node.strings.join("{}");
    const args = node.expressions.map(e => this.emitExpr(e));
    if (args.length === 0) return `"${this.escapeString(formatStr)}"`;
    return `std::format("${this.escapeString(formatStr)}", ${args.join(", ")})`;
  }

  emitNew(node) {
    this.includes.add("<memory>");
    const args = node.args.map(a => this.emitExpr(a)).join(", ");
    return `std::make_unique<${node.name}>(${args})`;
  }

  emitArrow(node) {
    const params = node.params.map(p => {
      const t = p.typeAnnotation ? this.emitType(p.typeAnnotation) : "auto";
      return `${t} ${p.name}`;
    }).join(", ");
    let ret = node.returnType ? ` -> ${this.emitType(node.returnType)}` : "";
    if (node.isBlock) {
      let body = "{\n";
      this.indent++;
      for (const s of node.body.body) body += this.emitNode(s);
      this.indent--;
      body += this.pad() + "}";
      return `[](${params})${ret} ${body}`;
    } else {
      return `[](${params})${ret} { return ${this.emitExpr(node.body)}; }`;
    }
  }

  emitFuncExpr(node) {
    // Analyze captured variables â€” for prototype, just use [=] mutable
    const params = node.params.map(p => {
      const t = p.typeAnnotation ? this.emitType(p.typeAnnotation) : "auto";
      return `${t} ${p.name}`;
    }).join(", ");
    let ret = node.returnType ? ` -> ${this.emitType(node.returnType)}` : "";
    let body = "{\n";
    this.indent++;
    for (const s of node.body.body) body += this.emitNode(s);
    this.indent--;
    body += this.pad() + "}";
    return `[=](${params})${ret} mutable ${body}`;
  }

  emitSuper() { return "/* super */"; }

  // ---- Types ----
  emitType(typeNode) {
    if (!typeNode) return "auto";
    const map = {
      int: "int", i8: "int8_t", i16: "int16_t", i32: "int32_t", i64: "int64_t",
      u8: "uint8_t", u16: "uint16_t", u32: "uint32_t", u64: "uint64_t",
      float: "float", double: "double", bool: "bool", char: "char",
      string: "std::string", void: "void", auto: "auto", size: "size_t",
    };
    let cppType = map[typeNode.name] || typeNode.name;
    if (typeNode.isArray) {
      this.includes.add("<vector>");
      cppType = `std::vector<${cppType}>`;
    }
    if (typeNode.isOptional) {
      this.includes.add("<optional>");
      cppType = `std::optional<${cppType}>`;
    }
    return cppType;
  }

  inferLiteralType(expr) {
    if (expr.type === "IntLiteral") return "int";
    if (expr.type === "FloatLiteral") return "double";
    if (expr.type === "StringLiteral") { this.includes.add("<string>"); return "std::string"; }
    if (expr.type === "BoolLiteral") return "bool";
    if (expr.type === "CharLiteral") return "char";
    return "auto";
  }

  inferExprType(expr) {
    if (expr.type === "IntLiteral") return "int";
    if (expr.type === "FloatLiteral") return "double";
    if (expr.type === "StringLiteral") { this.includes.add("<string>"); return "std::string"; }
    if (expr.type === "BoolLiteral") return "bool";
    if (expr.type === "CharLiteral") return "char";
    if (expr.type === "ArrayLiteral") {
      this.includes.add("<vector>");
      if (expr.elements.length > 0) {
        const inner = this.inferExprType(expr.elements[0]);
        return `std::vector<${inner}>`;
      }
      return "std::vector<int>"; // default empty array
    }
    if (expr.type === "ObjectLiteral") return "auto";
    if (expr.type === "BinaryExpr") {
      const lt = this.inferExprType(expr.left);
      const rt = this.inferExprType(expr.right);
      if (lt === "std::string" || rt === "std::string") return "std::string";
      if (lt === "double" || rt === "double") return "double";
      if (lt === "bool" && rt === "bool") return "bool";
      if (["<", ">", "<=", ">=", "===", "!==", "==", "!="].includes(expr.op)) return "bool";
      return lt !== "auto" ? lt : rt;
    }
    if (expr.type === "CallExpr") return "auto";
    if (expr.type === "FunctionExpr" || expr.type === "ArrowFunction") return "auto";
    return "auto";
  }

  emitExprWithType(expr, targetType) {
    // For array literals, emit with explicit vector type
    if (expr.type === "ArrayLiteral" && targetType && targetType.startsWith("std::vector")) {
      const els = expr.elements.map(e => this.emitExpr(e)).join(", ");
      return `${targetType}{${els}}`;
    }
    return this.emitExpr(expr);
  }

  // ---- Helpers ----
  pad() { return "    ".repeat(this.indent); }
  escapeString(s) { return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t"); }
}

// ============================================================================
// INTERPRETER â€” Tree-walking evaluator for direct execution
// ============================================================================

class RETURN_SIGNAL { constructor(val) { this.value = val; } }

class Environment {
  constructor(parent = null) {
    this.vars = new Map();
    this.parent = parent;
  }
  define(name, value) { this.vars.set(name, value); }
  get(name) {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.get(name);
    throw new Error(`Undefined variable: ${name}`);
  }
  set(name, value) {
    if (this.vars.has(name)) { this.vars.set(name, value); return; }
    if (this.parent) { this.parent.set(name, value); return; }
    throw new Error(`Undefined variable: ${name}`);
  }
  has(name) {
    if (this.vars.has(name)) return true;
    return this.parent ? this.parent.has(name) : false;
  }
}

class Interpreter {
  constructor(options = {}) {
    this.global = new Environment();
    this.output = [];
    this.currentFile = null;
    this.onOutput = typeof options.onOutput === "function"
      ? options.onOutput
      : (line => console.log(line));
    // Built-in: print
    this.global.define("print", (...args) => {
      const line = args.map(a => String(a)).join(" ");
      this.emitOutput(line);
    });

    // ---- Standard Library ----
    this._installStdlib();
  }

  _installStdlib() {
    const g = this.global;

    // -- Math object --
    g.define("Math", {
      PI: Math.PI,
      E: Math.E,
      LN2: Math.LN2,
      LN10: Math.LN10,
      SQRT2: Math.SQRT2,
      abs:   (x) => Math.abs(x),
      floor: (x) => Math.floor(x),
      ceil:  (x) => Math.ceil(x),
      round: (x) => Math.round(x),
      sqrt:  (x) => Math.sqrt(x),
      pow:   (x, y) => Math.pow(x, y),
      min:   (...a) => Math.min(...a),
      max:   (...a) => Math.max(...a),
      random: () => Math.random(),
      sin:   (x) => Math.sin(x),
      cos:   (x) => Math.cos(x),
      tan:   (x) => Math.tan(x),
      atan2: (y, x) => Math.atan2(y, x),
      log:   (x) => Math.log(x),
      log2:  (x) => Math.log2(x),
      log10: (x) => Math.log10(x),
      sign:  (x) => Math.sign(x),
      trunc: (x) => Math.trunc(x),
      clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    });

    // -- JSON object --
    g.define("JSON", {
      parse:     (s) => JSON.parse(s),
      stringify: (v, _r, indent) => JSON.stringify(v, null, indent),
    });

    // -- console object --
    g.define("console", {
      log: (...args) => {
        const line = args.map(a => String(a)).join(" ");
        this.emitOutput(line);
      },
      error: (...args) => {
        const line = args.map(a => String(a)).join(" ");
        this.emitOutput("[error] " + line);
      },
      warn: (...args) => {
        const line = args.map(a => String(a)).join(" ");
        this.emitOutput("[warn] " + line);
      },
    });

    // -- Type conversion / utility globals --
    g.define("parseInt",    (s, radix) => parseInt(s, radix));
    g.define("parseFloat",  (s) => parseFloat(s));
    g.define("isNaN",       (v) => isNaN(v));
    g.define("isFinite",    (v) => isFinite(v));
    g.define("Number",      (v) => Number(v));
    g.define("String",      (v) => String(v));
    g.define("Boolean",     (v) => Boolean(v));
    g.define("typeof",      (v) => typeof v);
    g.define("Array",       { isArray: (v) => Array.isArray(v) });

    // -- Object utilities --
    g.define("Object", {
      keys:    (o) => Object.keys(o),
      values:  (o) => Object.values(o),
      entries: (o) => Object.entries(o),
      assign:  (t, ...s) => Object.assign(t, ...s),
      freeze:  (o) => Object.freeze(o),
    });

    // -- Date constructor wrapper and helpers --
    const DateCtor = function(...args) {
      const d = args.length ? new globalThis.Date(...args) : new globalThis.Date();
      return {
        getTime: () => d.getTime(),
        valueOf: () => d.valueOf(),
        toString: () => d.toString(),
        toISOString: () => d.toISOString(),
        getFullYear: () => d.getFullYear(),
        getMonth: () => d.getMonth(),
        getDate: () => d.getDate(),
        getHours: () => d.getHours(),
        getMinutes: () => d.getMinutes(),
        getSeconds: () => d.getSeconds(),
        getMilliseconds: () => d.getMilliseconds(),
      };
    };
    DateCtor.now = () => Date.now();
    DateCtor.parse = (s) => Date.parse(s);
    DateCtor.UTC = (...a) => Date.UTC(...a);
    g.define("Date", DateCtor);

    // -- RegExp wrapper --
    const RegExpCtor = function(pattern, flags) {
      const r = new globalThis.RegExp(pattern, flags);
      return {
        test: (s) => r.test(s),
        exec: (s) => r.exec(s),
        toString: () => r.toString(),
      };
    };
    g.define("RegExp", RegExpCtor);

    // -- Timer shims (use host environment timers) --
    g.define("setTimeout", (fn, ms) => {
      if (typeof fn !== "function") return null;
      try {
        return setTimeout(() => { try { fn(); } catch (e) { this.emitOutput("[error] " + (e && e.message ? e.message : String(e))); } }, ms);
      } catch (e) {
        return null;
      }
    });
    g.define("clearTimeout", (id) => { try { clearTimeout(id); } catch (e) {} });
    g.define("setInterval", (fn, ms) => {
      if (typeof fn !== "function") return null;
      try { return setInterval(() => { try { fn(); } catch (e) { this.emitOutput("[error] " + (e && e.message ? e.message : String(e))); } }, ms); } catch (e) { return null; }
    });
    g.define("clearInterval", (id) => { try { clearInterval(id); } catch (e) {} });

    // -- Lodash-like utilities --
    const _cloneDeep = (v, map = new Map()) => {
      if (v === null || typeof v !== "object") return v;
      if (map.has(v)) return map.get(v);
      if (Array.isArray(v)) {
        const arr = [];
        map.set(v, arr);
        for (let i = 0; i < v.length; i++) arr[i] = _cloneDeep(v[i], map);
        return arr;
      }
      if (typeof v.getTime === "function") return new globalThis.Date(v.getTime());
      const out = {};
      map.set(v, out);
      for (const k of Object.keys(v)) out[k] = _cloneDeep(v[k], map);
      return out;
    };

    const _isEqual = (a, b) => {
      const eq = (x, y) => {
        if (x === y) return true;
        if (x === null || y === null) return false;
        if (typeof x !== "object" || typeof y !== "object") return false;
        if (Array.isArray(x) !== Array.isArray(y)) return false;
        if (Array.isArray(x)) {
          if (x.length !== y.length) return false;
          for (let i = 0; i < x.length; i++) if (!eq(x[i], y[i])) return false;
          return true;
        }
        if (typeof x.getTime === "function" && typeof y.getTime === "function") return x.getTime() === y.getTime();
        const kx = Object.keys(x), ky = Object.keys(y);
        if (kx.length !== ky.length) return false;
        for (const k of kx) {
          if (!ky.includes(k)) return false;
          if (!eq(x[k], y[k])) return false;
        }
        return true;
      };
      return eq(a, b);
    };

    const _merge = (target, ...sources) => {
      if (!target || typeof target !== "object") target = {};
      const mergeRec = (t, s) => {
        for (const k of Object.keys(s)) {
          const sv = s[k];
          if (sv && typeof sv === "object" && !Array.isArray(sv)) {
            if (!t[k] || typeof t[k] !== "object") t[k] = {};
            mergeRec(t[k], sv);
          } else {
            t[k] = _cloneDeep(sv);
          }
        }
      };
      for (const s of sources) if (s && typeof s === "object") mergeRec(target, s);
      return target;
    };

    const _debounce = (fn, wait = 0, immediate = false) => {
      let timeout = null;
      const deb = (...args) => {
        const later = () => {
          timeout = null;
          if (!immediate) fn(...args);
        };
        const callNow = immediate && !timeout;
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) fn(...args);
      };
      deb.cancel = () => { if (timeout) { clearTimeout(timeout); timeout = null; } };
      return deb;
    };

    const _get = (obj, path, defaultValue) => {
      if (obj == null) return defaultValue;
      let parts = path;
      if (typeof parts === 'string') {
        parts = parts.replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '').split('.');
      }
      if (!Array.isArray(parts)) parts = [parts];
      let o = obj;
      for (const k of parts) {
        if (o == null) return defaultValue;
        o = o[k];
      }
      return o === undefined ? defaultValue : o;
    };

    const _set = (obj, path, value) => {
      if (obj == null) return obj;
      let parts = path;
      if (typeof parts === 'string') {
        parts = parts.replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '').split('.');
      }
      if (!Array.isArray(parts)) parts = [parts];
      let o = obj;
      for (let i = 0; i < parts.length; i++) {
        const k = parts[i];
        const isLast = i === parts.length - 1;
        const nextKey = parts[i+1];
        if (isLast) {
          o[k] = value;
        } else {
          if (o[k] == null || typeof o[k] !== 'object') {
            // create array if nextKey looks like a number
            if (/^\d+$/.test(String(nextKey))) o[k] = [];
            else o[k] = {};
          }
          o = o[k];
        }
      }
      return obj;
    };

    g.define("_", {
      cloneDeep: _cloneDeep,
      isEqual: _isEqual,
      merge: _merge,
      debounce: _debounce,
      get: _get,
      set: _set,
    });

    // -- tiny-invariant --
    g.define("invariant", (cond, msg) => {
      if (!cond) throw new Error(msg || "Invariant failed");
    });
    
    // -- tiny-warning --
    g.define("warning", (cond, msg) => {
      if (!cond) {
        const line = msg || "";
        this.emitOutput("[warn] " + String(line));
      }
    });

    // -- assert (simple) --
    g.define("assert", (cond, msg) => {
      if (!cond) throw new Error(msg || "Assertion failed");
    });
    
    // -- EventEmitter (small Node-style emitter) --
    const EventEmitterCtor = function() {
      const listeners = {};
      const api = {
        on: (evt, handler) => {
          if (typeof handler !== "function") return;
          if (!listeners[evt]) listeners[evt] = [];
          listeners[evt].push(handler);
        },
        off: (evt, handler) => {
          const list = listeners[evt];
          if (!list) return;
          const idx = list.indexOf(handler);
          if (idx >= 0) list.splice(idx, 1);
        },
        emit: (evt, ...args) => {
          const list = listeners[evt];
          if (!list) return;
          const copy = list.slice();
          for (const h of copy) {
            try { h(...args); } catch (e) { /* ignore handler errors */ }
          }
        },
        once: (evt, handler) => {
          const wrapper = (...args) => { api.off(evt, wrapper); handler(...args); };
          api.on(evt, wrapper);
        },
      };
      return api;
    };
    g.define("EventEmitter", EventEmitterCtor);
    
    // -- UUID v4 generator --
    const uuidV4 = () => {
      const bytes = new Uint8Array(16);
      try {
        if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
          globalThis.crypto.getRandomValues(bytes);
        } else {
          for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
        }
      } catch (e) {
        for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
      // Per RFC 4122: set version and variant bits
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
    };
    g.define("uuid", { v4: uuidV4 });
    // -- MS duration parser/formatter --
    g.define("ms", {
      parse: (s) => {
        if (s === null || s === undefined) return NaN;
        if (typeof s === "number") return Number(s);
        const str = String(s).trim();
        const m = str.match(/^(-?(?:\d+)?\.?\d+)\s*(ms|s|m|h|d|w|y)?$/i);
        if (!m) return NaN;
        const num = parseFloat(m[1]);
        const unit = (m[2] || 'ms').toLowerCase();
        const mul = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000, y: 31536000000 };
        return Math.round(num * (mul[unit] || 1));
      },
      format: (val, long = false) => {
        let msVal = Number(val) || 0;
        const sign = msVal < 0 ? '-' : '';
        const abs = Math.abs(msVal);
        const units = [
          { name: 'y', ms: 31536000000, longSing: 'year', longPl: 'years' },
          { name: 'd', ms: 86400000, longSing: 'day', longPl: 'days' },
          { name: 'h', ms: 3600000, longSing: 'hour', longPl: 'hours' },
          { name: 'm', ms: 60000, longSing: 'minute', longPl: 'minutes' },
          { name: 's', ms: 1000, longSing: 'second', longPl: 'seconds' },
          { name: 'ms', ms: 1, longSing: 'millisecond', longPl: 'milliseconds' },
        ];
        for (const u of units) {
          if (abs >= u.ms) {
            const v = msVal / u.ms;
            const av = Math.abs(v);
            const display = (av % 1 === 0) ? String(Math.abs(v)) : String(Math.round(av * 10) / 10);
            if (long) {
              return `${sign}${display} ${av === 1 ? u.longSing : u.longPl}`;
            }
            return `${sign}${display}${u.name}`;
          }
        }
        return `${msVal}ms`;
      }
    });

    // -- Query string utilities --
    g.define("queryString", {
      parse: (qs) => {
        if (!qs) return {};
        let s = qs;
        if (s[0] === "?") s = s.slice(1);
        const parts = s.split("&").filter(p => p.length > 0);
        const out = {};
        for (const p of parts) {
          const idx = p.indexOf("=");
          let k, v;
          if (idx >= 0) { k = p.slice(0, idx); v = p.slice(idx + 1); }
          else { k = p; v = ""; }
          k = decodeURIComponent(k.replace(/\+/g, " "));
          v = decodeURIComponent((v||"").replace(/\+/g, " "));
          if (Object.prototype.hasOwnProperty.call(out, k)) {
            if (!Array.isArray(out[k])) out[k] = [out[k]];
            out[k].push(v);
          } else {
            out[k] = v;
          }
        }
        return out;
      },
      stringify: (obj) => {
        if (!obj) return "";
        const parts = [];
        for (const k of Object.keys(obj)) {
          const val = obj[k];
          const ke = encodeURIComponent(k);
          if (Array.isArray(val)) {
            for (const v of val) parts.push(ke + "=" + encodeURIComponent(String(v)));
          } else if (val === null || val === undefined) {
            parts.push(ke + "=");
          } else if (typeof val === "object") {
            parts.push(ke + "=" + encodeURIComponent(JSON.stringify(val)));
          } else {
            parts.push(ke + "=" + encodeURIComponent(String(val)));
          }
        }
        return parts.join("&");
      }
    });
    
    // -- Path utilities (POSIX-like with Windows drive support) --
    const g_getPathNormalize = (p) => {
      p = String(p || "").replace(/\\/g, '/');
      const driveMatch = p.match(/^([A-Za-z]:)(\/|$)/);
      let drive = '';
      if (driveMatch) { drive = driveMatch[1]; p = p.slice(drive.length); }
      const absolute = p.startsWith('/');
      const parts = p.split('/').filter(s => s.length > 0);
      const stack = [];
      for (const part of parts) {
        if (part === '.') continue;
        if (part === '..') {
          if (stack.length > 0) stack.pop();
          else if (!absolute) stack.push('..');
        } else {
          stack.push(part);
        }
      }
      let res = (absolute ? '/' : '') + stack.join('/');
      if (drive) {
        if (res === '' || res === '/') res = drive + '/';
        else res = drive + (res.startsWith('/') ? res : '/' + res);
      }
      if (res === '') res = absolute ? '/' : '.';
      return res;
    };

    g.define("path", {
      join: (...parts) => {
        const ps = parts.map(p => p == null ? '' : String(p));
        return g_getPathNormalize(ps.join('/'));
      },
      normalize: (p) => g_getPathNormalize(String(p)),
      basename: (p) => {
        p = String(p || '').replace(/\\/g, '/');
        if (p === '' || p === '/') return '';
        p = p.replace(/\/\/+$/,'');
        const idx = p.lastIndexOf('/');
        return idx >= 0 ? p.slice(idx+1) : p;
      },
      dirname: (p) => {
        p = String(p || '').replace(/\\/g, '/');
        if (p === '') return '.';
        p = p.replace(/\/\/+$/,'');
        const idx = p.lastIndexOf('/');
        if (idx === -1) {
          const m = p.match(/^([A-Za-z]:)$/);
          if (m) return m[1] + '/';
          return '.';
        }
        if (idx === 0) return '/';
        return p.slice(0, idx);
      },
      extname: (p) => {
        const base = String(p || '').replace(/\\/g,'/').replace(/\/\/+$/,'').split('/').pop();
        const idx = base.lastIndexOf('.');
        return (idx > 0) ? base.slice(idx) : '';
      },
      isAbsolute: (p) => {
        p = String(p || '');
        if (!p) return false;
        if (p[0] === '/' || p[0] === '\\') return true;
        return /^[A-Za-z]:[\\/]/.test(p);
      }
    });
    
    // -- date-fns subset (UTC-based, small useful helpers) --
    g.define("dateFns", {
      parseISO: (s) => {
        if (s === null || s === undefined) return DateCtor(NaN);
        if (typeof s === "number") return DateCtor(s);
        return DateCtor(Date.parse(String(s)));
      },
      format: (d, fmt) => {
        const ts = (d && typeof d.getTime === "function") ? d.getTime() : (typeof d === "number" ? d : Date.parse(String(d)));
        const date = new globalThis.Date(ts);
        const pad = (n, l = 2) => String(n).padStart(l, "0");
        const map = {
          yyyy: date.getUTCFullYear(),
          MM: pad(date.getUTCMonth() + 1),
          dd: pad(date.getUTCDate()),
          HH: pad(date.getUTCHours()),
          mm: pad(date.getUTCMinutes()),
          ss: pad(date.getUTCSeconds()),
          SSS: String(date.getUTCMilliseconds()).padStart(3, "0"),
        };
        return String(fmt).replace(/yyyy|MM|dd|HH|mm|ss|SSS/g, t => String(map[t]));
      },
      addDays: (d, n) => {
        const ts = (d && typeof d.getTime === "function") ? d.getTime() : (typeof d === "number" ? d : Date.parse(String(d)));
        const days = Number(n) || 0;
        return DateCtor(ts + Math.round(days) * 86400000);
      },
      differenceInDays: (a, b) => {
        const ta = (a && typeof a.getTime === "function") ? a.getTime() : (typeof a === "number" ? a : Date.parse(String(a)));
        const tb = (b && typeof b.getTime === "function") ? b.getTime() : (typeof b === "number" ? b : Date.parse(String(b)));
        return Math.floor((ta - tb) / 86400000);
      },
      startOfDay: (d) => {
        const ts = (d && typeof d.getTime === "function") ? d.getTime() : (typeof d === "number" ? d : Date.parse(String(d)));
        const dd = new globalThis.Date(ts);
        const utc = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), dd.getUTCDate());
        return DateCtor(utc);
      },
      endOfDay: (d) => {
        const ts = (d && typeof d.getTime === "function") ? d.getTime() : (typeof d === "number" ? d : Date.parse(String(d)));
        const dd = new globalThis.Date(ts);
        const start = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), dd.getUTCDate());
        return DateCtor(start + 86400000 - 1);
      },
      isSameDay: (a, b) => {
        const ta = (a && typeof a.getTime === "function") ? a.getTime() : Date.parse(String(a));
        const tb = (b && typeof b.getTime === "function") ? b.getTime() : Date.parse(String(b));
        const da = new globalThis.Date(ta);
        const db = new globalThis.Date(tb);
        return da.getUTCFullYear() === db.getUTCFullYear() && da.getUTCMonth() === db.getUTCMonth() && da.getUTCDate() === db.getUTCDate();
      },
      isBefore: (a, b) => {
        const ta = (a && typeof a.getTime === "function") ? a.getTime() : Date.parse(String(a));
        const tb = (b && typeof b.getTime === "function") ? b.getTime() : Date.parse(String(b));
        return ta < tb;
      },
      isAfter: (a, b) => {
        const ta = (a && typeof a.getTime === "function") ? a.getTime() : Date.parse(String(a));
        const tb = (b && typeof b.getTime === "function") ? b.getTime() : Date.parse(String(b));
        return ta > tb;
      }
    });
  }

  emitOutput(line) {
    this.output.push(line);
    if (this.onOutput) {
      this.onOutput(line);
    }
  }

  run(ast) {
    for (const node of ast.body) {
      this.execNode(node, this.global);
    }
    return this.output;
  }

  execNode(node, env) {
    switch (node.type) {
      case "VarDecl":      return this.execVarDecl(node, env);
      case "FunctionDecl": return this.execFuncDecl(node, env);
      case "ReturnStmt":   throw new RETURN_SIGNAL(node.value ? this.evalExpr(node.value, env) : undefined);
      case "ExprStmt":     return this.evalExpr(node.expr, env);
      case "IfStmt":       return this.execIf(node, env);
      case "ForStmt":      return this.execFor(node, env);
      case "ForOfStmt":    return this.execForOf(node, env);
      case "WhileStmt":    return this.execWhile(node, env);
      case "DoWhileStmt":  return this.execDoWhile(node, env);
      case "SwitchStmt":   return this.execSwitch(node, env);
      case "TryCatch":     return this.execTryCatch(node, env);
      case "ThrowStmt":    throw this.evalExpr(node.value, env);
      case "ClassDecl":    return this.execClassDecl(node, env);
      case "TypeDecl":     return this.execTypeDecl(node, env);
      case "EnumDecl":     return this.execEnumDecl(node, env);
      case "ExportDecl":   return this.execNode(node.declaration, env);
      case "ImportDecl":   return this.execImport(node, env);
      case "Block":        return this.execBlock(node, env);
      case "BreakStmt":    throw "BREAK";
      case "ContinueStmt": throw "CONTINUE";
      case "CppInclude":   return; // no-op in interpreter
      case "CppBlock":     return; // no-op in interpreter
      default:
        throw new Error(`Interpreter: unhandled node type: ${node.type}`);
    }
  }

  execVarDecl(node, env) {
    const val = node.init ? this.evalExpr(node.init, env) : undefined;
    env.define(node.name, val);
  }

  execFuncDecl(node, env) {
    const closure = env;
    const fn = (...args) => {
      const local = new Environment(closure);
      for (let i = 0; i < node.params.length; i++) {
        local.define(node.params[i].name, args[i] !== undefined ? args[i] : (node.params[i].defaultValue ? this.evalExpr(node.params[i].defaultValue, local) : undefined));
      }
      try {
        for (const s of node.body.body) this.execNode(s, local);
      } catch (e) {
        if (e instanceof RETURN_SIGNAL) return e.value;
        throw e;
      }
      return undefined;
    };
    env.define(node.name, fn);
  }

  execIf(node, env) {
    if (this.isTruthy(this.evalExpr(node.condition, env))) {
      this.execBlock(node.then, env);
    } else if (node.else) {
      this.execBlock(node.else, env);
    }
  }

  execFor(node, env) {
    const loopEnv = new Environment(env);
    if (node.init) {
      if (node.init.type === "VarDecl") {
        this.execVarDecl(node.init, loopEnv);
      } else {
        this.evalExpr(node.init.expr, loopEnv);
      }
    }
    while (true) {
      if (node.condition && !this.isTruthy(this.evalExpr(node.condition, loopEnv))) break;
      try {
        for (const s of node.body.body) this.execNode(s, loopEnv);
      } catch (e) {
        if (e === "BREAK") break;
        if (e === "CONTINUE") { /* fall through to update */ }
        else throw e;
      }
      if (node.update) this.evalExpr(node.update, loopEnv);
    }
  }

  execForOf(node, env) {
    const iterable = this.evalExpr(node.iterable, env);
    for (const item of iterable) {
      const loopEnv = new Environment(env);
      loopEnv.define(node.varName, item);
      try {
        for (const s of node.body.body) this.execNode(s, loopEnv);
      } catch (e) {
        if (e === "BREAK") break;
        if (e === "CONTINUE") continue;
        throw e;
      }
    }
  }

  execWhile(node, env) {
    while (this.isTruthy(this.evalExpr(node.condition, env))) {
      try {
        for (const s of node.body.body) this.execNode(s, env);
      } catch (e) {
        if (e === "BREAK") break;
        if (e === "CONTINUE") continue;
        throw e;
      }
    }
  }

  execDoWhile(node, env) {
    do {
      try {
        for (const s of node.body.body) this.execNode(s, env);
      } catch (e) {
        if (e === "BREAK") break;
        if (e === "CONTINUE") continue;
        throw e;
      }
    } while (this.isTruthy(this.evalExpr(node.condition, env)));
  }

  execBlock(node, env) {
    const blockEnv = new Environment(env);
    for (const s of node.body) this.execNode(s, blockEnv);
  }

  // ---- Expression evaluator ----
  evalExpr(node, env) {
    switch (node.type) {
      case "IntLiteral":     return node.value;
      case "FloatLiteral":   return node.value;
      case "StringLiteral":  return node.value;
      case "CharLiteral":    return node.value;
      case "BoolLiteral":    return node.value;
      case "NullLiteral":    return null;
      case "Identifier":     return env.get(node.name);
      case "BinaryExpr":     return this.evalBinary(node, env);
      case "UnaryExpr":      return this.evalUnary(node, env);
      case "AssignExpr":     return this.evalAssign(node, env);
      case "CallExpr":       return this.evalCall(node, env);
      case "MemberExpr":     return this.evalMember(node, env);
      case "IndexExpr":      return this.evalIndex(node, env);
      case "ArrayLiteral":   return node.elements.map(e => this.evalExpr(e, env));
      case "ObjectLiteral":  return this.evalObject(node, env);
      case "TernaryExpr":    return this.isTruthy(this.evalExpr(node.condition, env)) ? this.evalExpr(node.then, env) : this.evalExpr(node.else, env);
      case "ArrowFunction":  return this.evalArrow(node, env);
      case "FunctionExpr":   return this.evalFuncExpr(node, env);
      case "TemplateLiteral": return this.evalTemplate(node, env);
      case "NewExpr":        return this.evalNew(node, env);
      case "ThisExpr":       return env.get("this");
      case "SuperExpr":      return env.has("super") ? env.get("super") : undefined;
      default:
        throw new Error(`Interpreter: unhandled expr: ${node.type}`);
    }
  }

  evalBinary(node, env) {
    const l = this.evalExpr(node.left, env);
    const r = this.evalExpr(node.right, env);
    switch (node.op) {
      case "+":   return l + r;
      case "-":   return l - r;
      case "*":   return l * r;
      case "/":   return l / r;
      case "%":   return l % r;
      case "<":   return l < r;
      case ">":   return l > r;
      case "<=":  return l <= r;
      case ">=":  return l >= r;
      case "==": case "===": return l === r;
      case "!=": case "!==": return l !== r;
      case "&&":  return l && r;
      case "||":  return l || r;
      default: throw new Error(`Unknown binary op: ${node.op}`);
    }
  }

  evalUnary(node, env) {
    const o = this.evalExpr(node.operand, env);
    switch (node.op) {
      case "-":  return -o;
      case "!":  return !o;
      case "++": {
        const nv = o + 1;
        this.assignTarget(node.operand, nv, env);
        return node.prefix ? nv : o;
      }
      case "--": {
        const nv = o - 1;
        this.assignTarget(node.operand, nv, env);
        return node.prefix ? nv : o;
      }
      default: throw new Error(`Unknown unary op: ${node.op}`);
    }
  }

  evalAssign(node, env) {
    let val = this.evalExpr(node.right, env);
    if (node.op !== "=") {
      const cur = this.evalLValue(node.left, env);
      const op = node.op.slice(0, -1); // +=  â†’ +
      val = this.applyOp(op, cur, val);
    }
    this.assignTarget(node.left, val, env);
    return val;
  }

  evalLValue(node, env) {
    if (node.type === "Identifier") return env.get(node.name);
    if (node.type === "MemberExpr") { const o = this.evalExpr(node.object, env); return o[node.member]; }
    if (node.type === "IndexExpr")  { const o = this.evalExpr(node.object, env); return o[this.evalExpr(node.index, env)]; }
    throw new Error("Invalid lvalue");
  }

  assignTarget(node, val, env) {
    if (node.type === "Identifier") { env.set(node.name, val); return; }
    if (node.type === "MemberExpr") {
      const o = this.evalExpr(node.object, env);
      o[node.member] = val;
      return;
    }
    if (node.type === "IndexExpr") {
      const o = this.evalExpr(node.object, env);
      const idx = this.evalExpr(node.index, env);
      // Auto-extend array if needed
      if (Array.isArray(o)) {
        while (o.length <= idx) o.push(undefined);
      }
      o[idx] = val;
      return;
    }
    throw new Error("Invalid assignment target");
  }

  applyOp(op, l, r) {
    switch (op) {
      case "+": return l + r;
      case "-": return l - r;
      case "*": return l * r;
      case "/": return l / r;
      case "%": return l % r;
      default: throw new Error(`Unknown op: ${op}`);
    }
  }

  evalCall(node, env) {
    // Handle member calls (obj.method)
    if (node.callee.type === "MemberExpr") {
      const obj = this.evalExpr(node.callee.object, env);
      const method = node.callee.member;
      // Array built-in methods
      if (Array.isArray(obj)) {
        const args = () => node.args.map(a => this.evalExpr(a, env));
        switch (method) {
          case "push":     { const a = args(); obj.push(...a); return obj.length; }
          case "pop":      return obj.pop();
          case "shift":    return obj.shift();
          case "unshift":  { const a = args(); return obj.unshift(...a); }
          case "includes": return obj.includes(this.evalExpr(node.args[0], env));
          case "indexOf":  return obj.indexOf(this.evalExpr(node.args[0], env));
          case "lastIndexOf": return obj.lastIndexOf(this.evalExpr(node.args[0], env));
          case "join":     return obj.join(node.args.length ? this.evalExpr(node.args[0], env) : ",");
          case "reverse":  return obj.reverse();
          case "slice":    { const a = args(); return obj.slice(...a); }
          case "splice":   { const a = args(); return obj.splice(...a); }
          case "concat":   { const a = args(); return obj.concat(...a); }
          case "flat":     { const depth = node.args.length ? this.evalExpr(node.args[0], env) : 1; return obj.flat(depth); }
          case "fill":     { const a = args(); return obj.fill(...a); }
          case "sort": {
            if (node.args.length) {
              const cmp = this.evalExpr(node.args[0], env);
              return obj.sort(cmp);
            }
            return obj.sort();
          }
          case "map": {
            const fn = this.evalExpr(node.args[0], env);
            return obj.map((el, i) => fn(el, i, obj));
          }
          case "filter": {
            const fn = this.evalExpr(node.args[0], env);
            return obj.filter((el, i) => fn(el, i, obj));
          }
          case "reduce": {
            const fn = this.evalExpr(node.args[0], env);
            const init = node.args.length > 1 ? this.evalExpr(node.args[1], env) : undefined;
            return init !== undefined ? obj.reduce((acc, el, i) => fn(acc, el, i, obj), init) : obj.reduce((acc, el, i) => fn(acc, el, i, obj));
          }
          case "forEach": {
            const fn = this.evalExpr(node.args[0], env);
            obj.forEach((el, i) => fn(el, i, obj));
            return undefined;
          }
          case "find": {
            const fn = this.evalExpr(node.args[0], env);
            return obj.find((el, i) => fn(el, i, obj));
          }
          case "findIndex": {
            const fn = this.evalExpr(node.args[0], env);
            return obj.findIndex((el, i) => fn(el, i, obj));
          }
          case "every": {
            const fn = this.evalExpr(node.args[0], env);
            return obj.every((el, i) => fn(el, i, obj));
          }
          case "some": {
            const fn = this.evalExpr(node.args[0], env);
            return obj.some((el, i) => fn(el, i, obj));
          }
          case "keys":    return [...obj.keys()];
          case "values":  return [...obj.values()];
          case "entries": return [...obj.entries()];
          case "length":  return obj.length;
        }
      }
      // String built-in methods
      if (typeof obj === "string") {
        const args = () => node.args.map(a => this.evalExpr(a, env));
        switch (method) {
          case "length":      return obj.length;
          case "charAt":      return obj.charAt(this.evalExpr(node.args[0], env));
          case "charCodeAt":  return obj.charCodeAt(this.evalExpr(node.args[0], env));
          case "indexOf":     { const a = args(); return obj.indexOf(...a); }
          case "lastIndexOf": { const a = args(); return obj.lastIndexOf(...a); }
          case "includes":    return obj.includes(this.evalExpr(node.args[0], env));
          case "startsWith":  return obj.startsWith(this.evalExpr(node.args[0], env));
          case "endsWith":    return obj.endsWith(this.evalExpr(node.args[0], env));
          case "slice":       { const a = args(); return obj.slice(...a); }
          case "substring":   { const a = args(); return obj.substring(...a); }
          case "split":       { const a = args(); return obj.split(...a); }
          case "trim":        return obj.trim();
          case "trimStart":   return obj.trimStart();
          case "trimEnd":     return obj.trimEnd();
          case "toUpperCase": return obj.toUpperCase();
          case "toLowerCase": return obj.toLowerCase();
          case "replace":     { const a = args(); return obj.replace(a[0], a[1]); }
          case "replaceAll":  { const a = args(); return obj.replaceAll(a[0], a[1]); }
          case "repeat":      return obj.repeat(this.evalExpr(node.args[0], env));
          case "padStart":    { const a = args(); return obj.padStart(...a); }
          case "padEnd":      { const a = args(); return obj.padEnd(...a); }
          case "concat":      { const a = args(); return obj.concat(...a); }
          case "match":       { const a = args(); return obj.match(a[0]); }
          case "at":          return obj.at(this.evalExpr(node.args[0], env));
        }
      }
      // Number methods
      if (typeof obj === "number") {
        switch (method) {
          case "toFixed":     return obj.toFixed(node.args.length ? this.evalExpr(node.args[0], env) : 0);
          case "toString":    return obj.toString(node.args.length ? this.evalExpr(node.args[0], env) : 10);
          case "toPrecision": return obj.toPrecision(this.evalExpr(node.args[0], env));
        }
      }
      // console.log
      if (node.callee.object.type === "Identifier" && node.callee.object.name === "console" && method === "log") {
        const args = node.args.map(a => this.evalExpr(a, env));
        const line = args.map(a => String(a)).join(" ");
        this.emitOutput(line);
        return undefined;
      }
      // Generic method call â€” look up property then call
      const fn = obj[method];
      if (typeof fn === "function") {
        const args = node.args.map(a => this.evalExpr(a, env));
        return fn.apply(obj, args);
      }
      throw new Error(`Not a function: ${method}`);
    }

    const fn = this.evalExpr(node.callee, env);
    if (typeof fn !== "function") {
      throw new Error(`Not callable: ${JSON.stringify(node.callee)}`);
    }
    const args = node.args.map(a => this.evalExpr(a, env));
    return fn(...args);
  }

  evalMember(node, env) {
    const obj = this.evalExpr(node.object, env);
    if (node.member === "length" && (Array.isArray(obj) || typeof obj === "string")) {
      return obj.length;
    }
    return obj[node.member];
  }

  evalIndex(node, env) {
    const obj = this.evalExpr(node.object, env);
    const idx = this.evalExpr(node.index, env);
    return obj[idx];
  }

  evalObject(node, env) {
    const obj = {};
    for (const f of node.fields) {
      obj[f.key] = this.evalExpr(f.value, env);
    }
    return obj;
  }

  evalArrow(node, env) {
    const closure = env;
    return (...args) => {
      const local = new Environment(closure);
      for (let i = 0; i < node.params.length; i++) {
        local.define(node.params[i].name, args[i]);
      }
      if (node.isBlock) {
        try {
          for (const s of node.body.body) this.execNode(s, local);
        } catch (e) {
          if (e instanceof RETURN_SIGNAL) return e.value;
          throw e;
        }
        return undefined;
      } else {
        return this.evalExpr(node.body, local);
      }
    };
  }

  evalFuncExpr(node, env) {
    const closure = env;
    const fn = (...args) => {
      const local = new Environment(closure);
      for (let i = 0; i < node.params.length; i++) {
        local.define(node.params[i].name, args[i]);
      }
      try {
        for (const s of node.body.body) this.execNode(s, local);
      } catch (e) {
        if (e instanceof RETURN_SIGNAL) return e.value;
        throw e;
      }
      return undefined;
    };
    if (node.name) env.define(node.name, fn);
    return fn;
  }

  evalTemplate(node, env) {
    let result = "";
    for (let i = 0; i < node.strings.length; i++) {
      result += node.strings[i];
      if (i < node.expressions.length) {
        result += String(this.evalExpr(node.expressions[i], env));
      }
    }
    return result;
  }

  // ---- Classes ----
  execClassDecl(node, env) {
    const parentClass = node.base ? env.get(node.base) : null;

    // Build the class as a constructor function + prototype object
    const classDef = {
      __isClass__: true,
      name: node.name,
      parent: parentClass,
      fields: node.fields,
      methods: {},
      ctor: node.constructor,
    };

    // Register methods
    for (const m of node.methods) {
      classDef.methods[m.name] = m;
    }

    // The "constructor function" â€” called with `new ClassName(...)`
    const interp = this;
    const classFunc = (...args) => {
      // Create instance
      const instance = { __class__: classDef };

      // Inherit parent fields + methods
      if (parentClass) {
        const parentDef = parentClass.__classDef__;
        if (parentDef) {
          for (const f of parentDef.fields) {
            instance[f.name] = f.defaultValue ? interp.evalExpr(f.defaultValue, env) : undefined;
          }
        }
      }

      // Set own fields
      for (const f of node.fields) {
        instance[f.name] = f.defaultValue ? interp.evalExpr(f.defaultValue, env) : undefined;
      }

      // Bind methods
      const allMethods = {};
      if (parentClass && parentClass.__classDef__) {
        Object.assign(allMethods, parentClass.__classDef__.methods);
      }
      Object.assign(allMethods, classDef.methods);

      for (const [mname, mnode] of Object.entries(allMethods)) {
        instance[mname] = (...margs) => {
          const methodEnv = new Environment(env);
          methodEnv.define("this", instance);
          for (let i = 0; i < mnode.params.length; i++) {
            methodEnv.define(mnode.params[i].name, margs[i]);
          }
          try {
            for (const s of mnode.body.body) interp.execNode(s, methodEnv);
          } catch (e) {
            if (e instanceof RETURN_SIGNAL) return e.value;
            throw e;
          }
          return undefined;
        };
      }

      // Run constructor
      if (classDef.ctor) {
        const ctorEnv = new Environment(env);
        ctorEnv.define("this", instance);
        if (parentClass) {
          // super(...) in constructor = call parent constructor
          ctorEnv.define("super", (...sargs) => {
            if (parentClass.__classDef__ && parentClass.__classDef__.ctor) {
              const superCtorEnv = new Environment(env);
              superCtorEnv.define("this", instance);
              const pctor = parentClass.__classDef__.ctor;
              for (let i = 0; i < pctor.params.length; i++) {
                superCtorEnv.define(pctor.params[i].name, sargs[i]);
              }
              try {
                for (const s of pctor.body.body) interp.execNode(s, superCtorEnv);
              } catch (e) {
                if (e instanceof RETURN_SIGNAL) return;
                throw e;
              }
            }
          });
        }
        for (let i = 0; i < classDef.ctor.params.length; i++) {
          ctorEnv.define(classDef.ctor.params[i].name, args[i]);
        }
        try {
          for (const s of classDef.ctor.body.body) interp.execNode(s, ctorEnv);
        } catch (e) {
          if (e instanceof RETURN_SIGNAL) { /* constructors don't return */ }
          else throw e;
        }
      }

      return instance;
    };

    classFunc.__classDef__ = classDef;
    env.define(node.name, classFunc);
  }

  evalNew(node, env) {
    const cls = env.get(node.name);
    if (typeof cls !== "function") {
      throw new Error(`${node.name} is not a class/constructor`);
    }
    const args = node.args.map(a => this.evalExpr(a, env));
    return cls(...args);
  }

  // ---- Type decl (struct-like) ----
  execTypeDecl(node, env) {
    // Treat as a simple constructor function for the struct
    const interp = this;
    const factory = (initObj) => {
      const instance = {};
      for (const f of node.fields) {
        instance[f.name] = (initObj && initObj[f.name] !== undefined)
          ? initObj[f.name]
          : (f.defaultValue ? interp.evalExpr(f.defaultValue, env) : undefined);
      }
      for (const m of node.methods) {
        instance[m.name] = (...args) => {
          const methodEnv = new Environment(env);
          methodEnv.define("this", instance);
          for (let i = 0; i < m.params.length; i++) {
            methodEnv.define(m.params[i].name, args[i]);
          }
          try {
            for (const s of m.body.body) interp.execNode(s, methodEnv);
          } catch (e) {
            if (e instanceof RETURN_SIGNAL) return e.value;
            throw e;
          }
          return undefined;
        };
      }
      return instance;
    };
    env.define(node.name, factory);
  }

  // ---- Enum ----
  execEnumDecl(node, env) {
    const enumObj = {};
    let autoVal = 0;
    for (const m of node.members) {
      if (m.value !== null) {
        const val = this.evalExpr(m.value, env);
        enumObj[m.name] = val;
        if (typeof val === "number") autoVal = val + 1;
      } else {
        enumObj[m.name] = autoVal++;
      }
    }
    env.define(node.name, enumObj);
  }

  // ---- Switch ----
  execSwitch(node, env) {
    const disc = this.evalExpr(node.discriminant, env);
    let matched = false;
    for (const c of node.cases) {
      const caseVal = this.evalExpr(c.value, env);
      if (matched || disc === caseVal) {
        matched = true;
        try {
          for (const s of c.body) this.execNode(s, env);
        } catch (e) {
          if (e === "BREAK") return;
          throw e;
        }
      }
    }
    if (node.default) {
      if (matched) {
        try {
          for (const s of node.default.body) this.execNode(s, env);
        } catch (e) {
          if (e === "BREAK") return;
          throw e;
        }
      } else {
        try {
          for (const s of node.default.body) this.execNode(s, env);
        } catch (e) {
          if (e === "BREAK") return;
          throw e;
        }
      }
    }
  }

  // ---- Try/Catch ----
  execTryCatch(node, env) {
    try {
      const tryEnv = new Environment(env);
      for (const s of node.tryBlock.body) this.execNode(s, tryEnv);
    } catch (e) {
      if (e instanceof RETURN_SIGNAL) throw e; // propagate returns
      if (e === "BREAK" || e === "CONTINUE") throw e; // propagate control flow
      const catchEnv = new Environment(env);
      catchEnv.define(node.param, e);
      for (const s of node.catchBlock.body) this.execNode(s, catchEnv);
    }
  }

  // ---- Import ----
  execImport(node, env) {
    // Resolve the source file
    const sourcePath = node.source;
    let resolvedPath;
    if (sourcePath.startsWith("./") || sourcePath.startsWith("../")) {
      resolvedPath = sourcePath;
      if (!resolvedPath.endsWith(".jspp")) resolvedPath += ".jspp";
    } else {
      resolvedPath = sourcePath;
    }

    // Read, lex, parse, and run the imported file
    let source;
    let fullPath;
    try {
      const importDir = this.currentFile ? dirname(this.currentFile) : (typeof process !== 'undefined' ? process.cwd() : '.');
      fullPath = resolve(importDir, resolvedPath);
      source = readFileSync(fullPath, "utf-8");
    } catch (err) {
      throw new Error(`Cannot import '${resolvedPath}': ${err.message}`);
    }

    const lexer = new Lexer(source, resolvedPath);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, resolvedPath);
    const ast = parser.parse();

    // Run the imported module in its own environment
    const moduleEnv = new Environment();
    // Give it print too
    moduleEnv.define("print", this.global.get("print"));
    const savedFile = this.currentFile;
    this.currentFile = fullPath;
    for (const n of ast.body) {
      this.execNode(n, moduleEnv);
    }
    this.currentFile = savedFile;

    // Pull named exports into the caller's env
    if (node.alias) {
      // import * as X â†’ gather all into object
      const moduleObj = {};
      for (const [k, v] of moduleEnv.vars) {
        moduleObj[k] = v;
      }
      env.define(node.alias, moduleObj);
    } else {
      for (const name of node.names) {
        if (!moduleEnv.has(name)) {
          throw new Error(`Import error: '${name}' not found in '${resolvedPath}'`);
        }
        env.define(name, moduleEnv.get(name));
      }
    }
  }

  isTruthy(v) {
    return !!v;
  }
}

function parseSource(source, filename = "<stdin>") {
  const lexer = new Lexer(source, filename);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, filename);
  const ast = parser.parse();
  return { tokens, ast };
}

function isDirectExecution() {
  if (typeof process === 'undefined' || !process.argv || !process.argv[1]) {
    return false;
  }
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

// ============================================================================
// CLI DRIVER
// ============================================================================

function main() {
  if (typeof process === 'undefined') return;
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("JSPP Prototype Compiler");
    console.log("Usage: node jspp.mjs <input.jspp> [-o output.cpp] [--tokens] [--ast] [--run]");
    process.exit(0);
  }

  const inputFile = args[0];
  let outputFile = null;
  let showTokens = false;
  let showAst = false;
  let runMode = false;
  let noCheck = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "-o" && args[i+1]) { outputFile = args[++i]; }
    else if (args[i] === "--tokens") showTokens = true;
    else if (args[i] === "--ast") showAst = true;
    else if (args[i] === "--run") runMode = true;
    else if (args[i] === "--no-check") noCheck = true;
  }

  const source = readFileSync(inputFile, "utf-8");
  const filename = basename(inputFile);

  // Lex
  console.log(`[jspp] Lexing ${filename}...`);
  const lexer = new Lexer(source, filename);
  const tokens = lexer.tokenize();
  console.log(`[jspp] ${tokens.length} tokens produced`);

  if (showTokens) {
    console.log("\n--- TOKENS ---");
    for (const t of tokens) {
      console.log(`  ${t.type.padEnd(20)} ${JSON.stringify(t.value).padEnd(20)} L${t.line}:${t.col}`);
    }
    console.log();
  }

  // Parse
  console.log(`[jspp] Parsing...`);
  const parser = new Parser(tokens, filename);
  const ast = parser.parse();
  console.log(`[jspp] AST: ${ast.body.length} top-level nodes`);

  if (showAst) {
    console.log("\n--- AST ---");
    console.log(JSON.stringify(ast, null, 2));
    console.log();
  }

  // Type check (merge TYPECHECK_PRELUDE into the AST for checking only)
  if (!noCheck) {
    const preludeLexer = new Lexer(TYPECHECK_PRELUDE, "<prelude>");
    const preludeParser = new Parser(preludeLexer.tokenize(), "<prelude>");
    const preludeAst = preludeParser.parse();
    const combinedAst = { body: [...preludeAst.body, ...ast.body] };
    const checker = new TypeChecker();
    const diagnostics = checker.check(combinedAst);
    const errors = diagnostics.filter(d => d.severity === "error");
    const warnings = diagnostics.filter(d => d.severity === "warning");
    if (errors.length > 0 || warnings.length > 0) {
      console.log(`[jspp] Type check: ${errors.length} error(s), ${warnings.length} warning(s)`);
      for (const d of diagnostics) console.log(`  ${d}`);
    } else {
      console.log(`[jspp] Type check: OK`);
    }
    if (errors.length > 0 && !runMode) {
      console.log(`[jspp] Aborting due to type errors.`);
      process.exit(1);
    }
  }

  if (runMode) {
    // Interpret directly
    console.log(`[jspp] Running...\n`);
    const interp = new Interpreter();
    interp.currentFile = resolve(inputFile);
    interp.run(ast);
    console.log(`\n[jspp] Done.`);
  } else {
    // Generate C++
    if (!outputFile) {
      outputFile = inputFile.replace(/\.jspp$/, ".cpp");
    }
    console.log(`[jspp] Generating C++...`);
    const codegen = new CodeGenerator();
    const cpp = codegen.generate(ast);
    writeFileSync(outputFile, cpp, "utf-8");
    console.log(`[jspp] Output written to ${outputFile}`);
    console.log(`[jspp] Done! Compile with: g++ -std=c++20 -O2 ${outputFile} -o program`);
  }
}

export {
  CodeGenerator,
  Environment,
  Interpreter,
  Lexer,
  Parser,
  TokenType,
  parseSource,
};

// Type-checker prelude: declarations that are only used for the type checker
// (these are parsed and merged into the AST for checking only; they are
// NOT executed at runtime). This prevents "Undefined variable" diagnostics
// for common host-provided globals.
const TYPECHECK_PRELUDE = `
let Math;
let Date;
let RegExp;
let setTimeout;
let clearTimeout;
let setInterval;
let clearInterval;
let JSON;
function parseInt(s: auto, r: int): auto {}
function parseFloat(s: auto): auto {}
function isNaN(v: auto): bool {}
function isFinite(v: auto): bool {}
function print(args: auto): void {}
let _;
function EventEmitter(): auto {}
let uuid;
let queryString;
let path;
let dateFns;
let ms;
let warning;
function invariant(cond: auto, msg: auto): void {}
function assert(cond: auto, msg: auto): void {}
`;

if (isDirectExecution()) {
  main();
}
