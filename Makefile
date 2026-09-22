build-AnalyzerFunction:
	mkdir -p "$(ARTIFACTS_DIR)"
	cp backend/analyzer/lambda_function.py "$(ARTIFACTS_DIR)/"
	cp backend/analyzer/analyzer.py "$(ARTIFACTS_DIR)/"
	cp backend/analyzer/regex_helpers.py "$(ARTIFACTS_DIR)/"
	cp backend/analyzer/business_summarizer.py "$(ARTIFACTS_DIR)/"
	if [ -s requirements.txt ]; then python3 -m pip install --requirement requirements.txt --target "$(ARTIFACTS_DIR)"; fi

build-ChatFunction:
	mkdir -p "$(ARTIFACTS_DIR)"
	cp backend/chat/chat_lambda_function.mjs "$(ARTIFACTS_DIR)/"
	cp backend/chat/chat-core.js "$(ARTIFACTS_DIR)/chat-core.js"
	cp backend/chat/package.json "$(ARTIFACTS_DIR)/package.json"
