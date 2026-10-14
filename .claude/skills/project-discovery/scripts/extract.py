#!/usr/bin/env python3
"""Extract function definitions and calls from source files into a YAML index."""

import argparse
import sys
from collections import defaultdict
from pathlib import Path

import yaml
from tree_sitter import Query, QueryCursor
from tree_sitter_language_pack import get_language, get_parser

LANGUAGES = {
    ".py":   "python",
    ".js":   "javascript",
    ".jsx":  "javascript",
    ".ts":   "typescript",
    ".tsx":  "tsx",
    ".go":   "go",
    ".rb":   "ruby",
    ".rs":   "rust",
    ".java": "java",
    ".c":    "c",
    ".h":    "c",
    ".cpp":  "cpp",
    ".hpp":  "cpp",
}

# Capture-name convention: "<group>.<kind>" where group is "def" or "call".
# When the same node is captured by multiple patterns, the highest-priority
# kind wins (e.g. a `const foo = () => {}` is `function`, not `var`).
KIND_PRIORITY = {
    "def":  ["function", "class", "type", "module", "import",
             "field", "const", "var", "param", "local"],
    "call": ["new", "method", "function"],
}
LOCAL_KINDS = {"param", "var", "local"}

_JS_COMMON_DEFS = """
    (function_declaration name: (identifier) @def.function)
    (function_expression name: (identifier) @def.function)
    (generator_function_declaration name: (identifier) @def.function)
    (method_definition name: (property_identifier) @def.function)
    (variable_declarator name: (identifier) @def.var)
    (variable_declarator
        name: (identifier) @def.function
        value: [(arrow_function) (function_expression)])
    (import_specifier name: (identifier) @def.import)
    (import_specifier alias: (identifier) @def.import)
    (namespace_import (identifier) @def.import)
    (import_clause (identifier) @def.import)
"""
_JS_CALLS = """
    (call_expression function: (identifier) @call.function)
    (call_expression function: (member_expression property: (property_identifier) @call.method))
    (new_expression constructor: (identifier) @call.new)
"""
_TS_DEFS = _JS_COMMON_DEFS + """
    (class_declaration name: (type_identifier) @def.class)
    (required_parameter pattern: (identifier) @def.param)
    (optional_parameter pattern: (identifier) @def.param)
    (interface_declaration name: (type_identifier) @def.type)
    (type_alias_declaration name: (type_identifier) @def.type)
    (enum_declaration name: (identifier) @def.type)
"""

QUERIES = {
    "python": """
        (function_definition name: (identifier) @def.function)
        (class_definition name: (identifier) @def.class)
        (assignment left: (identifier) @def.var)
        (parameters (identifier) @def.param)
        (parameters (typed_parameter (identifier) @def.param))
        (parameters (default_parameter name: (identifier) @def.param))
        (parameters (typed_default_parameter name: (identifier) @def.param))
        (lambda_parameters (identifier) @def.param)
        (aliased_import alias: (identifier) @def.import)
        (import_statement name: (dotted_name (identifier) @def.import))
        (import_from_statement name: (dotted_name (identifier) @def.import))
        (call function: (identifier) @call.function)
        (call function: (attribute attribute: (identifier) @call.method))
    """,
    "javascript": _JS_COMMON_DEFS + """
        (class_declaration name: (identifier) @def.class)
        (formal_parameters (identifier) @def.param)
        (arrow_function parameter: (identifier) @def.param)
    """ + _JS_CALLS,
    "typescript": _TS_DEFS + _JS_CALLS,
    "tsx":        _TS_DEFS + _JS_CALLS,
    "go": """
        (function_declaration name: (identifier) @def.function)
        (method_declaration name: (field_identifier) @def.function)
        (type_spec name: (type_identifier) @def.type)
        (const_spec name: (identifier) @def.const)
        (var_spec name: (identifier) @def.var)
        (short_var_declaration left: (expression_list (identifier) @def.var))
        (parameter_declaration name: (identifier) @def.param)
        (field_declaration name: (field_identifier) @def.field)
        (call_expression function: (identifier) @call.function)
        (call_expression function: (selector_expression field: (field_identifier) @call.method))
    """,
    "ruby": """
        (method name: (identifier) @def.function)
        (singleton_method name: (identifier) @def.function)
        (class name: (constant) @def.class)
        (module name: (constant) @def.module)
        (assignment left: (identifier) @def.var)
        (method_parameters (identifier) @def.param)
        (call method: (identifier) @call.method)
    """,
    "rust": """
        (function_item name: (identifier) @def.function)
        (struct_item name: (type_identifier) @def.type)
        (enum_item name: (type_identifier) @def.type)
        (trait_item name: (type_identifier) @def.type)
        (type_item name: (type_identifier) @def.type)
        (mod_item name: (identifier) @def.module)
        (const_item name: (identifier) @def.const)
        (static_item name: (identifier) @def.const)
        (let_declaration pattern: (identifier) @def.var)
        (parameter pattern: (identifier) @def.param)
        (call_expression function: (identifier) @call.function)
        (call_expression function: (field_expression field: (field_identifier) @call.method))
        (call_expression function: (scoped_identifier name: (identifier) @call.function))
    """,
    "java": """
        (method_declaration name: (identifier) @def.function)
        (class_declaration name: (identifier) @def.class)
        (interface_declaration name: (identifier) @def.type)
        (enum_declaration name: (identifier) @def.type)
        (field_declaration declarator: (variable_declarator name: (identifier) @def.field))
        (local_variable_declaration declarator: (variable_declarator name: (identifier) @def.var))
        (formal_parameter name: (identifier) @def.param)
        (method_invocation name: (identifier) @call.method)
        (object_creation_expression type: (type_identifier) @call.new)
    """,
    "c": """
        (function_definition declarator: (function_declarator declarator: (identifier) @def.function))
        (declaration declarator: (function_declarator declarator: (identifier) @def.function))
        (declaration declarator: (init_declarator declarator: (identifier) @def.var))
        (declaration declarator: (identifier) @def.var)
        (parameter_declaration declarator: (identifier) @def.param)
        (struct_specifier name: (type_identifier) @def.type)
        (union_specifier name: (type_identifier) @def.type)
        (enum_specifier name: (type_identifier) @def.type)
        (type_definition declarator: (type_identifier) @def.type)
        (call_expression function: (identifier) @call.function)
    """,
    "cpp": """
        (function_definition declarator: (function_declarator declarator: (identifier) @def.function))
        (function_definition declarator: (function_declarator declarator: (field_identifier) @def.function))
        (declaration declarator: (function_declarator declarator: (identifier) @def.function))
        (declaration declarator: (init_declarator declarator: (identifier) @def.var))
        (declaration declarator: (identifier) @def.var)
        (parameter_declaration declarator: (identifier) @def.param)
        (class_specifier name: (type_identifier) @def.class)
        (struct_specifier name: (type_identifier) @def.type)
        (enum_specifier name: (type_identifier) @def.type)
        (type_definition declarator: (type_identifier) @def.type)
        (namespace_definition name: (namespace_identifier) @def.module)
        (call_expression function: (identifier) @call.function)
        (call_expression function: (field_expression field: (field_identifier) @call.method))
    """,
}


def _iter_captures(cursor, root):
    captures = cursor.captures(root)
    if isinstance(captures, dict):
        for name, nodes in captures.items():
            for node in nodes:
                yield node, name
    else:
        for node, name in captures:
            yield node, name


def _better_kind(group: str, a: str, b: str) -> str:
    p = KIND_PRIORITY.get(group, [])
    ia = p.index(a) if a in p else len(p)
    ib = p.index(b) if b in p else len(p)
    return a if ia <= ib else b


def _walk(node):
    yield node
    for c in node.named_children:
        yield from _walk(c)


def _import_name(node):
    """Return the local-binding name for a Python import sub-node, or None."""
    if node.type == "dotted_name" and node.named_children:
        return node.named_children[0].text.decode()
    if node.type == "aliased_import":
        alias = node.child_by_field_name("alias")
        if alias is not None:
            return alias.text.decode()
        name = node.child_by_field_name("name")
        if name is not None and name.named_children:
            return name.named_children[0].text.decode()
    return None


def _python_external_imports(root, project_pkgs=frozenset()):
    """External-import bindings in this file, excluding project-internal
    absolute imports (e.g. `from src.database import X` when `src/` is a
    top-level project directory)."""
    ext = set()

    def _module_first_seg(node):
        if node is None:
            return None
        if node.type == "dotted_name" and node.named_children:
            return node.named_children[0].text.decode()
        if node.type == "aliased_import":
            nm = node.child_by_field_name("name")
            if nm is not None and nm.named_children:
                return nm.named_children[0].text.decode()
        return None

    for n in _walk(root):
        if n.type == "import_statement":
            for c in n.named_children:
                first = _module_first_seg(c)
                if first and first in project_pkgs:
                    continue
                name = _import_name(c)
                if name:
                    ext.add(name)
        elif n.type == "import_from_statement":
            mod = n.child_by_field_name("module_name")
            if mod is None or mod.type == "relative_import":
                continue
            mod_first = mod.named_children[0].text.decode() if mod.named_children else None
            if mod_first in project_pkgs:
                continue
            for c in n.named_children:
                if c is mod:
                    continue
                name = _import_name(c)
                if name:
                    ext.add(name)
    return ext


def _js_external_imports(root):
    ext = set()
    for n in _walk(root):
        if n.type != "import_statement":
            continue
        src = n.child_by_field_name("source")
        if src is None:
            continue
        s = src.text.decode().strip("'\"`")
        if s.startswith(".") or s.startswith("/"):
            continue
        for c in n.named_children:
            if c.type != "import_clause":
                continue
            for cc in c.named_children:
                if cc.type == "identifier":
                    ext.add(cc.text.decode())
                elif cc.type == "namespace_import":
                    for ccc in cc.named_children:
                        if ccc.type == "identifier":
                            ext.add(ccc.text.decode())
                elif cc.type == "named_imports":
                    for spec in cc.named_children:
                        if spec.type != "import_specifier":
                            continue
                        alias = spec.child_by_field_name("alias")
                        if alias is not None:
                            ext.add(alias.text.decode())
                        else:
                            nm = spec.child_by_field_name("name")
                            if nm is not None:
                                ext.add(nm.text.decode())
    return ext


def _project_packages(root: Path):
    """Top-level package/module names that count as project-internal."""
    skip = {".git", "node_modules", "venv", ".venv", "__pycache__",
            "dist", "build", "target"}
    pkgs = set()
    try:
        for p in root.iterdir():
            if p.name.startswith(".") or p.name in skip:
                continue
            if p.is_dir():
                pkgs.add(p.name)
            elif p.is_file() and p.suffix == ".py":
                pkgs.add(p.stem)
    except (OSError, PermissionError):
        pass
    return pkgs


_EXT_IMPORTS = {
    "python":     _python_external_imports,
    "javascript": lambda r, _pkgs: _js_external_imports(r),
    "typescript": lambda r, _pkgs: _js_external_imports(r),
    "tsx":        lambda r, _pkgs: _js_external_imports(r),
}

_RECEIVER_PARENT = {
    "python":     "attribute",
    "javascript": "member_expression",
    "typescript": "member_expression",
    "tsx":        "member_expression",
}


def _receiver_root(node, lang_name):
    """For a method-call name node, return the leftmost receiver identifier."""
    parent_type = _RECEIVER_PARENT.get(lang_name)
    if parent_type is None:
        return None
    parent = node.parent
    if parent is None or parent.type != parent_type:
        return None
    obj = parent.child_by_field_name("object")
    while obj is not None:
        if obj.type == "identifier":
            return obj.text.decode()
        if obj.type == parent_type:
            obj = obj.child_by_field_name("object")
        else:
            return None
    return None


def extract_file(path: Path, project_pkgs=frozenset()):
    """Returns (records, lang_name, external_imports) or (None, None, None) if unsupported."""
    lang_name = LANGUAGES.get(path.suffix)
    if not lang_name or lang_name not in QUERIES:
        return None, None, None
    src = path.read_bytes()
    parser = get_parser(lang_name)
    tree = parser.parse(src)
    ext_fn = _EXT_IMPORTS.get(lang_name, lambda r, _pkgs: set())
    ext_imports = ext_fn(tree.root_node, project_pkgs)
    query = Query(get_language(lang_name), QUERIES[lang_name])
    cursor = QueryCursor(query)
    out = []
    for node, capture in _iter_captures(cursor, tree.root_node):
        group, _, kind = capture.partition(".")
        kind = kind or "function"
        name = node.text.decode("utf-8", errors="replace")
        external = False
        if group == "call":
            if kind in ("function", "new"):
                external = name in ext_imports
            elif kind == "method":
                recv = _receiver_root(node, lang_name)
                if recv is not None and recv in ext_imports:
                    external = True
        out.append({
            "name":     name,
            "group":    group,
            "kind":     kind,
            "file":     str(path),
            "line":     node.start_point[0] + 1,
            "col":      node.start_point[1],
            "external": external,
        })
    return out, lang_name, ext_imports


def walk(root: Path):
    skip = {".git", "node_modules", "venv", ".venv",
            "__pycache__", "dist", "build", "target"}
    for p in root.rglob("*"):
        if p.is_file() and not any(part in skip for part in p.parts):
            yield p


def write_summary(out_path: Path, root: Path, words: dict, file_meta: dict):
    """Emit a markdown architecture digest aimed at LLM project discovery."""
    from collections import Counter

    def rel(p):
        try:
            return str(Path(p).resolve().relative_to(root.resolve()))
        except ValueError:
            return str(p)

    langs = Counter(m["lang"] for m in file_meta.values())
    ext_deps = set()
    for m in file_meta.values():
        ext_deps.update(m["ext_deps"])

    file_defs = defaultdict(lambda: {"class": [], "function": [], "type": []})
    for name, v in words.items():
        for d in v["defined"]:
            if d["kind"] in ("class", "function", "type"):
                file_defs[d["file"]][d["kind"]].append(name)

    hot = []
    orphans = []
    for name, v in words.items():
        if not any(d["kind"] != "import" for d in v["defined"]):
            continue
        nc = len(v["called"])
        if nc:
            hot.append((nc, name))
        else:
            if any(d["kind"] in ("function", "class") for d in v["defined"]):
                orphans.append(name)
    hot.sort(reverse=True)

    entry_files = {"main.py", "__main__.py", "cli.py", "app.py", "server.py",
                   "index.js", "main.js", "app.js", "main.go", "main.rs"}
    entry_points = []
    for name in ("main", "cli", "run", "start"):
        for d in words.get(name, {}).get("defined", []):
            if d["kind"] == "function":
                entry_points.append((name, d["file"], d["line"]))
    for f in file_meta:
        if Path(f).name in entry_files:
            entry_points.append(("(file)", f, 1))

    def _is_test_file(path):
        p = Path(path)
        if any(part in {"tests", "test", "__tests__", "spec"} for part in p.parts):
            return True
        return p.stem.startswith("test_") or p.stem.endswith("_test") or p.stem.endswith(".test")

    core_files, test_files = [], []
    for f, d in file_defs.items():
        score = len(d["class"]) + len(d["function"])
        bucket = test_files if _is_test_file(f) else core_files
        bucket.append((score, f, d))
    core_files.sort(reverse=True)
    test_files.sort(reverse=True)

    lines = []
    lines.append(f"# Project Discovery: {root.resolve().name}")
    lines.append("")
    lang_str = ", ".join(f"{l} {n}" for l, n in langs.most_common())
    lines.append(f"**Files indexed:** {len(file_meta)} ({lang_str})")
    if ext_deps:
        head = ", ".join(f"`{d}`" for d in sorted(ext_deps)[:30])
        more = f" (+{len(ext_deps) - 30} more)" if len(ext_deps) > 30 else ""
        lines.append(f"**External deps:** {head}{more}")
    lines.append("")

    if entry_points:
        lines.append("## Entry points")
        seen_ep = set()
        for name, f, line in entry_points:
            if _is_test_file(f):
                continue
            key = (f, name)
            if key in seen_ep:
                continue
            seen_ep.add(key)
            lines.append(f"- `{name}` — {rel(f)}:{line}")
        lines.append("")

    lines.append("## Hot internal API")
    lines.append("Most-called names that are also defined inside the project.")
    lines.append("")
    for n, name in hot[:20]:
        lines.append(f"- `{name}` — {n} calls")
    lines.append("")

    lines.append("## Architecture (core files, top by class+function defs)")
    lines.append("")
    for score, f, defs in core_files[:30]:
        cls = defs["class"]
        fns = defs["function"]
        lines.append(f"### {rel(f)}")
        if cls:
            lines.append(f"- classes: {', '.join(f'`{c}`' for c in cls)}")
        if fns:
            shown = ", ".join(f"`{x}`" for x in fns[:10])
            tail = f", +{len(fns) - 10} more" if len(fns) > 10 else ""
            lines.append(f"- functions: {shown}{tail}")
        lines.append("")
    if len(core_files) > 30:
        lines.append(f"_+{len(core_files) - 30} more core files with defs_")
        lines.append("")
    if test_files:
        total_test_defs = sum(s for s, _, _ in test_files)
        lines.append(f"## Tests: {len(test_files)} files, {total_test_defs} class+function defs")
        lines.append("")

    lines.append(f"## Orphan callable defs: {len(orphans)}")
    lines.append("Defined functions/classes never called inside the indexed code "
                 "(often framework-dispatched: migrations, route handlers, test cases, plugins).")
    if orphans:
        # Surface common naming patterns to hint at the dispatch mechanism.
        suffixes = Counter()
        for name in orphans:
            for suf in ("Migration", "Handler", "Test", "Command", "View", "Route",
                        "Service", "Controller", "Plugin"):
                if name.endswith(suf):
                    suffixes[suf] += 1
                    break
        if suffixes:
            lines.append("")
            lines.append("Common suffix patterns:")
            for suf, n in suffixes.most_common():
                lines.append(f"- `*{suf}` — {n}")
    lines.append("")

    out_path.write_text("\n".join(lines))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("path")
    ap.add_argument("output", nargs="?", default="index.yaml")
    ap.add_argument("--symbols-only", action="store_true",
                    help="exclude params and local variables")
    ap.add_argument("--internal-only", action="store_true",
                    help="drop calls to names not defined in the project")
    ap.add_argument("--summary", metavar="OUT.md",
                    help="also write a markdown project-discovery digest")
    args = ap.parse_args()

    root = Path(args.path)
    out_path = Path(args.output)
    project_pkgs = _project_packages(root)

    # Dedup at the same source location, keeping the highest-priority kind.
    seen = {}  # (file, line, col, name, group) -> record dict
    file_meta = {}  # file path -> {lang, ext_deps}
    for f in walk(root):
        try:
            records, lang_name, ext_imports = extract_file(f, project_pkgs)
            if records is None:
                continue
            file_meta[str(f)] = {"lang": lang_name, "ext_deps": ext_imports}
            for r in records:
                key = (r["file"], r["line"], r["col"], r["name"], r["group"])
                if key in seen:
                    cur = seen[key]
                    if _better_kind(r["group"], cur["kind"], r["kind"]) == r["kind"]:
                        cur["kind"] = r["kind"]
                    cur["external"] = cur["external"] or r["external"]
                else:
                    seen[key] = dict(r)
        except Exception as e:
            print(f"skip {f}: {e}", file=sys.stderr)

    words = defaultdict(lambda: {"defined": [], "called": []})
    for r in seen.values():
        if args.symbols_only and r["kind"] in LOCAL_KINDS:
            continue
        if args.internal_only and r["external"]:
            continue
        bucket = "defined" if r["group"] == "def" else "called"
        words[r["name"]][bucket].append(
            {"kind": r["kind"], "file": r["file"], "line": r["line"], "col": r["col"]})

    if args.internal_only:
        for name in list(words.keys()):
            v = words[name]
            if not any(rec["kind"] != "import" for rec in v["defined"]):
                del words[name]

    doc = {"words": {k: dict(v) for k, v in sorted(words.items())}}
    out_path.write_text(yaml.safe_dump(doc, sort_keys=False, default_flow_style=False))
    print(f"{len(words)} words -> {out_path}")

    if args.summary:
        write_summary(Path(args.summary), root, words, file_meta)
        print(f"summary -> {args.summary}")


if __name__ == "__main__":
    main()
