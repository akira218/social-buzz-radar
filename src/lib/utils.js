import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, "../..");

export async function readJson(relativePath) {
  const text = await readFile(path.join(rootDir, relativePath), "utf8");
  return JSON.parse(text);
}

export function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeText(value = "") {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value = "") {
  return uniq(
    normalizeText(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  );
}

export function decodeHtml(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function scoreFromAge(publishedAt) {
  if (!publishedAt) return 42;
  const timestamp = new Date(publishedAt).getTime();
  if (Number.isNaN(timestamp)) return 42;
  const hours = Math.max(0, (Date.now() - timestamp) / 36e5);
  if (hours <= 3) return 100;
  if (hours <= 12) return 88;
  if (hours <= 24) return 76;
  if (hours <= 72) return 58;
  if (hours <= 168) return 38;
  return 22;
}

export function toPercentage(value) {
  return `${Math.round(clamp(value))}`;
}
