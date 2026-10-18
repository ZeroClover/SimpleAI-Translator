VERSION ?= 1.6.0

clean:
	rm -rf dist

change-package-version:
	sed "s/\"version\": \".*\"/\"version\": \"$(VERSION)\"/" package.json > package.json.tmp && mv package.json.tmp package.json

build-browser-extension: change-package-version
	pnpm wxt zip -b chromium
	pnpm wxt zip -b firefox

build-popclip-extension:
	rm -f dist/SimpleAI-Translator.popclipextz
	mkdir -p dist/SimpleAI-Translator.popclipext
	cp -r clip-extensions/popclip/* dist/SimpleAI-Translator.popclipext
	cd dist && zip -r SimpleAI-Translator.popclipextz SimpleAI-Translator.popclipext && rm -r SimpleAI-Translator.popclipext

build-snipdo-extension:
	rm -f dist/SimpleAI-Translator.pbar
	zip -j -r dist/SimpleAI-Translator.pbar clip-extensions/snipdo/*
