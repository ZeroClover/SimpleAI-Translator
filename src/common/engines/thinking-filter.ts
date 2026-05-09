const TAG_PATTERN = /^<\s*(\/?)\s*thinking\s*>/i
const TAG_NAME = 'thinking'

function isWhitespace(char: string): boolean {
    return /\s/.test(char)
}

function isPotentialThinkingTagPrefix(value: string): boolean {
    if (!value.startsWith('<')) {
        return false
    }

    let index = 1
    while (index < value.length && isWhitespace(value[index])) {
        index += 1
    }
    if (index === value.length) {
        return true
    }

    if (value[index] === '/') {
        index += 1
        while (index < value.length && isWhitespace(value[index])) {
            index += 1
        }
        if (index === value.length) {
            return true
        }
    }

    for (let offset = 0; offset < TAG_NAME.length; offset += 1) {
        if (index + offset === value.length) {
            return true
        }
        if (value[index + offset].toLowerCase() !== TAG_NAME[offset]) {
            return false
        }
    }

    index += TAG_NAME.length
    while (index < value.length && isWhitespace(value[index])) {
        index += 1
    }

    return index === value.length
}

export class ThinkingFilter {
    private buffer = ''
    private depth = 0

    push(chunk: string): string {
        this.buffer += chunk
        let output = ''

        while (this.buffer) {
            const tagStart = this.buffer.indexOf('<')
            if (tagStart === -1) {
                if (this.depth === 0) {
                    output += this.buffer
                }
                this.buffer = ''
                break
            }

            if (tagStart > 0) {
                const text = this.buffer.slice(0, tagStart)
                if (this.depth === 0) {
                    output += text
                }
                this.buffer = this.buffer.slice(tagStart)
                continue
            }

            const tag = this.buffer.match(TAG_PATTERN)
            if (tag) {
                if (tag[1]) {
                    this.depth = Math.max(0, this.depth - 1)
                } else {
                    this.depth += 1
                }
                this.buffer = this.buffer.slice(tag[0].length)
                continue
            }

            if (isPotentialThinkingTagPrefix(this.buffer)) {
                break
            }

            if (this.depth === 0) {
                output += this.buffer[0]
            }
            this.buffer = this.buffer.slice(1)
        }

        return output
    }

    finish(): string {
        const output = this.depth === 0 ? this.buffer : ''
        this.buffer = ''
        this.depth = 0
        return output
    }
}
