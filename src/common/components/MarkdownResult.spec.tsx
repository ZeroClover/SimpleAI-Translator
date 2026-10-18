import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownResult } from './MarkdownResult'

function render(text: string) {
    return renderToStaticMarkup(<MarkdownResult text={text} />)
}

describe('MarkdownResult', () => {
    it('renders the supported CommonMark structures', () => {
        const html = render(
            [
                '# Title',
                '',
                'Some **bold** and *italic* with `code`.',
                '',
                '- one',
                '  - nested',
                '',
                '1. first',
                '',
                '> quoted',
                '',
                '    indented code',
                '',
                '---',
            ].join('\n')
        )
        expect(html).toContain('<h1>Title</h1>')
        expect(html).toContain('<strong>bold</strong>')
        expect(html).toContain('<em>italic</em>')
        expect(html).toContain('<code>code</code>')
        expect(html).toMatch(/<ul>\s*<li>one\s*<ul>\s*<li>nested<\/li>/)
        expect(html).toMatch(/<ol>\s*<li>first<\/li>/)
        expect(html).toMatch(/<blockquote>\s*<p>quoted<\/p>/)
        expect(html).toContain('<pre><code>indented code\n</code></pre>')
        expect(html).toContain('<hr/>')
    })

    it('keeps single line breaks visible and code whitespace intact', () => {
        expect(render('line one\nline two')).toBe('<p>line one<br/>\nline two</p>')
        expect(render('line one\r\nline two')).toBe('<p>line one<br/>\nline two</p>')
        expect(render('- item one\n  continued')).toBe('<ul>\n<li>item one<br/>\ncontinued</li>\n</ul>')
        expect(render('*em\nphasis*')).toBe('<p><em>em<br/>\nphasis</em></p>')
        expect(render('```\n  a  b\n\tc\n```')).toBe('<pre><code>  a  b\n\tc\n</code></pre>')
    })

    it('renders a hard break once and adds no breaks between blocks', () => {
        for (const text of ['hard  \nbreak', 'hard\\\nbreak', 'hard \nbreak']) {
            expect(render(text)).toBe('<p>hard<br/>\nbreak</p>')
        }
        for (const text of ['- a\n\n- b', '- a\n  - b', '# Title\n\ntext\n\n> quote']) {
            expect(render(text)).not.toContain('<br/>')
        }
    })

    it('renders unclosed syntax from streaming without adding characters', () => {
        expect(render('**bold')).toBe('<p>**bold</p>')
        expect(render('```\nconst a = 1')).toBe('<pre><code>const a = 1\n</code></pre>')
    })

    it('shows raw HTML as text', () => {
        const html = render('<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)"> and <b>bold</b>')
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
        expect(html).toContain('&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;')
        expect(html).not.toMatch(/<(script|img|b)[\s>]/)
    })

    it('shows links as label text and images as alt text without active elements', () => {
        const html = render(
            [
                '[web](https://example.com) [js](javascript:alert(1)) [data](data:text/html,x) [file](file:///etc)',
                '<https://example.com/auto>',
                '![remote](https://example.com/a.png) ![](https://example.com/b.png)',
                '',
                '[ref][r]',
                '',
                '[r]: https://example.com/ref',
            ].join('\n')
        )
        expect(html).toBe(
            '<p><span>web</span> <span>js</span> <span>data</span> <span>file</span><br/>\n' +
                '<span>https://example.com/auto</span><br/>\n' +
                '<span>remote</span> </p>\n<p><span>ref</span></p>'
        )
        expect(html).not.toMatch(/<(a|img|iframe|script)[\s>]|href=|src=/)
    })
})
