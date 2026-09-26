import * as path from 'path';

/** Directories never worth indexing: dependencies, build output, VCS and editor state. */
export const IGNORED_DIRECTORIES = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt',
  '.lumina', '.vscode', '.idea', '__pycache__', '.venv', 'venv', 'target', 'bin', 'obj', '.turbo', '.cache',
]);

/**
 * Extensions never indexed: binaries and media, plus text formats with no useful code for retrieval
 * (lock files, source maps, SVG).
 */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.wasm',
  '.mp3', '.mp4', '.mov', '.avi', '.wav',
  '.ttf', '.woff', '.woff2', '.eot',
  '.lock', '.bin', '.iso', '.dmg', '.vsix', '.map',
]);

/** Files that commonly hold credentials. These must never reach the index or a prompt. */
const SECRET_FILE_PATTERNS: RegExp[] = [
  /^\.env(\..*)?$/i,
  /\.(pem|key|p12|pfx|keystore|jks|crt|cer|der)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^\.(npmrc|pypirc|netrc|htpasswd)$/i,
  /^(credentials|secrets?|service[-_]account)(\..*)?\.json$/i,
  /^secrets?\.(ya?ml|toml)$/i,
];

/** Machine-generated lock files matched by exact name; they are large and add only noise to the index. */
const GENERATED_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'npm-shrinkwrap.json']);

/**
 * Whether a file name looks like it holds credentials (.env files, private keys, certificates, etc.).
 * Pass the base name, not a path: several patterns are anchored to the start of the name.
 */
export function isSecretFile(fileName: string): boolean {
  return SECRET_FILE_PATTERNS.some((re) => re.test(fileName));
}

/**
 * False for dependency, build and tool directories. Matches the bare name, so any folder called
 * e.g. "bin" or "out" is skipped at every depth.
 */
export function shouldIndexDirectory(dirName: string): boolean {
  return !IGNORED_DIRECTORIES.has(dirName);
}

/**
 * Whether the crawler should index a file, judged by base name: rejects secrets, lock files,
 * minified JS/CSS and binary extensions. File size is checked separately by the crawler.
 */
export function shouldIndexFile(fileName: string): boolean {
  if (isSecretFile(fileName)) return false;
  if (GENERATED_FILES.has(fileName)) return false;
  if (/\.min\.(js|css)$/i.test(fileName)) return false;
  return !BINARY_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}
