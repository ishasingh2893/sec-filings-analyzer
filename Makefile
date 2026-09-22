build-AnalyzerFunction:
	mkdir -p "$(ARTIFACTS_DIR)"
	cp lambda_function.py "$(ARTIFACTS_DIR)/"
	cp analyzer.py "$(ARTIFACTS_DIR)/"
	cp regex_helpers.py "$(ARTIFACTS_DIR)/"
	cp business_summarizer.py "$(ARTIFACTS_DIR)/"
	if [ -s requirements.txt ]; then python3 -m pip install --requirement requirements.txt --target "$(ARTIFACTS_DIR)"; fi

build-ChatFunction:
	mkdir -p "$(ARTIFACTS_DIR)"
	cp chat_lambda_function.mjs "$(ARTIFACTS_DIR)/"
	cp lib/chat-core.js "$(ARTIFACTS_DIR)/chat-core.js"
