import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const PLANCOP_DIR = path.join(os.homedir(), ".plancop", "history");

type VersionEntry = {
  version: number;
  path: string;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function extractHeading(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  if (!match) {
    return null;
  }

  const heading = match[1].trim();
  return heading.length > 0 ? heading : null;
}

function planDirFor(cwd: string, content: string): string {
  return path.join(PLANCOP_DIR, projectSlug(cwd), planSlug(content));
}

function parseStoredFile(stored: string): { hash: string | null; timestamp: string | null; content: string } {
  const match = stored.match(/^<!--\s*hash:([a-f0-9]{16})\s+timestamp:([^\s]+)\s*-->\n?/);
  if (!match) {
    return {
      hash: null,
      timestamp: null,
      content: stored,
    };
  }

  return {
    hash: match[1],
    timestamp: match[2],
    content: stored.slice(match[0].length),
  };
}

function listVersionEntries(dir: string): VersionEntry[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs
    .readdirSync(dir)
    .map((entry) => {
      const match = entry.match(/^v(\d+)\.md$/);
      if (!match) {
        return null;
      }

      return {
        version: Number(match[1]),
        path: path.join(dir, entry),
      };
    })
    .filter((entry): entry is VersionEntry => entry !== null)
    .sort((a, b) => a.version - b.version);

  return entries;
}

export function projectSlug(cwd: string): string {
  const base = path.basename(path.resolve(cwd || ""));
  const slug = slugify(base);
  return slug || "project";
}

export function planSlug(content: string): string {
  const heading = extractHeading(content);
  const source = heading ?? content.slice(0, 50);
  const slug = slugify(source);
  return slug || "plan";
}

export function contentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function savePlan(
  cwd: string,
  content: string
): { version: number; path: string; deduplicated: boolean } {
  const dir = planDirFor(cwd, content);
  fs.mkdirSync(dir, { recursive: true });

  const hash = contentHash(content);
  const versions = listVersionEntries(dir);
  const latest = versions[versions.length - 1];

  if (latest) {
    const latestStored = fs.readFileSync(latest.path, "utf8");
    const parsedLatest = parseStoredFile(latestStored);
    if (parsedLatest.hash === hash) {
      return {
        version: latest.version,
        path: latest.path,
        deduplicated: true,
      };
    }
  }

  const nextVersion = latest ? latest.version + 1 : 1;
  const nextPath = path.join(dir, `v${nextVersion}.md`);
  const timestamp = new Date().toISOString();
  const fileContent = `<!-- hash:${hash} timestamp:${timestamp} -->\n${content}`;

  fs.writeFileSync(nextPath, fileContent, "utf8");

  return {
    version: nextVersion,
    path: nextPath,
    deduplicated: false,
  };
}

export function getVersions(
  cwd: string,
  content: string
): { version: number; timestamp: string; path: string }[] {
  const dir = planDirFor(cwd, content);
  const versions = listVersionEntries(dir);

  return versions.map((entry) => {
    const stored = fs.readFileSync(entry.path, "utf8");
    const parsed = parseStoredFile(stored);

    return {
      version: entry.version,
      timestamp: parsed.timestamp ?? fs.statSync(entry.path).mtime.toISOString(),
      path: entry.path,
    };
  });
}

export function getVersion(cwd: string, content: string, versionId: number): string | null {
  const dir = planDirFor(cwd, content);
  const filePath = path.join(dir, `v${versionId}.md`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const stored = fs.readFileSync(filePath, "utf8");
  const parsed = parseStoredFile(stored);
  return parsed.content;
}
