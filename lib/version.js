import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  fs.readFileSync(path.join(currentDir, "..", "package.json"), "utf8")
);

export const APP_NAME = process.env.APP_NAME || "Forniture";
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || process.env.APP_VERSION || packageJson.version;

export function getAppVersion() {
  return APP_VERSION;
}

export default APP_VERSION;
