import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const destination = resolve(root, "dist");
await mkdir(destination, { recursive: true });
await cp(join(root, "Dockerfile"), join(destination, "Dockerfile"));
await cp(resolve(root, "../rtc-gateway/server.mjs"), join(destination, "server.mjs"));
console.log(destination);
