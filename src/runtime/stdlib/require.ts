require.resolve = resolve;

export function require(...specifiers: unknown[]): unknown {
  return specifiers.length === 1
    ? import(/* @vite-ignore */ resolve(specifiers[0]))
    : Promise.all(specifiers.map((s) => require(s))).then((modules) => Object.assign({}, ...modules));
}

interface NpmSpecifier {
  /** a package name, such as "d3" */
  name: string;
  /** at sign and semver range, such as "@7", or the empty string */
  range: string;
  /** slash and path, such as "/foo", or the empty string */
  path: string;
}

function parseNpmSpecifier(specifier: string): NpmSpecifier {
  const parts = specifier.split("/");
  const namerange = specifier.startsWith("@")
    ? [parts.shift()!, parts.shift()!].join("/")
    : parts.shift()!;
  const ranged = namerange.indexOf("@", 1);
  const name = ranged > 0 ? namerange.slice(0, ranged) : namerange;
  const range = ranged > 0 ? namerange.slice(ranged) : "";
  const path = parts.length > 0 ? `/${parts.join("/")}` : "";
  return {name, range, path};
}

function resolve(_specifier: unknown): string {
  const specifier = String(_specifier);
  if (isProtocol(specifier) || isLocal(specifier)) return specifier;
  const {name, range, path} = parseNpmSpecifier(specifier);
  return `https://cdn.jsdelivr.net/npm/${name}${range}${path + (isFile(path) || isDirectory(path) ? "" : "/+esm")}`;
}

/** Returns true for e.g. https://example.com/ */
function isProtocol(specifier: string): boolean {
  return /^\w+:/.test(specifier);
}

/** Returns true for e.g. ./foo.js */
function isLocal(specifier: string): boolean {
  return /^(\.\/|\.\.\/|\/)/.test(specifier);
}

/** Returns true for e.g. foo/bar.js */
function isFile(specifier: string): boolean {
  return /(\.\w*)$/.test(specifier);
}

/** Returns true for e.g. foo/bar/ */
function isDirectory(specifier: string): boolean {
  return /(\/)$/.test(specifier);
}
