#!/usr/bin/env python3
"""
Daemon de indexação incremental SQLite FTS5 de baixa prioridade para a extensão Lumen.
Utiliza varredura em largura (BFS - Breadth-First Search) priorizando pastas de documentos
do usuário antes de subpastas profundas, garantindo que todos os arquivos relevantes
em ~/Documentos, ~/Downloads, ~/Área de trabalho, ~/Imagens e projetos sejam indexados.
"""

from collections import deque
import json
import mimetypes
import os
import sqlite3
import sys
import time
from pathlib import Path

TEXT_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".rst", ".json", ".yaml", ".yml", ".toml",
    ".ini", ".cfg", ".conf", ".py", ".js", ".ts", ".tsx", ".jsx", ".rs",
    ".c", ".h", ".cpp", ".hpp", ".go", ".java", ".kt", ".sh", ".bash",
    ".zsh", ".fish", ".css", ".scss", ".html", ".xml", ".sql", ".csv",
    ".log", ".tex", ".org",
}

KIND_MAP = {
    "pdf": {".pdf"},
    "image": {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".bmp", ".tiff"},
    "imagem": {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".bmp", ".tiff"},
    "audio": {".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac"},
    "video": {".mp4", ".mkv", ".webm", ".mov", ".avi"},
    "code": {".py", ".js", ".ts", ".tsx", ".jsx", ".rs", ".c", ".cpp", ".go", ".java", ".sh", ".html", ".css"},
    "codigo": {".py", ".js", ".ts", ".tsx", ".jsx", ".rs", ".c", ".cpp", ".go", ".java", ".sh", ".html", ".css"},
    "doc": {".pdf", ".txt", ".md", ".odt", ".doc", ".docx", ".rtf"},
    "documento": {".pdf", ".txt", ".md", ".odt", ".doc", ".docx", ".rtf"},
    "sheet": {".ods", ".xls", ".xlsx", ".csv"},
    "planilha": {".ods", ".xls", ".xlsx", ".csv"},
}

DEFAULT_HEAVY_EXCLUDES = {
    ".git", "node_modules", ".cache", ".local", "__pycache__", ".venv", "venv",
    "target", "dist", "build", ".npm", ".gradle", ".cargo", ".rustup", ".dotnet",
    ".nuget", "go", "snap", ".var", ".steam", ".wine", ".ollama", "contexts",
}


def lower_process_priority():
    """Reduz a prioridade de CPU (nice) para não competir com o GNOME Shell."""
    try:
        os.nice(15)
    except OSError:
        pass


class FTS5IndexDaemon:
    def __init__(self, db_path: str):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self):
        cur = self.conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL;")
        cur.execute("PRAGMA synchronous=NORMAL;")
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS files_meta (
                path TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                parent_dir TEXT NOT NULL,
                ext TEXT NOT NULL,
                is_dir INTEGER NOT NULL DEFAULT 0,
                mtime INTEGER NOT NULL,
                size INTEGER NOT NULL DEFAULT 0
            );
            """
        )
        cur.execute(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
                path UNINDEXED,
                name,
                content_snippet,
                tokenize='unicode61 remove_diacritics 2'
            );
            """
        )
        cur.execute("CREATE INDEX IF NOT EXISTS idx_files_mtime ON files_meta(mtime DESC);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_files_ext ON files_meta(ext);")
        self.conn.commit()

    def _extract_snippet(self, file_path: Path, include_content: bool) -> str:
        if not include_content or file_path.suffix.lower() not in TEXT_EXTENSIONS:
            return ""
        try:
            stat = file_path.stat()
            if stat.st_size > 256 * 1024:
                return ""
            with file_path.open("r", encoding="utf-8", errors="ignore") as f:
                return f.read(4096).replace("\x00", " ").strip()
        except OSError:
            return ""

    def upsert_file(self, path_str: str, include_content: bool = True, commit: bool = True):
        p = Path(path_str)
        if not p.exists():
            self.remove_file(path_str, commit=commit)
            return

        try:
            stat = p.stat()
        except OSError:
            return

        is_dir = 1 if p.is_dir() else 0
        mtime = int(stat.st_mtime)
        size = 0 if is_dir else int(stat.st_size)
        ext = "folder" if is_dir else p.suffix.lower()
        name = p.name
        parent_dir = str(p.parent)

        cur = self.conn.cursor()
        existing = cur.execute(
            "SELECT mtime FROM files_meta WHERE path = ?", (path_str,)
        ).fetchone()
        if existing and existing["mtime"] == mtime:
            return

        snippet = "" if is_dir else self._extract_snippet(p, include_content)

        cur.execute(
            """
            INSERT INTO files_meta (path, name, parent_dir, ext, is_dir, mtime, size)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                name=excluded.name,
                parent_dir=excluded.parent_dir,
                ext=excluded.ext,
                is_dir=excluded.is_dir,
                mtime=excluded.mtime,
                size=excluded.size;
            """,
            (path_str, name, parent_dir, ext, is_dir, mtime, size),
        )
        cur.execute("DELETE FROM files_fts WHERE path = ?", (path_str,))
        cur.execute(
            "INSERT INTO files_fts (path, name, content_snippet) VALUES (?, ?, ?)",
            (path_str, name, snippet),
        )
        if commit:
            self.conn.commit()

    def remove_file(self, path_str: str, commit: bool = True):
        cur = self.conn.cursor()
        cur.execute("DELETE FROM files_meta WHERE path = ?", (path_str,))
        cur.execute("DELETE FROM files_fts WHERE path = ?", (path_str,))
        if commit:
            self.conn.commit()

    def sync_directories(
        self,
        directories: list[str],
        excluded: list[str],
        include_content: bool = True,
        max_files: int = 25000,
        max_depth: int = 6,
    ) -> int:
        excluded_set = set(excluded) | DEFAULT_HEAVY_EXCLUDES
        visited_dirs: set[str] = set()
        queue: deque[tuple[Path, int]] = deque()

        # Enfileira as raízes na ordem de prioridade configurada
        for root_dir in directories:
            root_path = Path(root_dir).expanduser().resolve()
            if root_path.exists() and root_path.is_dir():
                queue.append((root_path, 0))

        count = 0
        while queue and count < max_files:
            current_dir, depth = queue.popleft()
            dir_str = str(current_dir)
            if dir_str in visited_dirs:
                continue
            visited_dirs.add(dir_str)

            try:
                entries = list(os.scandir(current_dir))
            except OSError:
                continue

            # Ordena entradas para indexar arquivos diretos antes de descer em subpastas
            for entry in entries:
                name = entry.name
                if name.startswith(".") or name in excluded_set:
                    continue

                full_path = entry.path
                if any(full_path.endswith(f"/{ex}") for ex in excluded_set):
                    continue

                try:
                    is_dir = entry.is_dir(follow_symlinks=False)
                except OSError:
                    continue

                self.upsert_file(
                    full_path,
                    include_content=(include_content and not is_dir),
                    commit=False,
                )
                count += 1

                if count % 400 == 0:
                    self.conn.commit()

                if is_dir and depth < max_depth:
                    queue.append((Path(full_path), depth + 1))

                if count >= max_files:
                    break

        self.conn.commit()
        return count

    def search(
        self,
        term: str,
        kind_filter: str | None = None,
        in_dir_filter: str | None = None,
        min_mtime: int | None = None,
        excluded_exts: list[str] | None = None,
        limit: int = 20,
    ) -> list[dict]:
        cur = self.conn.cursor()
        params: list = []
        where_clauses: list[str] = []

        if kind_filter:
            k_lower = kind_filter.lower()
            if k_lower in ("folder", "pasta", "dir", "diretorio"):
                where_clauses.append("m.is_dir = 1")
            elif k_lower in KIND_MAP:
                exts = sorted(KIND_MAP[k_lower])
                placeholders = ",".join("?" for _ in exts)
                where_clauses.append(f"m.ext IN ({placeholders})")
                params.extend(exts)
            else:
                ext_val = k_lower if k_lower.startswith(".") else f".{k_lower}"
                where_clauses.append("m.ext = ?")
                params.append(ext_val)
        elif excluded_exts:
            norm_exts = [
                (e.lower() if e.startswith(".") else f".{e.lower()}")
                for e in excluded_exts
                if e
            ]
            if norm_exts:
                placeholders = ",".join("?" for _ in norm_exts)
                where_clauses.append(f"m.ext NOT IN ({placeholders})")
                params.extend(norm_exts)

        if in_dir_filter:
            where_clauses.append("LOWER(m.parent_dir) LIKE ?")
            params.append(f"%{in_dir_filter.lower()}%")

        if min_mtime is not None and min_mtime > 0:
            where_clauses.append("m.mtime >= ?")
            params.append(int(min_mtime))

        clean_tokens = [
            "".join(ch for ch in tok if ch.isalnum() or ch in ("_", "-"))
            for tok in (term or "").split()
        ]
        clean_tokens = [t for t in clean_tokens if t]

        results_map: dict[str, dict] = {}

        # 1. Busca direta por substring no nome do arquivo (garante achar "relatorio_2026.pdf" buscando "2026" ou "relat")
        if clean_tokens:
            like_clauses = ["LOWER(m.name) LIKE ?" for _ in clean_tokens] + list(where_clauses)
            like_params = [f"%{t.lower()}%" for t in clean_tokens] + list(params) + [limit]
            sql_like = f"""
                SELECT m.path, m.name, m.parent_dir, m.ext, m.is_dir, m.mtime, m.size,
                       '' AS snippet
                FROM files_meta m
                WHERE {" AND ".join(like_clauses)}
                ORDER BY
                    CASE WHEN LOWER(m.name) LIKE ? THEN 0 ELSE 1 END,
                    m.is_dir DESC,
                    m.mtime DESC
                LIMIT ?
            """
            prefix_param = f"{clean_tokens[0].lower()}%"
            final_like_params = [f"%{t.lower()}%" for t in clean_tokens] + list(params) + [prefix_param, limit]
            for r in cur.execute(sql_like, final_like_params).fetchall():
                results_map[r["path"]] = self._row_to_dict(r)

        # 2. Busca FTS5 (tokenizada com remoção de acentos no nome e no conteúdo textual)
        if clean_tokens and len(results_map) < limit:
            fts_query = " AND ".join(f'"{tok}"*' for tok in clean_tokens)
            sql_fts = """
                SELECT m.path, m.name, m.parent_dir, m.ext, m.is_dir, m.mtime, m.size,
                       snippet(files_fts, 2, '[', ']', '…', 10) AS snippet
                FROM files_fts
                JOIN files_meta m ON m.path = files_fts.path
                WHERE files_fts MATCH ?
            """
            full_params = [fts_query] + params
            if where_clauses:
                sql_fts += " AND " + " AND ".join(where_clauses)
            sql_fts += " ORDER BY bm25(files_fts, 0.0, 10.0, 1.5), m.mtime DESC LIMIT ?"
            full_params.append(limit)

            for r in cur.execute(sql_fts, full_params).fetchall():
                if r["path"] not in results_map:
                    results_map[r["path"]] = self._row_to_dict(r)
                elif r["snippet"] and not results_map[r["path"]]["snippet"]:
                    results_map[r["path"]]["snippet"] = r["snippet"]

        elif not clean_tokens:
            sql_all = """
                SELECT m.path, m.name, m.parent_dir, m.ext, m.is_dir, m.mtime, m.size,
                       '' AS snippet
                FROM files_meta m
            """
            full_params = list(params)
            if where_clauses:
                sql_all += " WHERE " + " AND ".join(where_clauses)
            sql_all += " ORDER BY m.mtime DESC LIMIT ?"
            full_params.append(limit)
            for r in cur.execute(sql_all, full_params).fetchall():
                results_map[r["path"]] = self._row_to_dict(r)

        return list(results_map.values())[:limit]

    def _row_to_dict(self, r) -> dict:
        mime_guess, _ = mimetypes.guess_type(r["path"])
        return {
            "path": r["path"],
            "name": r["name"],
            "parentDir": r["parent_dir"],
            "ext": r["ext"],
            "isDir": bool(r["is_dir"]),
            "mtime": r["mtime"],
            "size": r["size"],
            "snippet": r["snippet"] or "",
            "mimeType": "inode/directory" if r["is_dir"] else (mime_guess or "application/octet-stream"),
        }


def main():
    lower_process_priority()
    if len(sys.argv) < 2:
        sys.stderr.write("Uso: indexerDaemon.py <caminho_sqlite_db>\n")
        sys.exit(1)

    db_path = sys.argv[1]
    daemon = FTS5IndexDaemon(db_path)

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        req_id = None
        try:
            msg = json.loads(line)
            req_id = msg.get("id")
            action = msg.get("action")

            if action == "search":
                items = daemon.search(
                    term=msg.get("term", ""),
                    kind_filter=msg.get("kind"),
                    in_dir_filter=msg.get("inDir"),
                    min_mtime=msg.get("minMtime"),
                    excluded_exts=msg.get("excludedExts"),
                    limit=int(msg.get("limit", 15)),
                )
                resp = {"id": req_id, "ok": True, "results": items}
            elif action == "sync":
                indexed = daemon.sync_directories(
                    directories=msg.get("directories", []),
                    excluded=msg.get("excluded", []),
                    include_content=bool(msg.get("includeContent", True)),
                )
                resp = {"id": req_id, "ok": True, "indexed": indexed}
            elif action == "upsert":
                daemon.upsert_file(
                    msg.get("path", ""),
                    include_content=bool(msg.get("includeContent", True)),
                )
                resp = {"id": req_id, "ok": True}
            elif action == "remove":
                daemon.remove_file(msg.get("path", ""))
                resp = {"id": req_id, "ok": True}
            elif action == "ping":
                resp = {"id": req_id, "ok": True, "ts": int(time.time() * 1000)}
            else:
                resp = {"id": req_id, "ok": False, "error": f"Ação desconhecida: {action}"}
        except Exception as exc:
            resp = {"id": req_id, "ok": False, "error": str(exc)}

        sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
