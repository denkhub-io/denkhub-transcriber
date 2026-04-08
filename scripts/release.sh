#!/bin/bash
# Release script for DenkHub Transcriber
# Usage: ./scripts/release.sh 1.0.3

set -e

VERSION="$1"

if [ -z "$VERSION" ]; then
  echo "Uso: ./scripts/release.sh <versione>"
  echo "Esempio: ./scripts/release.sh 1.0.3"
  exit 1
fi

echo "=== Release v${VERSION} ==="

# 1. Update version in package.json
echo "[1/7] Aggiorno versione in package.json..."
sed -i '' "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" package.json

# 2. Update version in index.html
echo "[2/7] Aggiorno versione in index.html..."
sed -i '' "s/v[0-9]*\.[0-9]*\.[0-9]*/v${VERSION}/g" src/renderer/index.html

# 3. Build Mac and Windows
echo "[3/7] Build macOS..."
npm run build:mac

echo "[4/7] Build Windows..."
npm run build:win

# 5. Create fixed-name copies
echo "[5/7] Creo copie con nome fisso..."
cp "dist/DenkHub-Transcriber-${VERSION}-arm64.dmg" "dist/DenkHub-Transcriber-mac.dmg"
cp "dist/DenkHub-Transcriber-Setup-${VERSION}.exe" "dist/DenkHub-Transcriber-Setup.exe"

# 6. Git commit and push
echo "[6/7] Commit e push..."
git add package.json src/renderer/index.html
git commit -m "Bump version to ${VERSION}"
git push origin main

# 7. Create GitHub release with all assets
echo "[7/7] Creo release su GitHub..."
gh release create "v${VERSION}" \
  "dist/DenkHub-Transcriber-${VERSION}-arm64.dmg" \
  "dist/DenkHub-Transcriber-Setup-${VERSION}.exe" \
  "dist/DenkHub-Transcriber-mac.dmg" \
  "dist/DenkHub-Transcriber-Setup.exe" \
  "dist/latest-mac.yml" \
  "dist/latest.yml" \
  --title "v${VERSION}" \
  --generate-notes

echo ""
echo "=== Release v${VERSION} completata! ==="
echo "https://github.com/denkhub-io/denkhub-transcriber/releases/tag/v${VERSION}"
