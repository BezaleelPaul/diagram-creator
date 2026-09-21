/* UI orchestration: collect files, run deterministic parsers, render Mermaid v10. */
(function () {
  mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "strict" });
  const $ = (id) => document.getElementById(id);
  let fileCount = 0;

  // theme
  const themeBtn = $("themeBtn");
  themeBtn.onclick = () => {
    const d = document.documentElement.getAttribute("data-theme") === "dark";
    document.documentElement.setAttribute("data-theme", d ? "" : "dark");
    themeBtn.textContent = d ? "Dark" : "Light";
  };

  // tabs
  document.querySelectorAll(".tab").forEach((t) => {
    t.onclick = () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      ["paste", "github", "demo"].forEach((k) => { $("tab-" + k).hidden = k !== t.dataset.tab; });
    };
  });

  function addFile(name, content) {
    fileCount++;
    const wrap = document.createElement("div");
    wrap.className = "file-card";
    wrap.innerHTML = "";
    const row = document.createElement("div");
    row.className = "row";
    const inp = document.createElement("input");
    inp.type = "text"; inp.placeholder = "filename e.g. models/Student.java"; inp.value = name || "";
    const del = document.createElement("button");
    del.type = "button"; del.className = "ghost"; del.textContent = "Remove";
    del.onclick = () => wrap.remove();
    row.appendChild(inp); row.appendChild(del);
    const ta = document.createElement("textarea");
    ta.className = "code"; ta.rows = 7; ta.placeholder = "Paste source code here…"; ta.value = content || "";
    wrap.appendChild(row); wrap.appendChild(ta);
    $("fileList").appendChild(wrap);
  }
  $("addFileBtn").onclick = () => addFile(`file${fileCount + 1}.js`, "");
  addFile("models/Student.java", "");
  addFile("app.js", "");

  $("demoBtn").onclick = () => {
    $("fileList").innerHTML = "";
    addFile("models/Person.java", "public class Person {\n  protected String name;\n  protected String email;\n  public String getName() { return name; }\n}");
    addFile("models/Student.java", "public class Student extends Person {\n  private String studentId;\n  private Course course;\n  public void register(Course c) {\n    validate();\n    c.enroll(this);\n  }\n  private void validate() {\n    if (studentId == null) throw new RuntimeException(\"missing id\");\n  }\n}");
    addFile("models/Course.java", "public class Course {\n  private String code;\n  public void enroll(Student s) { save(s); }\n  private void save(Student s) { }\n}");
    addFile("schema.sql", "CREATE TABLE students (\n  id INT PRIMARY KEY,\n  name VARCHAR(100),\n  course_id INT,\n  FOREIGN KEY (course_id) REFERENCES courses(id)\n);\nCREATE TABLE courses (\n  id INT PRIMARY KEY,\n  code VARCHAR(20)\n);");
    $("flowInput").value = "POST /register → validation → DB write → response";
    document.querySelector('[data-tab="paste"]').click();
  };

  // github
  $("ghFetchBtn").onclick = async () => {
    const repo = $("ghRepo").value.trim();
    const st = $("ghStatus"); const box = $("ghFiles");
    box.innerHTML = "";
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { st.textContent = "Use owner/repo format."; return; }
    const [owner, name] = repo.split("/");
    const exts = $("ghExt").value.split(",").map((s) => s.trim()).filter(Boolean);
    const max = Math.min(80, Math.max(1, parseInt($("ghMax").value, 10) || 25));
    st.textContent = "Fetching…";
    try {
      const files = await GithubFetch.fetchFiles(owner, name, exts, max, (t) => { st.textContent = t; });
      st.textContent = `Loaded ${files.length} files. Checked ones will be used for diagrams.`;
      files.forEach((f) => {
        const lab = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox"; cb.checked = true; cb.dataset.name = f.name; cb.dataset.content = f.content;
        lab.appendChild(cb); lab.append(" " + f.name);
        box.appendChild(lab); box.appendChild(document.createElement("br"));
      });
      box._files = files;
    } catch (e) { st.textContent = "Error: " + e.message; }
  };

  function collectFiles() {
    let files = [];
    document.querySelectorAll("#fileList .file-card").forEach((card) => {
      const name = card.querySelector("input").value.trim() || "unnamed.js";
      const content = card.querySelector("textarea").value;
      if (content.trim()) files.push({ name, content });
    });
    // merge checked github files
    document.querySelectorAll("#ghFiles input[type=checkbox]:checked").forEach((cb) => {
      files.push({ name: cb.dataset.name, content: cb.dataset.content });
    });
    // dedupe by name
    const seen = new Set(); files = files.filter((f) => !seen.has(f.name) && seen.add(f.name));
    return files;
  }

  function card(title, mmd, skippedReason) {
    const div = document.createElement("div");
    div.className = "result-card";
    const head = document.createElement("header");
    const h = document.createElement("h3"); h.textContent = title;
    const acts = document.createElement("div"); acts.className = "actions";
    head.appendChild(h); head.appendChild(acts); div.appendChild(head);
    if (skippedReason) {
      const p = document.createElement("div"); p.className = "skip"; p.textContent = skippedReason;
      div.appendChild(p); return div;
    }
    const pre = document.createElement("pre"); pre.className = "mmd"; pre.textContent = "```mermaid\n" + mmd + "\n```";
    div.appendChild(pre);
    const render = document.createElement("div"); render.className = "mermaid-render";
    const inner = document.createElement("div"); inner.className = "mermaid"; inner.textContent = mmd;
    render.appendChild(inner); div.appendChild(render);
    const copy = document.createElement("button"); copy.className = "ghost"; copy.textContent = "Copy";
    copy.onclick = () => navigator.clipboard.writeText("## " + title + "\n```mermaid\n" + mmd + "\n```");
    const dl = document.createElement("button"); dl.className = "ghost"; dl.textContent = ".mmd";
    dl.onclick = () => download(title + ".mmd", mmd);
    const svg = document.createElement("button"); svg.className = "ghost"; svg.textContent = "SVG";
    svg.onclick = () => { const s = render.querySelector("svg"); if (s) download(title + ".svg", new XMLSerializer().serializeToString(s)); };
    acts.append(copy, dl, svg);
    return div;
  }

  function download(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = name.replace(/[^A-Za-z0-9._-]/g, "_");
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  $("genBtn").onclick = async () => {
    const files = collectFiles();
    const results = $("results"); results.innerHTML = "";
    $("emptyState").hidden = true;
    const notesBox = $("notesBox"); notesBox.innerHTML = ""; notesBox.hidden = true;
    const notes = [];
    if (!files.length) {
      $("emptyState").hidden = false;
      $("emptyState").innerHTML = "<p><b>No code provided.</b> Paste code, upload, fetch a repo, or load the demo.</p>";
      return;
    }
    const flow = $("flowInput").value.trim();
    const want = { class: $("wantClass").checked, er: $("wantER").checked, seq: $("wantSeq").checked, state: $("wantState").checked, comp: $("wantComp").checked };
    if ((want.seq || want.state) && !flow) notes.push("Sequence/state requested but no exact flow given — entry/edges are best-effort from real function names. Add a flow for a tighter trace.");

    if (want.class) {
      const r = ClassParser.parse(files);
      const mmd = ClassParser.toMermaid(r.classes);
      notes.push(...r.notes);
      results.appendChild(card("Class diagram", mmd, mmd ? null : "Skipped: no classes found in the provided code. " + r.notes.join(" ")));
    }
    if (want.er) {
      const r = ERParser.parse(files);
      const mmd = ERParser.toMermaid(r.tables);
      notes.push(...r.notes);
      results.appendChild(card("ER diagram", mmd, mmd ? null : "Skipped: no CREATE TABLE / Prisma models found. " + r.notes.join(" ")));
    }
    if (want.seq) {
      const r = SequenceParser.parse(files, flow);
      const mmd = SequenceParser.toMermaid(r, flow);
      notes.push(...(r.notes || []));
      results.appendChild(card("Sequence diagram" + (flow ? " — " + flow.slice(0, 60) : ""), mmd, mmd ? null : "Skipped: " + (r.notes || []).join(" ")));
    }
    if (want.state) {
      const r = StateParser.parse(files);
      const mmd = StateParser.toMermaid(r);
      notes.push(...r.notes);
      results.appendChild(card("State diagram", mmd, mmd ? null : "Skipped: " + r.notes.join(" ")));
    }
    if (want.comp) {
      const r = ComponentParser.parse(files);
      const mmd = ComponentParser.toMermaid(r);
      notes.push(...r.notes);
      results.appendChild(card("Component / architecture diagram", mmd, mmd ? null : "Skipped: " + r.notes.join(" ")));
    }
    if (notes.length) {
      notesBox.hidden = false;
      notesBox.innerHTML = "<h3>## Notes (ambiguity / inference / skips)</h3><ul>" + [...new Set(notes)].map((n) => "<li>" + escapeHtml(n) + "</li>").join("") + "</ul>";
    }
    try { await mermaid.run({ querySelector: ".mermaid" }); }
    catch (e) { notesBox.hidden = false; notesBox.innerHTML += "<p>Render warning: " + escapeHtml(e.message) + "</p>"; }
  };

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
})();
