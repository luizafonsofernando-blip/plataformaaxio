import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const output = join(here, "dist");
for (const name of ["api", "server-assets", "reforma-tributaria", "public", "package.json", "pnpm-lock.yaml", "build.mjs", "vercel.json"]) {
  const target = resolve(output, name);
  if (relative(root, target).startsWith("..")) throw new Error("Unsafe build path");
  await rm(target, { recursive: true, force: true });
}
await mkdir(join(output, "api", "onboarding"), { recursive: true });
await cp(join(root, "api", "rtc"), join(output, "api", "rtc"), { recursive: true });
await rm(join(output, "api", "rtc", "local-login.js"));
await cp(join(root, "api", "_security.js"), join(output, "api", "_security.js"));
await cp(join(root, "api", "onboarding", "login.js"), join(output, "api", "onboarding", "_login-base.js"));
await writeFile(join(output, "api", "onboarding", "login.js"), `import sharedLogin from "./_login-base.js";
export default function handler(request, response) {
  if (request.method !== "POST" || request.body?.profile !== "reforma-tributaria") {
    response.setHeader("Cache-Control", "no-store");
    return response.status(403).json({ code: "module_forbidden" });
  }
  return sharedLogin(request, response);
}
`);
await cp(join(root, "server-assets"), join(output, "server-assets"), {
  recursive: true,
  filter: (path) => path === join(root, "server-assets") || /rtc-[^\\/]+\.mjs$/.test(path),
});
await cp(join(root, "reforma-tributaria"), join(output, "reforma-tributaria"), { recursive: true });
await cp(join(root, "package.json"), join(output, "package.json"));
await cp(join(root, "pnpm-lock.yaml"), join(output, "pnpm-lock.yaml"));
await writeFile(join(output, "build.mjs"), `import { cp, mkdir } from "node:fs/promises";
await mkdir("public/reforma-tributaria", { recursive: true });
for (const name of ["index.html", "style.css", "app.js", "example-operation.json"]) await cp("reforma-tributaria/" + name, "public/reforma-tributaria/" + name);
`);
await writeFile(join(output, "vercel.json"), JSON.stringify({
  buildCommand: "node build.mjs",
  outputDirectory: "public",
  functions: { "api/**/*.js": { includeFiles: "server-assets/rtc-*.mjs" } },
  redirects: [{ source: "/", destination: "/reforma-tributaria/", permanent: false }],
  headers: [{ source: "/(.*)", headers: [
    { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "Cache-Control", value: "no-store" },
  ] }],
}, null, 2));
console.log(output);
