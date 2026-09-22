#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/.lambda_build"
OUTPUT_DIR="$ROOT_DIR/outputs"
ZIP_PATH="$OUTPUT_DIR/sec-filings-analyzer-lambda.zip"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR" "$OUTPUT_DIR"

cp "$ROOT_DIR/backend/analyzer/lambda_function.py" "$BUILD_DIR/"
cp "$ROOT_DIR/backend/analyzer/analyzer.py" "$BUILD_DIR/"
cp "$ROOT_DIR/backend/analyzer/regex_helpers.py" "$BUILD_DIR/"
cp "$ROOT_DIR/backend/analyzer/business_summarizer.py" "$BUILD_DIR/"

if [ -s "$ROOT_DIR/requirements.txt" ]; then
  python3 -m pip install \
    --requirement "$ROOT_DIR/requirements.txt" \
    --target "$BUILD_DIR"
fi

(
  cd "$BUILD_DIR"
  zip -qr "$ZIP_PATH" .
)

echo "Created $ZIP_PATH"
