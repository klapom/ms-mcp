import { homedir } from "node:os";
import { resolve } from "node:path";

/**
 * Resolves a path that may start with `~` to an absolute path using os.homedir().
 * Absolute paths pass through unchanged; relative paths resolve against cwd.
 */
export function resolveTildePath(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return resolve(homedir(), p.slice(2));
  }
  return resolve(p);
}
