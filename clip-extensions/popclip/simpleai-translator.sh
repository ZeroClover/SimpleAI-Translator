send_text() {
    curl -d "$POPCLIP_TEXT" --unix-socket /tmp/simpleai-translator.sock http://simpleai-translator
}

if ! send_text; then
    open -g -a SimpleAI\ Translator
    sleep 2
    send_text
fi
