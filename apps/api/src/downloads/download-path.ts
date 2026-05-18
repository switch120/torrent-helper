export const defaultDownloadDir = "/data/Movies/Sourced";
export const fixedDownloadDirs = [defaultDownloadDir, "/data/Movies/4k"] as const;

export function validateDownloadDir(downloadDir: string): string {
  const trimmed = String(downloadDir || "").trim();
  if (!trimmed.startsWith("/data")) {
    throw new Error("Download directory must start with /data");
  }
  if (trimmed.includes("..")) {
    throw new Error("Download directory cannot contain ..");
  }
  if (trimmed.includes("\0")) {
    throw new Error("Download directory is invalid");
  }
  return trimmed;
}
