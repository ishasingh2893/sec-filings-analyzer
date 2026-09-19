# AWS Deployment

This project has two deployable parts:

- Python analyzer API: AWS Lambda behind API Gateway.
- React/Vinext frontend: host with AWS Amplify, or another static/frontend host that can run the build.

## Backend: Lambda + API Gateway

The Lambda entry point is `lambda_function.handler`.

Recommended settings:

- Runtime: Python 3.12
- Memory: 1024 MB
- Timeout: 30 seconds
- API route: `POST /analyze`
- CORS: allow the frontend domain. `*` is acceptable while testing.

### Deploy with AWS SAM

Install and configure the AWS CLI and SAM CLI, then run:

```sh
sam build
sam deploy --guided
```

SAM will print the `AnalyzerApiUrl` output. Use that URL in the frontend environment variable.

The SAM template uses `Makefile` packaging so only the Lambda Python files are included in the backend artifact.

### Create a manual Lambda zip

If you prefer the Lambda console:

```sh
./scripts/package_lambda.sh
```

Upload `outputs/sec-filings-analyzer-lambda.zip` to Lambda and set the handler to:

```text
lambda_function.handler
```

Then create an API Gateway HTTP API route that sends `POST /analyze` to the Lambda.

## Frontend

The frontend reads the analyzer API URL from:

```text
VITE_ANALYZER_API_URL
```

For compatibility with Next-style hosting, it also accepts:

```text
NEXT_PUBLIC_ANALYZER_API_URL
```

Local development can continue to use the default:

```text
http://localhost:8000/
```

In AWS Amplify, set:

```text
VITE_ANALYZER_API_URL=https://your-api-id.execute-api.your-region.amazonaws.com/analyze
```

Then use the normal build command:

```sh
npm ci
npm run build
```

## Notes

- The Lambda needs outbound internet access to read SEC URLs.
- Do not place the Lambda in a private VPC unless NAT access is configured.
- API Gateway has a request timeout, so keep the analyzer fast and avoid unnecessary retries.
- The SEC can rate limit requests. If usage grows, add caching for company lookup and filing index requests.
