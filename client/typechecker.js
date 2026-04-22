// ============================================================================
// JSPP Type Checker — Validates AST and infers types before codegen
// Usage: imported by jspp.mjs, runs between parse and codegen/interpret
// ============================================================================

// ---- Type representation ----
class JSPPType {
  constructor(kind, name, extra = {}) {
    this.kind = kind;   // "int","double","float","bool","string","char","void","array","function","class","enum","struct","auto","unknown"
    this.name = name;
    Object.assign(this, extra);
  }

  static INT      = new JSPPType("int", "int");
  static DOUBLE   = new JSPPType("double", "double");
  static FLOAT    = new JSPPType("float", "float");
  static BOOL     = new JSPPType("bool", "bool");
  static STRING   = new JSPPType("string", "string");
  static CHAR     = new JSPPType("char", "char");
  static VOID     = new JSPPType("void", "void");
  static AUTO     = new JSPPType("auto", "auto");
  static UNKNOWN  = new JSPPType("unknown", "unknown");
  static NULL     = new JSPPType("null", "null");

  static array(elem) {
    return new JSPPType("array", `${elem.name}[]`, { elementType: elem });
  }
  static func(params, ret) {
    return new JSPPType("function", `(${params.map(p=>p.name).join(",")})=>${ret.name}`, { paramTypes: params, returnType: ret });
  }
  static classType(name, fields, methods, parent) {
    return new JSPPType("class", name, { fields, methods, parent });
  }
  static enumType(name, members) {
    return new JSPPType("enum", name, { members });
  }
  static structType(name, fields, methods) {
    return new JSPPType("struct", name, { fields, methods });
  }

  isNumeric() { return ["int","double","float","i8","i16","i32","i64","u8","u16","u32","u64","size"].includes(this.kind); }
  isInteger() { return ["int","i8","i16","i32","i64","u8","u16","u32","u64","size"].includes(this.kind); }
  equals(other) { return this.kind === other.kind && this.name === other.name; }
  toString() { return this.name; }
}

// ---- Type scope ----
class TypeScope {
  constructor(parent = null) {
    this.symbols = new Map();
    this.parent = parent;
  }
  define(name, type) { this.symbols.set(name, type); }
  lookup(name) {
    if (this.symbols.has(name)) return this.symbols.get(name);
    if (this.parent) return this.parent.lookup(name);
    return null;
  }
  has(name) {
    if (this.symbols.has(name)) return true;
    return this.parent ? this.parent.has(name) : false;
  }
}

// ---- Diagnostic ----
class TypeDiagnostic {
  constructor(severity, message, loc) {
    this.severity = severity; // "error" | "warning" | "info"
    this.message = message;
    this.loc = loc;
  }
  toString() {
    const l = this.loc || {};
    const pos = l.line ? `${l.filename || ""}:${l.line}:${l.col || l.column || 0}` : "?";
    return `[${this.severity}] ${pos}: ${this.message}`;
  }
}

// ---- Type Checker ----
export class TypeChecker {
  constructor() {
    this.diagnostics = [];
    this.globalScope = new TypeScope();
    this.currentScope = this.globalScope;
    this.currentReturnType = null;
    this.classTypes = new Map();

    // Built-ins
    this.globalScope.define("print", JSPPType.func([JSPPType.AUTO], JSPPType.VOID));
  }

  check(ast) {
    for (const node of ast.body) {
      this.checkNode(node);
    }
    return this.diagnostics;
  }

  error(msg, loc) { this.diagnostics.push(new TypeDiagnostic("error", msg, loc)); }
  warn(msg, loc) { this.diagnostics.push(new TypeDiagnostic("warning", msg, loc)); }
  info(msg, loc) { this.diagnostics.push(new TypeDiagnostic("info", msg, loc)); }

  pushScope() { this.currentScope = new TypeScope(this.currentScope); }
  popScope()  { this.currentScope = this.currentScope.parent; }

  // ---- Resolve type annotation to JSPPType ----
  resolveTypeAnnotation(ann) {
    if (!ann) return JSPPType.AUTO;
    const map = {
      int: JSPPType.INT, i8: JSPPType.INT, i16: JSPPType.INT, i32: JSPPType.INT, i64: JSPPType.INT,
      u8: JSPPType.INT, u16: JSPPType.INT, u32: JSPPType.INT, u64: JSPPType.INT,
      float: JSPPType.FLOAT, double: JSPPType.DOUBLE, bool: JSPPType.BOOL,
      string: JSPPType.STRING, char: JSPPType.CHAR, void: JSPPType.VOID,
      auto: JSPPType.AUTO, size: JSPPType.INT,
    };
    let base = map[ann.name] || null;
    if (!base) {
      // User-defined type?
      const ud = this.currentScope.lookup(ann.name);
      if (ud) base = ud;
      else { base = JSPPType.UNKNOWN; this.warn(`Unknown type '${ann.name}'`, ann.loc); }
    }
    if (ann.isArray) return JSPPType.array(base);
    if (ann.isOptional) return base; // simplified
    return base;
  }

  // ---- Statement checking ----
  checkNode(node) {
    switch (node.type) {
      case "VarDecl":      return this.checkVarDecl(node);
      case "FunctionDecl": return this.checkFuncDecl(node);
      case "ClassDecl":    return this.checkClassDecl(node);
      case "TypeDecl":     return this.checkTypeDecl(node);
      case "EnumDecl":     return this.checkEnumDecl(node);
      case "ExprStmt":     return this.inferExpr(node.expr);
      case "ReturnStmt":   return this.checkReturn(node);
      case "IfStmt":       return this.checkIf(node);
      case "ForStmt":      return this.checkFor(node);
      case "ForOfStmt":    return this.checkForOf(node);
      case "WhileStmt":    return this.checkWhile(node);
      case "DoWhileStmt":  return this.checkDoWhile(node);
      case "SwitchStmt":   return this.checkSwitch(node);
      case "TryCatch":     return this.checkTryCatch(node);
      case "ThrowStmt":    this.inferExpr(node.value); return;
      case "Block":        return this.checkBlock(node);
      case "ExportDecl":   return this.checkNode(node.declaration);
      case "ImportDecl":   return this.checkImport(node);
      case "BreakStmt":    return;
      case "ContinueStmt": return;
      case "CppInclude":   return;
      case "CppBlock":     return;
      default: return;
    }
  }

  checkVarDecl(node) {
    let declType = node.typeAnnotation ? this.resolveTypeAnnotation(node.typeAnnotation) : null;
    let initType = node.init ? this.inferExpr(node.init) : null;

    if (declType && initType && !declType.equals(JSPPType.AUTO) && !initType.equals(JSPPType.AUTO) && !initType.equals(JSPPType.UNKNOWN)) {
      if (!this.isAssignable(initType, declType)) {
        this.error(`Type '${initType}' is not assignable to type '${declType}'`, node);
      }
    }

    const finalType = declType && !declType.equals(JSPPType.AUTO) ? declType : (initType || JSPPType.AUTO);
    this.currentScope.define(node.name, finalType);
    // Annotate the AST node
    node.__resolvedType = finalType;
  }

  checkFuncDecl(node) {
    const paramTypes = node.params.map(p => this.resolveTypeAnnotation(p.typeAnnotation));
    const retType = node.returnType ? this.resolveTypeAnnotation(node.returnType) : JSPPType.AUTO;
    const funcType = JSPPType.func(paramTypes, retType);
    this.currentScope.define(node.name, funcType);

    this.pushScope();
    const savedReturn = this.currentReturnType;
    this.currentReturnType = retType;
    for (let i = 0; i < node.params.length; i++) {
      this.currentScope.define(node.params[i].name, paramTypes[i]);
    }
    for (const s of node.body.body) this.checkNode(s);
    this.currentReturnType = savedReturn;
    this.popScope();

    node.__resolvedType = funcType;
  }

  checkClassDecl(node) {
    const fields = {};
    for (const f of node.fields) {
      fields[f.name] = f.typeAnnotation ? this.resolveTypeAnnotation(f.typeAnnotation) : JSPPType.AUTO;
    }
    const methods = {};
    for (const m of node.methods) {
      const paramTypes = m.params.map(p => this.resolveTypeAnnotation(p.typeAnnotation));
      const retType = m.returnType ? this.resolveTypeAnnotation(m.returnType) : JSPPType.AUTO;
      methods[m.name] = JSPPType.func(paramTypes, retType);
    }
    const parent = node.base ? this.currentScope.lookup(node.base) : null;
    if (node.base && !parent) {
      this.error(`Base class '${node.base}' is not defined`, node);
    }
    const classType = JSPPType.classType(node.name, fields, methods, parent);
    this.currentScope.define(node.name, classType);
    this.classTypes.set(node.name, classType);

    // Check constructor and methods
    this.pushScope();
    this.currentScope.define("this", classType);
    if (parent) this.currentScope.define("super", parent);
    if (node.constructor) {
      this.pushScope();
      for (const p of node.constructor.params) {
        this.currentScope.define(p.name, this.resolveTypeAnnotation(p.typeAnnotation));
      }
      for (const s of node.constructor.body.body) this.checkNode(s);
      this.popScope();
    }
    for (const m of node.methods) {
      this.pushScope();
      for (const p of m.params) {
        this.currentScope.define(p.name, this.resolveTypeAnnotation(p.typeAnnotation));
      }
      const savedReturn = this.currentReturnType;
      this.currentReturnType = m.returnType ? this.resolveTypeAnnotation(m.returnType) : JSPPType.AUTO;
      for (const s of m.body.body) this.checkNode(s);
      this.currentReturnType = savedReturn;
      this.popScope();
    }
    this.popScope();
  }

  checkTypeDecl(node) {
    const fields = {};
    for (const f of node.fields) {
      fields[f.name] = this.resolveTypeAnnotation(f.typeAnnotation);
    }
    const methods = {};
    for (const m of node.methods) {
      const pt = m.params.map(p => this.resolveTypeAnnotation(p.typeAnnotation));
      const rt = m.returnType ? this.resolveTypeAnnotation(m.returnType) : JSPPType.AUTO;
      methods[m.name] = JSPPType.func(pt, rt);
    }
    const st = JSPPType.structType(node.name, fields, methods);
    this.currentScope.define(node.name, st);
  }

  checkEnumDecl(node) {
    const members = {};
    for (const m of node.members) {
      members[m.name] = JSPPType.INT;
    }
    const et = JSPPType.enumType(node.name, members);
    this.currentScope.define(node.name, et);
  }

  checkReturn(node) {
    if (node.value) {
      const retType = this.inferExpr(node.value);
      if (this.currentReturnType && !this.currentReturnType.equals(JSPPType.AUTO) && !retType.equals(JSPPType.AUTO) && !retType.equals(JSPPType.UNKNOWN)) {
        if (!this.isAssignable(retType, this.currentReturnType)) {
          this.warn(`Returning '${retType}' but function expects '${this.currentReturnType}'`, node);
        }
      }
    }
  }

  checkIf(node) {
    const condType = this.inferExpr(node.condition);
    this.pushScope();
    for (const s of node.then.body) this.checkNode(s);
    this.popScope();
    if (node.else) {
      this.pushScope();
      for (const s of node.else.body) this.checkNode(s);
      this.popScope();
    }
  }

  checkFor(node) {
    this.pushScope();
    if (node.init) {
      if (node.init.type === "VarDecl") this.checkVarDecl(node.init);
      else this.inferExpr(node.init.expr);
    }
    if (node.condition) this.inferExpr(node.condition);
    if (node.update) this.inferExpr(node.update);
    for (const s of node.body.body) this.checkNode(s);
    this.popScope();
  }

  checkForOf(node) {
    const iterType = this.inferExpr(node.iterable);
    this.pushScope();
    let elemType = JSPPType.AUTO;
    if (iterType.kind === "array" && iterType.elementType) {
      elemType = iterType.elementType;
    }
    this.currentScope.define(node.varName, elemType);
    for (const s of node.body.body) this.checkNode(s);
    this.popScope();
  }

  checkWhile(node) {
    this.inferExpr(node.condition);
    this.pushScope();
    for (const s of node.body.body) this.checkNode(s);
    this.popScope();
  }

  checkDoWhile(node) {
    this.pushScope();
    for (const s of node.body.body) this.checkNode(s);
    this.popScope();
    this.inferExpr(node.condition);
  }

  checkSwitch(node) {
    this.inferExpr(node.discriminant);
    for (const c of node.cases) {
      this.inferExpr(c.value);
      for (const s of c.body) this.checkNode(s);
    }
    if (node.default) {
      for (const s of node.default.body) this.checkNode(s);
    }
  }

  checkTryCatch(node) {
    this.pushScope();
    for (const s of node.tryBlock.body) this.checkNode(s);
    this.popScope();
    this.pushScope();
    this.currentScope.define(node.param, JSPPType.AUTO);
    for (const s of node.catchBlock.body) this.checkNode(s);
    this.popScope();
  }

  checkBlock(node) {
    this.pushScope();
    for (const s of node.body) this.checkNode(s);
    this.popScope();
  }

  checkImport(node) {
    // Trust imported symbols — register them as AUTO
    if (node.alias) {
      this.currentScope.define(node.alias, JSPPType.AUTO);
    } else {
      for (const name of node.names) {
        this.currentScope.define(name, JSPPType.AUTO);
      }
    }
  }

  // ---- Expression type inference ----
  inferExpr(node) {
    switch (node.type) {
      case "IntLiteral":     return JSPPType.INT;
      case "FloatLiteral":   return JSPPType.DOUBLE;
      case "StringLiteral":  return JSPPType.STRING;
      case "CharLiteral":    return JSPPType.CHAR;
      case "BoolLiteral":    return JSPPType.BOOL;
      case "NullLiteral":    return JSPPType.NULL;

      case "Identifier": {
        const t = this.currentScope.lookup(node.name);
        if (!t) { this.error(`Undefined variable '${node.name}'`, node); return JSPPType.UNKNOWN; }
        return t;
      }

      case "BinaryExpr": return this.inferBinary(node);
      case "UnaryExpr":  return this.inferUnary(node);

      case "AssignExpr": {
        const rType = this.inferExpr(node.right);
        const lType = this.inferExpr(node.left);
        // For simple =, check assignability
        if (node.op === "=" && !lType.equals(JSPPType.AUTO) && !rType.equals(JSPPType.AUTO) && !rType.equals(JSPPType.UNKNOWN)) {
          if (!this.isAssignable(rType, lType)) {
            this.warn(`Assigning '${rType}' to '${lType}'`, node);
          }
        }
        return lType.equals(JSPPType.AUTO) ? rType : lType;
      }

      case "CallExpr": return this.inferCall(node);

      case "MemberExpr": {
        const objType = this.inferExpr(node.object);
        if (node.member === "length") {
          if (objType.kind === "array" || objType.equals(JSPPType.STRING)) return JSPPType.INT;
        }
        if (objType.kind === "class" && objType.fields) {
          if (objType.fields[node.member]) return objType.fields[node.member];
          if (objType.methods && objType.methods[node.member]) return objType.methods[node.member];
        }
        if (objType.kind === "enum" && objType.members) {
          if (objType.members[node.member]) return objType.members[node.member];
        }
        if (objType.kind === "struct" && objType.fields) {
          if (objType.fields[node.member]) return objType.fields[node.member];
        }
        return JSPPType.AUTO;
      }

      case "IndexExpr": {
        const objType = this.inferExpr(node.object);
        this.inferExpr(node.index);
        if (objType.kind === "array" && objType.elementType) return objType.elementType;
        return JSPPType.AUTO;
      }

      case "ArrayLiteral": {
        if (node.elements.length === 0) return JSPPType.array(JSPPType.AUTO);
        const elemType = this.inferExpr(node.elements[0]);
        for (let i = 1; i < node.elements.length; i++) {
          const t = this.inferExpr(node.elements[i]);
          if (!elemType.equals(t) && !t.equals(JSPPType.AUTO)) {
            this.warn(`Mixed types in array: '${elemType}' and '${t}'`, node);
          }
        }
        return JSPPType.array(elemType);
      }

      case "ObjectLiteral": {
        const fields = {};
        for (const f of node.fields) {
          fields[f.key] = this.inferExpr(f.value);
        }
        return JSPPType.structType("__anon", fields, {});
      }

      case "TernaryExpr": {
        this.inferExpr(node.condition);
        const tType = this.inferExpr(node.then);
        this.inferExpr(node.else);
        return tType;
      }

      case "ArrowFunction":
      case "FunctionExpr": {
        const params = node.params.map(p => this.resolveTypeAnnotation(p.typeAnnotation));
        const retType = node.returnType ? this.resolveTypeAnnotation(node.returnType) : JSPPType.AUTO;
        return JSPPType.func(params, retType);
      }

      case "TemplateLiteral": {
        for (const e of node.expressions) this.inferExpr(e);
        return JSPPType.STRING;
      }

      case "NewExpr": {
        const cls = this.currentScope.lookup(node.name);
        if (!cls) { this.error(`Undefined class '${node.name}'`, node); return JSPPType.UNKNOWN; }
        for (const a of node.args) this.inferExpr(a);
        return cls;
      }

      case "ThisExpr": {
        const t = this.currentScope.lookup("this");
        return t || JSPPType.UNKNOWN;
      }

      case "SuperExpr": return JSPPType.AUTO;

      default: return JSPPType.AUTO;
    }
  }

  inferBinary(node) {
    const lt = this.inferExpr(node.left);
    const rt = this.inferExpr(node.right);
    const op = node.op;

    // Comparison → bool
    if (["<", ">", "<=", ">=", "==", "!=", "===", "!=="].includes(op)) return JSPPType.BOOL;
    if (["&&", "||"].includes(op)) return JSPPType.BOOL;

    // String concatenation
    if (op === "+" && (lt.equals(JSPPType.STRING) || rt.equals(JSPPType.STRING))) return JSPPType.STRING;

    // Numeric promotion
    if (lt.isNumeric() && rt.isNumeric()) {
      if (lt.equals(JSPPType.DOUBLE) || rt.equals(JSPPType.DOUBLE)) return JSPPType.DOUBLE;
      if (lt.equals(JSPPType.FLOAT) || rt.equals(JSPPType.FLOAT)) return JSPPType.FLOAT;
      return JSPPType.INT;
    }

    // Division always could produce double
    if (op === "/" && lt.isInteger() && rt.isInteger()) return JSPPType.INT;

    return lt.equals(JSPPType.AUTO) ? rt : lt;
  }

  inferUnary(node) {
    const ot = this.inferExpr(node.operand);
    if (node.op === "!") return JSPPType.BOOL;
    if (node.op === "-") return ot;
    if (node.op === "++" || node.op === "--") return ot;
    return ot;
  }

  inferCall(node) {
    let funcType;
    if (node.callee.type === "MemberExpr") {
      const objType = this.inferExpr(node.callee.object);
      // Array methods
      if (objType.kind === "array") {
        if (node.callee.member === "push") { for (const a of node.args) this.inferExpr(a); return JSPPType.INT; }
        if (node.callee.member === "pop") return objType.elementType || JSPPType.AUTO;
        if (node.callee.member === "includes") { for (const a of node.args) this.inferExpr(a); return JSPPType.BOOL; }
      }
      // console.log
      if (node.callee.object.type === "Identifier" && node.callee.object.name === "console") {
        for (const a of node.args) this.inferExpr(a);
        return JSPPType.VOID;
      }
      // Class/struct methods
      if (objType.kind === "class" && objType.methods && objType.methods[node.callee.member]) {
        funcType = objType.methods[node.callee.member];
      } else {
        for (const a of node.args) this.inferExpr(a);
        return JSPPType.AUTO;
      }
    } else {
      funcType = this.inferExpr(node.callee);
    }

    // Check argument count
    if (funcType && funcType.kind === "function" && funcType.paramTypes) {
      for (const a of node.args) this.inferExpr(a);
      return funcType.returnType || JSPPType.AUTO;
    }

    for (const a of node.args) this.inferExpr(a);
    return JSPPType.AUTO;
  }

  // ---- Assignability ----
  isAssignable(from, to) {
    if (to.equals(JSPPType.AUTO) || from.equals(JSPPType.AUTO)) return true;
    if (to.equals(from)) return true;
    // Numeric widening: int → double, int → float, float → double
    if (to.isNumeric() && from.isNumeric()) return true;
    // null assignable to optional/nullable
    if (from.equals(JSPPType.NULL)) return true;
    return false;
  }
}
