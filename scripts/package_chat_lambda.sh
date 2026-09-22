#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/.chat_lambda_build"
OUTPUT_DIR="$ROOT_DIR/outputs"
ZIP_PATH="$OUTPUT_DIR/sec-filings-chat-lambda.zip"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR" "$OUTPUT_DIR"

cp "$ROOT_DIR/chat_lambda_function.mjs" "$BUILD_DIR/"
cp "$ROOT_DIR/lib/chat-core.js" "$BUILD_DIR/chat-core.js"

(
  cd "$BUILD_DIR"
  zip -qr "$ZIP_PATH" .
)

echo "Created $ZIP_PATH"
