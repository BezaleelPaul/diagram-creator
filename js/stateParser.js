/* State parser: only from explicit states/transitions in code. */
(function (global) {
  function parse(files) {
    const notes = [];
    const text = files.map((f) => f.content || "").join("\n");
    const states = new Set();
    let m;
    const enumRe = /enum\s+(\w+)\s*\{([^}]+)\}/g;
    while ((m = enumRe.exec(text))) {
      if (/state|status|stage/i.test(m[1])) m[2].split(",").map((s) => s.trim().split(/[\s=]/)[0]).filter(Boolean).forEach((s) => states.add(s));
    }
    const litRe = /["'`](PENDING|ACTIVE|IDLE|LOADING|SUCCESS|ERROR|FAILED|APPROVED|REJECTED|DRAFT|PUBLISHED|OPEN|CLOSED|CREATED|DELETED|INIT[A-Z_]*)["'`]/g;
    while ((m = litRe.exec(text))) { if (states.size < 15) states.add(m[1]); }
    const transitions = [];
    const tRe = /(\w+)\s*(?:->|=>|-->)\s*(\w+)\s*(?:on|when|if)?\s*([A-Za-z0-9_ ]+)?/g;
    const lines = text.split("\n");
    lines.forEach((line) => {
      let x;
      const local = new RegExp(tRe.source, "g");
      while ((x = local.exec(line))) {
        if (states.has(x[1]) && states.has(x[2])) transitions.push({ from: x[1], to: x[2], event: (x[3] || "").trim().slice(0, 30) });
      }
      const sw = line.match(/case\s+["'`]?([A-Z_]+)["'`]?\s*:/);
      const set = line.match(/set\w*State\w*\s*\(\s*["'`]?([A-Za-z0-9_]+)["'`]?/);
      if (sw && states.has(sw[1]) && set && states.has(set[1]) && sw[1] !== set[1]) {
        if (transitions.length < 20) transitions.push({ from: sw[1], to: set[1], event: "event" });
      }
    });
    if (!states.size) notes.push("No explicit states (State enum / status literals) found — state diagram skipped.");
    else if (!transitions.length) notes.push(`${states.size} state(s) found but no explicit transitions — renders states without edges. Add transition code or flow text to improve.`);
    return { states: [...states].slice(0, 15), transitions: transitions.slice(0, 20), notes };
  }

  function toMermaid(res) {
    if (!res.states.length) return null;
    const P = (s) => String(s).replace(/[^A-Za-z0-9_]/g, "_");
    const lines = ["stateDiagram-v2"];
    res.states.forEach((s) => lines.push(`  state "${s}" as ${P(s)}`));
    res.transitions.forEach((t) => lines.push(`  ${P(t.from)} --> ${P(t.to)}${t.event ? " : " + t.event : ""}`));
    if (!res.transitions.length) lines.push("  [*] --> " + P(res.states[0]));
    return lines.join("\n");
  }

  global.StateParser = { parse, toMermaid };
})(window);
