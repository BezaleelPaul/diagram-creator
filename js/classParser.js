/* Deterministic class parser: JS/TS, Java, Python. No guessing. */
(function (global) {
  function sanitize(name) { return String(name || "").replace(/[^A-Za-z0-9_]/g, "_").slice(0, 64) || "Unknown"; }
  function uniq(arr) { return [...new Set(arr)]; }

  function parseJS(text) {
    const classes = [];
    const classRe = /class\s+([A-Za-z0-9_]+)(?:\s+extends\s+([A-Za-z0-9_]+))?(?:\s+implements\s+([A-Za-z0-9_,\s]+))?\s*\{/g;
    let m;
    while ((m = classRe.exec(text))) {
      const name = sanitize(m[1]);
      const parent = m[2] ? sanitize(m[2].trim()) : null;
      const ifaces = m[3] ? m[3].split(",").map((s) => sanitize(s.trim())).filter(Boolean) : [];
      const start = m.index + m[0].length;
      let depth = 1, i = start;
      while (i < text.length && depth > 0) { if (text[i] === "{") depth++; if (text[i] === "}") depth--; i++; }
      const body = text.slice(start, i - 1);
      const fields = new Set(); const methods = new Set();
      const fieldRe = /(?:^|;|\n)\s*(?:public|private|protected|readonly)?\s*([A-Za-z0-9_]+)\s*[:=]\s*[^;{\n]+;?/g;
      const thisRe = /this\.([A-Za-z0-9_]+)\s*=/g;
      const methodRe = /(?:^|\n)\s*(?:async\s+)?(?:static\s+)?(?:public|private|protected)?\s*([A-Za-z0-9_]+)\s*\([^)]*\)\s*(?::\s*[^{;\n]+)?\s*\{/g;
      let f;
      const ctor = body.match(/constructor\s*\(([^)]*)\)\s*\{([\s\S]*?)\n\s*\}/);
      if (ctor) { let t; while ((t = thisRe.exec(ctor[0]))) fields.add(t[1]); }
      let t2; while ((t2 = thisRe.exec(body))) { if (fields.size < 30) fields.add(t2[1]); }
      let mm; while ((mm = methodRe.exec(body))) {
        const n = mm[1];
        if (["if", "for", "while", "switch", "catch"].includes(n)) continue;
        if (n === "constructor") continue;
        methods.add(n + "()");
      }
      // TS field declarations: name: type;
      let tf; const tsField = /(?:^|\n)\s*(?:public|private|protected|readonly)?\s*([A-Za-z0-9_]+)\s*:\s*[A-Za-z0-9_<>\[\]| ]+;?/g;
      while ((tf = tsField.exec(body))) { if (!methods.has(tf[1] + "()") && fields.size < 30) fields.add(tf[1]); }
      void fieldRe;
      classes.push({ name, parent, ifaces, fields: [...fields], methods: [...methods], lang: "js" });
    }
    return classes;
  }

  function parseJava(text) {
    const classes = [];
    const re = /(?:class|interface|enum)\s+([A-Za-z0-9_]+)(?:\s+extends\s+([A-Za-z0-9_]+))?(?:\s+implements\s+([A-Za-z0-9_,\s]+))?\s*\{/g;
    let m;
    while ((m = re.exec(text))) {
      const kind = m[0].trim().split(/\s+/)[0];
      const name = sanitize(m[1]);
      const parent = m[2] ? sanitize(m[2]) : null;
      const ifaces = m[3] ? m[3].split(",").map((s) => sanitize(s.trim())).filter(Boolean) : [];
      const start = m.index + m[0].length;
      let depth = 1, i = start;
      while (i < text.length && depth > 0) { if (text[i] === "{") depth++; if (text[i] === "}") depth--; i++; }
      const body = text.slice(start, i - 1);
      const fields = []; const methods = [];
      const fieldRe = /(?:private|public|protected)?\s*(?:static\s+)?(?:final\s+)?([A-Za-z0-9_<>\[\]]+)\s+([A-Za-z0-9_]+)\s*(?:=[^;]+)?;/g;
      let f; while ((f = fieldRe.exec(body))) { if (fields.length < 30) fields.push(f[2]); }
      const methRe = /(?:public|private|protected)?\s*(?:static\s+)?[A-Za-z0-9_<>\[\]]+\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*(?:throws[^{]+)?\{/g;
      let mm; while ((mm = methRe.exec(body))) { if (!["if", "for", "while", "switch"].includes(mm[1])) methods.push(mm[1] + "()"); }
      if (kind === "enum" && fields.length === 0) {
        // enum constants (e.g. LOW, MEDIUM) are real members present in the code
        const head = body.split(";")[0];
        const constRe = /\b([A-Z][A-Z0-9_]*)(?:\s*\([^)]*\))?/g;
        let cm; while ((cm = constRe.exec(head))) { if (fields.length < 30 && !fields.includes(cm[1])) fields.push(cm[1]); }
      }
      classes.push({ name, parent, ifaces, fields: uniq(fields), methods: uniq(methods), kind, lang: "java" });
    }
    return classes;
  }

  function parsePython(text) {
    const classes = [];
    const re = /^class\s+([A-Za-z0-9_]+)(?:\(([^)]*)\))?\s*:/gm;
    let m;
    while ((m = re.exec(text))) {
      const name = sanitize(m[1]);
      const bases = m[2] ? m[2].split(",").map((s) => sanitize(s.trim())).filter((s) => s && s !== "object") : [];
      const parent = bases[0] || null;
      const after = text.slice(m.index);
      const lines = after.split("\n").slice(1);
      const fields = new Set(); const methods = new Set();
      for (const line of lines) {
        if (/^class\s+/.test(line)) break;
        if (/^\S/.test(line) && line.trim() !== "") break; // dedent = end of class (approx)
        const dm = line.match(/^\s*def\s+([A-Za-z0-9_]+)\s*\(/);
        if (dm && dm[1] !== "__init__") methods.add(dm[1] + "()");
        const sm = line.match(/self\.([A-Za-z0-9_]+)\s*=/);
        if (sm) fields.add(sm[1]);
        const ann = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*[A-Za-z0-9_\[\]]+\s*(=|$)/);
        if (ann && !["def", "return", "import"].includes(ann[1])) { if (fields.size < 30) fields.add(ann[1]); }
      }
      classes.push({ name, parent, ifaces: bases.slice(1), fields: [...fields], methods: [...methods], lang: "py" });
    }
    return classes;
  }

  function parse(files) {
    const all = [];
    const notes = [];
    files.forEach((f) => {
      const t = f.content || "";
      // run all three deterministically; keep richest result per class name
      // (prevents a wrong-language match from shadowing the correct one)
      const found = [...parseJS(t), ...parseJava(t), ...parsePython(t)];
      const best = new Map();
      found.forEach((c) => {
        const score = c.fields.length + c.methods.length;
        if (!best.has(c.name) || score > (best.get(c.name).fields.length + best.get(c.name).methods.length)) {
          best.set(c.name, c);
        }
      });
      best.forEach((c) => {
        all.push({ ...c, file: f.name });
      });
      if (found.length === 0 && t.trim().length > 0) notes.push(`No classes found in ${f.name} — skipped for class diagram.`);
    });
    return { classes: all, notes };
  }

  function toMermaid(classes, maxClasses) {
    if (!classes.length) return null;
    const max = maxClasses || 50;
    const shown = classes.slice(0, max);
    const lines = ["classDiagram"];
    if (classes.length > max) lines.push(`  %% showing ${max} of ${classes.length} classes - uncheck files to narrow`);
    const names = new Set(shown.map((c) => c.name));
    shown.forEach((c) => {
      const fields = (c.fields || []).slice(0, 20).map((f) => `+${sanitize(f)}`);
      const methods = (c.methods || []).slice(0, 25).map((mm) => `+${String(mm).replace(/[^A-Za-z0-9_()]/g, "")}`);
      const members = [...fields, ...methods];
      if (!members.length) {
        // Mermaid v10 rejects empty `class X {}` with STRUCT_STOP error - emit bare declaration
        lines.push(`  class ${c.name}`);
      } else {
        lines.push(`  class ${c.name} {`);
        members.forEach((ml) => lines.push(`    ${ml}`));
        lines.push("  }");
      }
    });
    shown.forEach((c) => {
      if (c.parent && names.has(c.parent)) lines.push(`  ${c.parent} <|-- ${c.name}`);
      (c.ifaces || []).forEach((i) => { if (names.has(i)) lines.push(`  ${i} <|.. ${c.name}`); });
    });
    // composition from field names matching class names (exact match only, noted as inferred)
    const lower = {}; shown.forEach((c) => { lower[c.name.toLowerCase()] = c.name; });
    const edgeSet = new Set();
    shown.forEach((c) => {
      (c.fields || []).forEach((f) => {
        const key = String(f).toLowerCase().replace(/s$/, "");
        if (lower[key] && lower[key] !== c.name) edgeSet.add(`  ${c.name} --> ${lower[key]} : has`);
      });
    });
    return lines.concat([...edgeSet]).join("\n");
  }

  global.ClassParser = { parse, toMermaid };
})(window);
