/**
 * prepare-mcp-server.js
 *
 * Prepares the mcp-server/ directory for packaging:
 *   1. npm install inside mcp-server/ (native bindings compiled against the
 *      same Node.js that runs this script)
 *   2. On Windows: copies this Node.js binary to vendor/win32/node.exe so
 *      the packaged app can run the MCP server without requiring Node.js to
 *      be installed on the end-user machine.
 *
 * The Node.js version used here and the one bundled as node.exe are always
 * identical, which guarantees the better-sqlite3 ABI matches.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const MCP_DIR = path.join(ROOT, 'mcp-server');

// 1. Install mcp-server dependencies
console.log('[prepare-mcp] npm install in mcp-server/');
execSync('npm install', { cwd: MCP_DIR, stdio: 'inherit' });

// 2. Bundle this Node.js binary into vendor/<platform>/ so the packaged app
//    can run the MCP server without requiring Node.js on the end-user machine.
if (process.platform === 'win32') {
  const vendorDir = path.join(ROOT, 'vendor', 'win32');
  const dest = path.join(vendorDir, 'node.exe');
  fs.mkdirSync(vendorDir, { recursive: true });
  fs.copyFileSync(process.execPath, dest);
  console.log(`[prepare-mcp] Copied node.exe (${process.version}) → vendor/win32/node.exe`);
} else if (process.platform === 'darwin') {
  const vendorDir = path.join(ROOT, 'vendor', 'darwin');
  const dest = path.join(vendorDir, 'node');
  fs.mkdirSync(vendorDir, { recursive: true });
  fs.copyFileSync(process.execPath, dest);
  fs.chmodSync(dest, 0o755);
  console.log(`[prepare-mcp] Copied node (${process.version}) → vendor/darwin/node`);
}
