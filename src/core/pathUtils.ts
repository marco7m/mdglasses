export function normalizeBaseDir(dir: string): string {
  return dir.replace(/\\/g, "/").replace(/\/$/, "") || "/";
}

export function resolvePath(baseDir: string, relative: string): string {
  const base = baseDir.replace(/\\/g, "/");
  const rel = relative.replace(/\\/g, "/");
  if (rel.startsWith("/")) return rel;
  const parts = [...base.split("/").filter(Boolean), ...rel.split("/").filter((p) => p !== ".")];
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else out.push(p);
  }
  return "/" + out.join("/");
}
