/* Sequence parser: builds call graph from real defs/calls, walks from entry keywords. */
(function (global) {
  function braceBody(text, openIdx) {
    // openIdx = index of "{" — returns body inside matching braces
    let depth = 0;
    for (let i = openIdx; i < text.length; i++) {
      if (text[i] === "{") depth++;
      if (text[i] === "}") { depth--; if (depth === 0) return text.slice(openIdx + 1, i); }
    }
    return text.slice(openIdx + 1, openIdx + 2000);
  }
  function getFuncs(text) {
    const defs = new Map();
    const add = (name, matchIdx, matchLen) => {
      if (!name || defs.has(name)) return;
      const open = text.indexOf("{", matchIdx + matchLen - 1);
      defs.set(name, open === -1 ? text.slice(matchIdx, matchIdx + 500) : braceBody(text, open));
    };
    let m;
    const jsRe = /(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/g;
    while ((m = jsRe.exec(text))) add(m[1], m.index, m[0].length);
    const arrowRe = /(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{?/g;
    while ((m = arrowRe.exec(text))) add(m[1], m.index, m[0].length);
    const methRe = /(?:async\s+)?([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/g;
    while ((m = methRe.exec(text))) { if (!["if", "for", "while", "switch", "catch"].includes(m[1])) add(m[1], m.index, m[0].length); }
    const pyRe = /^\s*def\s+([A-Za-z0-9_]+)\s*\(/gm;
    while ((m = pyRe.exec(text))) {
      if (defs.has(m[1])) continue;
      // python: take indented block after def
      const start = m.index + m[0].length;
      const lines = text.slice(start).split("\n");
      const blk = lines.slice(0, 40).join("\n");
      defs.set(m[1], blk);
    }
    const javaRe = /(?:public|private|protected)?\s*(?:static\s+)?[\w<>\[\]]+\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*(?:throws[^{]+)?\{/g;
    while ((m = javaRe.exec(text))) { if (!["if", "for", "while", "switch"].includes(m[1])) add(m[1], m.index, m[0].length); }
    return defs;
  }

  function callsIn(body, known) {
    const out = [];
    const re = /([A-Za-z0-9_]+)\s*\(/g;
    let m;
    while ((m = re.exec(body))) {
      const n = m[1];
      if (known.has(n) && !out.includes(n)) out.push(n);
    }
    return out;
  }

  function detectFailures(text) {
    const out = [];
    if (/throw\s+new\s+Error|raise\s+\w*Error|res\.status\(\s*4|res\.status\(\s*5|throw/.test(text)) out.push("failure path present (throw / 4xx / 5xx found)");
    else out.push("no explicit failure path found in code");
    return out;
  }

  function parse(files, flow) {
    const notes = [];
    const allText = files.map((f) => f.content || "").join("\n");
    const defs = getFuncs(allText);
    if (!defs.size) return { mermaid: null, notes: ["No function/method definitions found — sequence diagram skipped."] };
    const known = new Set(defs.keys());
    // entry: first flow token that fuzzy-matches a real function, else route/controller/handler/main
    const tokens = String(flow || "").split(/→|->|,/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    let entry = null;
    for (const tok of tokens) {
      const norm = tok.replace(/[^a-z0-9]/g, "");
      for (const k of known) {
        if (k.toLowerCase() === norm || norm.includes(k.toLowerCase()) || k.toLowerCase().includes(norm.slice(0, 5))) { entry = k; break; }
      }
      if (entry) break;
    }
    if (!entry) {
      const prefs = [...known].filter((k) => /route|controller|handler|register|login|main|index|app|post|create/i.test(k));
      entry = prefs[0] || [...known][0];
      notes.push(`Flow "${flow || "(empty)"}" did not exactly match a function — using "${entry}" as entry. Walk follows real calls only.`);
    }
    // BFS walk over real calls, cap depth/width
    const seen = new Set([entry]); const edges = []; const queue = [{ fn: entry, d: 0 }];
    while (queue.length) {
      const cur = queue.shift();
      if (cur.d >= 4) continue;
      const body = defs.get(cur.fn) || "";
      callsIn(body, known).filter((c) => c !== cur.fn).slice(0, 6).forEach((callee) => {
        edges.push([cur.fn, callee]);
        if (!seen.has(callee)) { seen.add(callee); queue.push({ fn: callee, d: cur.d + 1 }); }
      });
    }
    if (!edges.length) notes.push(`"${entry}" makes no detected calls to other defined functions — diagram shows entry only.`);
    detectFailures(allText).forEach((n) => notes.push(n + "."));
    // failure alt only if real failure tokens exist
    const hasFail = /throw|catch|except|res\.status\(\s*[45]|if\s*\(\s*!/.test(allText);
    return { entry, edges: [...new Set(edges.map((e) => e.join(">"))) ].map((s) => s.split(">")), hasFail, notes, funcs: [...known] };
  }

  function toMermaid(res, flow) {
    if (!res || !res.entry) return null;
    const P = (s) => String(s).replace(/[^A-Za-z0-9_]/g, "_").slice(0, 40);
    const lines = ["sequenceDiagram", `  participant U as User`, `  participant E as ${P(res.entry)}`];
    const others = [...new Set(res.edges.flat())].filter((x) => x !== res.entry).slice(0, 8);
    others.forEach((o) => lines.push(`  participant ${P(o)} as ${P(o)}`));
    lines.push(`  U->>+E: ${String(flow || res.entry).slice(0, 60)}`);
    res.edges.slice(0, 12).forEach(([a, b]) => lines.push(`  ${P(a)}->>+${P(b)}: ${P(b)}()`));
    if (res.hasFail) {
      lines.push("  alt success");
      lines.push("  E-->>U: success response");
      lines.push("  else failure");
      lines.push("  E-->>U: error response");
      lines.push("  end");
    } else {
      lines.push("  E-->>U: response");
    }
    others.slice().reverse().forEach((o) => lines.push(`  ${P(o)}-->>-${P(res.entry)}: return`));
    lines.push(`  E-->>-U: done`);
    return lines.join("\n");
  }

  global.SequenceParser = { parse, toMermaid };
})(window);
