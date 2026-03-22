#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <markdown-file> [<markdown-file> ...]" >&2
  exit 1
fi

python3 - "$@" <<'PY'
from pathlib import Path
import sys

try:
    import markdown
except ImportError as exc:
    raise SystemExit(
        "python3 package 'markdown' is required to build docs HTML"
    ) from exc


CSS = """
:root {
  --bg: #ffffff;
  --fg: #24292f;
  --muted: #57606a;
  --border: #d0d7de;
  --code-bg: #f6f8fa;
  --quote: #656d76;
  --link: #0969da;
}
html { background: var(--bg); }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.65;
}
.container {
  max-width: 980px;
  margin: 0 auto;
  padding: 40px 32px 64px;
}
h1, h2, h3, h4 {
  line-height: 1.25;
  font-weight: 600;
  margin-top: 1.8em;
  margin-bottom: 0.65em;
}
h1 {
  font-size: 2.1rem;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--border);
  margin-top: 0;
}
h2 {
  font-size: 1.55rem;
  padding-bottom: 0.25em;
  border-bottom: 1px solid var(--border);
}
h3 { font-size: 1.25rem; }
h4 { font-size: 1rem; }
p, ul, ol, table, pre, blockquote {
  margin-top: 0;
  margin-bottom: 1rem;
}
ul, ol { padding-left: 2em; }
li + li { margin-top: 0.25rem; }
a {
  color: var(--link);
  text-decoration: none;
}
a:hover { text-decoration: underline; }
code {
  font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 0.92em;
  background: var(--code-bg);
  padding: 0.15em 0.35em;
  border-radius: 6px;
}
pre {
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  overflow: auto;
}
pre code {
  background: transparent;
  padding: 0;
  border-radius: 0;
  font-size: 0.9em;
}
blockquote {
  color: var(--quote);
  border-left: 4px solid var(--border);
  padding: 0 1em;
}
table {
  border-collapse: collapse;
  width: 100%;
  display: block;
  overflow: auto;
}
th, td {
  border: 1px solid var(--border);
  padding: 0.6em 0.8em;
  text-align: left;
}
th {
  background: #f6f8fa;
  font-weight: 600;
}
hr {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 2rem 0;
}
img {
  max-width: 100%;
}
@media (max-width: 700px) {
  .container { padding: 24px 18px 40px; }
  body { font-size: 15px; }
  h1 { font-size: 1.8rem; }
  h2 { font-size: 1.35rem; }
}
"""


def project_root() -> Path:
    return Path.cwd()


def output_path_for(src: Path, root: Path) -> Path:
    docs_dir = root / "docs"
    try:
        relative = src.relative_to(docs_dir)
    except ValueError as exc:
        raise SystemExit(f"Expected a path under {docs_dir}: {src}") from exc
    return docs_dir / "html" / relative.with_suffix(".html")


def render(src: Path, root: Path) -> Path:
    text = src.read_text()
    body = markdown.markdown(
        text,
        extensions=["tables", "fenced_code", "codehilite", "sane_lists"],
    )
    title = src.stem.replace("_", " ").replace("-", " ")
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>{CSS}</style>
</head>
<body>
  <main class="container">
    {body}
  </main>
</body>
</html>
"""
    out = output_path_for(src, root)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)
    return out


root = project_root()
for raw in sys.argv[1:]:
    src = (root / raw).resolve() if not Path(raw).is_absolute() else Path(raw)
    if not src.exists():
        raise SystemExit(f"File not found: {src}")
    if src.suffix.lower() != ".md":
        raise SystemExit(f"Expected a .md file: {src}")
    out = render(src, root)
    print(out.relative_to(root))
PY
