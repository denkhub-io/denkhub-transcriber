/**
 * afterPack hook for electron-builder.
 * Fixes whisper-cli dylib rpaths so the binary works on any Mac,
 * not just the build machine.
 *
 * Problem: whisper.cpp compiles whisper-cli with absolute rpaths
 * pointing to the build directory (e.g. /Volumes/Crucial X10/...).
 * When packaged, the dylibs are in app.asar.unpacked but the rpaths
 * still reference the build machine paths.
 *
 * Fix: replace all absolute rpaths with @executable_path-relative ones.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  if (process.platform !== 'darwin') return;

  const appOutDir = context.appOutDir;
  const appName = context.packager.appInfo.productFilename;
  const resourcesDir = path.join(appOutDir, `${appName}.app`, 'Contents', 'Resources');
  // Check vendor/darwin (new location via extraResources)
  const vendorDir = path.join(resourcesDir, 'vendor', 'darwin');
  // Fallback: nodejs-whisper in asar.unpacked (legacy)
  const unpackedBase = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules', 'nodejs-whisper', 'cpp', 'whisper.cpp', 'build');
  const binaryPath = fs.existsSync(path.join(vendorDir, 'whisper-cli'))
    ? path.join(vendorDir, 'whisper-cli')
    : path.join(unpackedBase, 'bin', 'whisper-cli');

  if (!fs.existsSync(binaryPath)) {
    console.log('[fix-dylibs] whisper-cli not found, skipping:', binaryPath);
    return;
  }

  console.log('[fix-dylibs] Fixing rpaths for:', binaryPath);

  // Get current rpaths
  const otoolOutput = execSync(`otool -l "${binaryPath}"`, { encoding: 'utf8' });
  const rpathRegex = /cmd LC_RPATH\n\s+cmdsize \d+\n\s+path (.+?) \(offset/g;
  const currentRpaths = [];
  let match;
  while ((match = rpathRegex.exec(otoolOutput)) !== null) {
    currentRpaths.push(match[1]);
  }

  console.log('[fix-dylibs] Current rpaths:', currentRpaths);

  // Determine correct rpaths based on layout
  const isVendorLayout = binaryPath.includes('vendor/darwin');
  const correctRpaths = isVendorLayout
    ? ['@executable_path/lib']  // vendor/darwin/lib/ has all dylibs flat
    : [
        '@executable_path/../src',                   // libwhisper.1.dylib
        '@executable_path/../ggml/src',              // libggml.dylib, libggml-base.dylib, libggml-cpu.dylib
        '@executable_path/../ggml/src/ggml-blas',    // libggml-blas.dylib
        '@executable_path/../ggml/src/ggml-metal',   // libggml-metal.dylib
      ];

  // Remove all existing rpaths
  for (const rp of currentRpaths) {
    try {
      execSync(`install_name_tool -delete_rpath "${rp}" "${binaryPath}"`, { encoding: 'utf8' });
      console.log('[fix-dylibs] Removed rpath:', rp);
    } catch (e) {
      console.warn('[fix-dylibs] Could not remove rpath:', rp, e.message);
    }
  }

  // Add correct relative rpaths
  for (const rp of correctRpaths) {
    try {
      execSync(`install_name_tool -add_rpath "${rp}" "${binaryPath}"`, { encoding: 'utf8' });
      console.log('[fix-dylibs] Added rpath:', rp);
    } catch (e) {
      console.warn('[fix-dylibs] Could not add rpath:', rp, e.message);
    }
  }

  // Verify the fix
  const verifyOutput = execSync(`otool -l "${binaryPath}"`, { encoding: 'utf8' });
  const newRpaths = [];
  while ((match = rpathRegex.exec(verifyOutput)) !== null) {
    newRpaths.push(match[1]);
  }
  console.log('[fix-dylibs] New rpaths:', newRpaths);

  // Also fix dylib cross-references (each dylib may reference others via absolute paths)
  const dylibDirs = isVendorLayout
    ? [path.join(path.dirname(binaryPath), 'lib')]
    : [
        path.join(unpackedBase, 'src'),
        path.join(unpackedBase, 'ggml', 'src'),
        path.join(unpackedBase, 'ggml', 'src', 'ggml-blas'),
        path.join(unpackedBase, 'ggml', 'src', 'ggml-metal'),
      ];

  for (const dir of dylibDirs) {
    if (!fs.existsSync(dir)) continue;
    const dylibs = fs.readdirSync(dir).filter(f => f.endsWith('.dylib'));
    for (const dylib of dylibs) {
      const dylibPath = path.join(dir, dylib);
      fixDylibRpaths(dylibPath);
    }
  }

  console.log('[fix-dylibs] Done!');
};

function fixDylibRpaths(dylibPath) {
  try {
    const otoolOutput = execSync(`otool -l "${dylibPath}"`, { encoding: 'utf8' });
    const rpathRegex = /cmd LC_RPATH\n\s+cmdsize \d+\n\s+path (.+?) \(offset/g;
    let match;
    const rpaths = [];
    while ((match = rpathRegex.exec(otoolOutput)) !== null) {
      rpaths.push(match[1]);
    }

    // Only fix if there are absolute rpaths
    const absoluteRpaths = rpaths.filter(r => !r.startsWith('@'));
    if (absoluteRpaths.length === 0) return;

    console.log(`[fix-dylibs] Fixing dylib: ${path.basename(dylibPath)}, rpaths: ${absoluteRpaths}`);

    for (const rp of absoluteRpaths) {
      try {
        execSync(`install_name_tool -delete_rpath "${rp}" "${dylibPath}"`, { encoding: 'utf8' });
      } catch (e) { /* ignore */ }
    }

    // Add relative rpaths for cross-references
    const relRpaths = [
      '@loader_path',
      '@loader_path/..',
      '@loader_path/../..',
      '@loader_path/../../ggml/src',
      '@loader_path/../../ggml/src/ggml-blas',
      '@loader_path/../../ggml/src/ggml-metal',
    ];

    for (const rp of relRpaths) {
      try {
        execSync(`install_name_tool -add_rpath "${rp}" "${dylibPath}"`, { encoding: 'utf8' });
      } catch (e) { /* ignore - may already exist */ }
    }
  } catch (e) {
    console.warn(`[fix-dylibs] Could not fix ${path.basename(dylibPath)}:`, e.message);
  }
}
