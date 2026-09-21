/* ER parser: SQL CREATE TABLE + Prisma model. Exact columns only. */
(function (global) {
  function parseSQL(text, file) {
    const tables = [];
    const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?\s*\(([\s\S]*?)\)\s*;/gi;
    let m;
    while ((m = re.exec(text))) {
      const name = m[1];
      const body = m[2];
      const cols = [];
      // split on commas at paren-depth 0 (handles VARCHAR(20), single-line SQL)
      const parts = [];
      let depth = 0, cur = "";
      for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (ch === "(") depth++;
        if (ch === ")") depth = Math.max(0, depth - 1);
        if (ch === "," && depth === 0) { parts.push(cur); cur = ""; }
        else cur += ch;
      }
      if (cur.trim()) parts.push(cur);
      parts.forEach((line) => {
        const t = line.trim();
        if (!t || /^(PRIMARY|FOREIGN|CONSTRAINT|UNIQUE|CHECK|KEY)/i.test(t)) return;
        const cm = t.match(/^["'`]?(\w+)["'`]?\s+([A-Za-z0-9_()]+)/);
        if (cm && cols.length < 30) cols.push({ name: cm[1], type: cm[2].toUpperCase().slice(0, 20) });
      });
      const fks = [];
      const fkRe = /FOREIGN\s+KEY\s*\(\s*["'`]?(\w+)["'`]?\s*\)\s*REFERENCES\s+["'`]?(\w+)["'`]?\s*\(\s*["'`]?(\w+)["'`]?\s*\)/gi;
      let f; while ((f = fkRe.exec(body))) fks.push({ from: f[1], toTable: f[2], toCol: f[3] });
      if (name) tables.push({ name, cols, fks, file });
    }
    return tables;
  }

  function parsePrisma(text, file) {
    const tables = [];
    const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
    let m;
    while ((m = re.exec(text))) {
      const name = m[1]; const body = m[2];
      const cols = [];
      body.split("\n").forEach((line) => {
        const t = line.trim();
        if (!t || t.startsWith("@@") || t.startsWith("//")) return;
        const cm = t.match(/^(\w+)\s+([A-Za-z0-9_\[\]?]+)/);
        if (cm && cols.length < 30) cols.push({ name: cm[1], type: cm[2].replace(/[?\[\]]/g, "").toUpperCase().slice(0, 20) });
      });
      tables.push({ name, cols, fks: [], file });
    }
    return tables;
  }

  function parse(files) {
    const tables = []; const notes = [];
    files.forEach((f) => {
      const t = f.content || "";
      const found = [...parseSQL(t, f.name), ...parsePrisma(t, f.name)];
      // FK guess ONLY on exact naming: X_id / XId -> table X (marked inferred)
      found.forEach((tb) => {
        tb.cols.forEach((c) => {
          const base = c.name.replace(/_id$/i, "").replace(/Id$/, "");
          if (base && base.toLowerCase() !== tb.name.toLowerCase()) {
            const target = found.find((x) => x.name.toLowerCase() === base.toLowerCase());
            if (target) tb.fks.push({ from: c.name, toTable: target.name, toCol: "id", inferred: true });
          }
        });
      });
      found.forEach((x) => tables.push(x));
      if (!/CREATE\s+TABLE|model\s+\w+/is.test(t)) notes.push(`No tables/models in ${f.name} — skipped for ER diagram.`);
    });
    const inferred = tables.flatMap((t) => t.fks).filter((f) => f.inferred).length;
    if (inferred) notes.push(`${inferred} FK edge(s) inferred from <name>_id convention — verify against real schema.`);
    return { tables, notes };
  }

  function toMermaid(tables) {
    if (!tables.length) return null;
    const lines = ["erDiagram"];
    tables.forEach((t) => {
      const safe = t.name.replace(/[^A-Za-z0-9_]/g, "_");
      const cols = t.cols.length ? t.cols : [{ name: "id", type: "UNKNOWN" }];
      const colStr = cols.map((c) => `${c.type} ${c.name}`).join(", ");
      lines.push(`  ${safe} {`);
      cols.slice(0, 20).forEach((c) => lines.push(`    ${c.type} ${c.name}`));
      lines.push("  }");
      void colStr;
    });
    const names = new Set(tables.map((t) => t.name));
    const seenEdge = new Set();
    tables.forEach((t) => {
      t.fks.forEach((fk) => {
        if (names.has(fk.toTable)) {
          const e = `  ${t.name} ||--o{ ${fk.toTable} : "${fk.from}"`;
          if (!seenEdge.has(e)) { seenEdge.add(e); lines.push(e); }
        }
      });
    });
    return lines.join("\n");
  }

  global.ERParser = { parse, toMermaid };
})(window);
