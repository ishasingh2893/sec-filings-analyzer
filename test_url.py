"""Run the SEC HTML analyzer against a filing URL."""
import argparse
import json

from analyzer import analyze_html


def main():
    parser = argparse.ArgumentParser(description="Analyze an SEC 10-Q or 10-K HTML filing URL.")
    parser.add_argument("url", help="HTTPS URL for the SEC filing HTML document")
    args = parser.parse_args()

    if not args.url.startswith("https://"):
        raise SystemExit("Provide an HTTPS filing URL.")

    result = analyze_html(args.url)
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
