VERSION ?= 1.0.0

clean:
	rm -rf dist

change-version:
	sed -i -e "s/\"version\": \".*\"/\"version\": \"$(VERSION)\"/" src-tauri/tauri.conf.json

change-package-version:
	sed -i -e "s/\"version\": \".*\"/\"version\": \"$(VERSION)\"/" package.json

build-browser-extension: change-package-version
	pnpm vite build -c vite.config.chromium.ts
	pnpm vite build -c vite.config.firefox.ts
	rm -f dist/browser-extension/chromium.zip dist/browser-extension/firefox.zip
	cd dist/browser-extension/chromium && zip -r ../chromium.zip .
	cd dist/browser-extension/firefox && zip -r ../firefox.zip .

build-userscript: change-package-version
	pnpm vite build -c vite.config.userscript.ts

build-popclip-extension:
	rm -f dist/SimpleAI-Translator.popclipextz
	mkdir -p dist/SimpleAI-Translator.popclipext
	cp -r clip-extensions/popclip/* dist/SimpleAI-Translator.popclipext
	cd dist && zip -r SimpleAI-Translator.popclipextz SimpleAI-Translator.popclipext && rm -r SimpleAI-Translator.popclipext

build-snipdo-extension:
	rm -f dist/SimpleAI-Translator.pbar
	zip -j -r dist/SimpleAI-Translator.pbar clip-extensions/snipdo/*
