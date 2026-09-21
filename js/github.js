/* GitHub fetch: public repos via REST API, no token. Small text files only. */
(function (global) {
  async function getTree(owner, repo, max) {
    const br = await fetch(`https://api.github.com/repos/${owner}/${repo}`).then((r) => {
      if (!r.ok) throw new Error("Repo not found or private (" + r.status + ")");
      return r.json();
    });
    const tree = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${br.default_branch}?recursive=1`).then((r) => {
      if (!r.ok) throw new Error("Could not read file tree");
      return r.json();
    });
    return (tree.tree || []).filter((t) => t.type === "blob");
  }

  async function fetchFiles(owner, repo, exts, max, onStatus) {
    const blobs = await getTree(owner, repo, max);
    const wanted = blobs.filter((b) => exts.some((e) => b.path.endsWith(e)) && (b.size || 0) < 60000).slice(0, max);
    onStatus(`Found ${blobs.length} files, loading ${wanted.length} source files…`);
    const out = [];
    for (const b of wanted) {
      const raw = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${b.path}`).then((r) => (r.ok ? r.text() : ""));
      if (raw) out.push({ name: b.path, content: raw.slice(0, 20000) });
      onStatus(`Loaded ${out.length}/${wanted.length}…`);
    }
    return out;
  }

  global.GithubFetch = { fetchFiles };
})(window);
