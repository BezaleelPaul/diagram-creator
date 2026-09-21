/* Component parser: files + imports -> flowchart TD (repo-cartographer style). */
(function (global) {
  function parse(files) {
    const notes = [];
    const mods = files.map((f) => f.name).filter(Boolean);
    const edges = new Set();
    files.forEach((f) => {
      const t = f.content || "";
      const imps = [];
      let m;
      const esRe = /import\s+(?:[^'"]+from\s+)?["'`]([^"'`]+)["'`]/g;
      while ((m = esRe.exec(t))) imps.push(m[1]);
      const reqRe = /require\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
      while ((m = reqRe.exec(t))) imps.push(m[1]);
      const pyRe = /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.,\s]+))/gm;
      while ((m = pyRe.exec(t))) imps.push(m[1] || m[2]);
      const javaRe = /^\s*import\s+([\w.]+);/gm;
      while ((m = javaRe.exec(t))) imps.push(m[1]);
      imps.forEach((imp) => {
        // resolve relative ./x to a real pasted filename when possible
        const base = imp.split("/").pop().split(".")[0];
        const target = mods.find((n) => n.replace(/\\/g, "/").toLowerCase().includes(base.toLowerCase()) && n !== f.name);
        if (target) edges.add(f.name + ">" + target);
        else if (!imp.startsWith(".") && mods.length > 1 && edges.size < 40) {
          // external pkg: only keep if it matches another module stem, else skip (no guessing)
        }
      });
    });
    if (!mods.length) notes.push("No filenames provided — component diagram skipped.");
    else if (!edges.size) notes.push("No inter-file imports resolved — renders modules without edges. Use matching filenames + relative imports.");
    return { mods: mods.slice(0, 30), edges: [...edges].map((s) => s.split(">")).slice(0, 40), notes };
  }

  function layerOf(name) {
    const n = name.toLowerCase();
    if (/route|controller|handler|api/.test(n)) return "routes";
    if (/model|schema|entity|prisma/.test(n)) return "models";
    if (/view|page|component|ui|client|frontend/.test(n)) return "ui";
    if (/service|logic|util|helper|lib/.test(n)) return "services";
    if (/db|sql|migrat/.test(n)) return "db";
    if (/test|spec/.test(n)) return "tests";
    return "app";
  }

  function toMermaid(res) {
    if (!res.mods.length) return null;
    const id = (s) => String(s).replace(/[^A-Za-z0-9]/g, "_").slice(0, 40);
    const lines = ["flowchart TD"];
    const layers = {};
    res.mods.forEach((m) => { const l = layerOf(m); (layers[l] = layers[l] || []).push(m); });
    Object.entries(layers).forEach(([l, arr]) => {
      lines.push(`  subgraph ${l}`);
      arr.forEach((m) => lines.push(`    ${id(m)}["${m}"]`));
      lines.push("  end");
    });
    const seen = new Set();
    res.edges.forEach(([a, b]) => {
      const e = `  ${id(a)} --> ${id(b)}`;
      if (!seen.has(e)) { seen.add(e); lines.push(e); }
    });
    return lines.join("\n");
  }

  global.ComponentParser = { parse, toMermaid };
})(window);
