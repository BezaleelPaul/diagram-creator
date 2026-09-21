/* GitHub fetch: public repos via REST API, no token. Small text files only. */
(function (global) {
  const IGNORE_DIRS = ["node_modules/", "dist/", "build/", ".git/", "vendor/", "__pycache__/", ".next/", "coverage/", ".vercel/", "out/"];
  const IGNORE_FILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", ".min.js", ".map", ".png", ".jpg", ".ico", ".pdf", ".zip"];

  function parseRepo(input) {
    const t = String(input || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "");
    const m = t.match(/^([\w.-]+)\/([\w.-]+)/);
    if (!m) throw new Error("Use owner/repo or a github.com URL.");
    return { owner: m[1], repo: m[2] };
  }

  async function api(url) {
    const r = await fetch(url);
    if (r.status === 403) {
      const reset = r.headers.get("x-ratelimit-reset");
      const when = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : "later";
      throw new Error(`GitHub rate limit (60/hr, no token). Try again after ${when}, or paste files manually.`);
    }
    if (r.status === 404) throw new Error("Repo not found or private (404).");
    if (!r.ok) throw new Error(`GitHub API ${r.status}.`);
    return r.json();
  }

  function wanted(blob, exts, prefix) {
    const p = blob.path || "";
    if (prefix && !p.toLowerCase().startsWith(prefix.toLowerCase())) return false;
    if (IGNORE_DIRS.some((d) => p.includes(d))) return false;
    if (IGNORE_FILES.some((f) => p.endsWith(f))) return false;
    const low = p.toLowerCase();
    return exts.some((e) => low.endsWith(e.toLowerCase()));
  }

  async function fetchOne(owner, repo, branch, path) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${path.split("/").map(encodeURIComponent).join("/")}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const t = await r.text();
    if (!t || t.includes("\0")) return null; // binary
    return t.slice(0, 20000);
  }

  async function fetchFiles(repoInput, exts, max, onStatus, prefix) {
    const { owner, repo } = parseRepo(repoInput);
    onStatus("Reading repo info…");
    const info = await api(`https://api.github.com/repos/${owner}/${repo}`);
    const branch = info.default_branch || "main";
    onStatus(`Reading file tree (${branch})…`);
    const tree = await api(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    const blobs = (tree.tree || []).filter((t) => t.type === "blob");
    if (tree.truncated) onStatus("Warning: huge repo, tree truncated — use Path prefix to narrow (e.g. src/).");
    const list = blobs.filter((b) => wanted(b, exts, prefix)).slice(0, max);
    if (!list.length) throw new Error("No matching source files. Widen extensions or clear the path prefix.");
    onStatus(`Found ${blobs.length} files, loading ${list.length} source files…`);
    // parallel pool of 6 (was sequential — the smoothness bug)
    const out = [];
    let done = 0;
    const queue = list.slice();
    async function worker() {
      while (queue.length) {
        const b = queue.shift();
        try {
          const content = await fetchOne(owner, repo, branch, b.path);
          if (content) out.push({ name: b.path, content });
        } catch (e) { /* skip one bad file */ }
        done++;
        onStatus(`Loaded ${done}/${list.length}…`);
      }
    }
    await Promise.all(Array.from({ length: Math.min(6, list.length) }, worker));
    // keep repo order
    const order = new Map(list.map((b, i) => [b.path, i]));
    out.sort((a, b) => order.get(a.name) - order.get(b.name));
    if (!out.length) throw new Error("Files listed but raw fetch failed. Repo may block raw access — paste files manually.");
    return out;
  }

  global.GithubFetch = { fetchFiles, parseRepo };
})(window);
