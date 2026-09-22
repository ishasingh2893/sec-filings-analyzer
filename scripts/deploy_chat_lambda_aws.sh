#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTION_NAME="${FUNCTION_NAME:-sec-filings-chat}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ZIP_PATH="${ZIP_PATH:-$ROOT_DIR/outputs/sec-filings-chat-lambda.zip}"
OPENAI_MODEL="${OPENAI_MODEL:-gpt-5.6-luna}"

if ! command -v aws >/dev/null 2>&1; then
  echo "The AWS CLI is required. Install/configure aws, then rerun this script." >&2
  exit 1
fi

if [ ! -f "$ZIP_PATH" ]; then
  "$ROOT_DIR/scripts/package_chat_lambda.sh"
fi

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "OPENAI_API_KEY is required in the environment." >&2
  exit 1
fi

ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT
cat >"$ENV_FILE" <<JSON
{
  "Variables": {
    "OPENAI_API_KEY": "$OPENAI_API_KEY",
    "OPENAI_MODEL": "$OPENAI_MODEL"
  }
}
JSON

if aws lambda get-function \
  --function-name "$FUNCTION_NAME" \
  --region "$AWS_REGION" >/dev/null 2>&1; then
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_PATH" \
    --region "$AWS_REGION" >/dev/null

  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$AWS_REGION"

  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs22.x \
    --handler chat_lambda_function.handler \
    --timeout 30 \
    --memory-size 1024 \
    --environment "file://$ENV_FILE" \
    --region "$AWS_REGION" >/dev/null
else
  if [ -z "${LAMBDA_ROLE_ARN:-}" ]; then
    echo "LAMBDA_ROLE_ARN is required when creating a new Lambda function." >&2
    echo "For updates to an existing function, only FUNCTION_NAME/AWS_REGION are needed." >&2
    exit 1
  fi

  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs22.x \
    --handler chat_lambda_function.handler \
    --role "$LAMBDA_ROLE_ARN" \
    --zip-file "fileb://$ZIP_PATH" \
    --timeout 30 \
    --memory-size 1024 \
    --environment "file://$ENV_FILE" \
    --region "$AWS_REGION" >/dev/null
fi

aws lambda wait function-active \
  --function-name "$FUNCTION_NAME" \
  --region "$AWS_REGION"

echo "Deployed $FUNCTION_NAME in $AWS_REGION from $ZIP_PATH"
