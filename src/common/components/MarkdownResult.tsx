import Markdown, { type Components } from 'react-markdown'

interface MarkdownNode {
    type: string
    value?: string
    children?: MarkdownNode[]
}

// CommonMark renders a single line ending inside a paragraph or list item as a space.
// Turning those soft breaks into hard breaks keeps every line of the translation visible.
function splitSoftBreaks(node: MarkdownNode) {
    if (!node.children) {
        return
    }
    node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
            splitSoftBreaks(child)
            return [child]
        }
        return child.value.split(/[\t ]*(?:\r?\n|\r)/).flatMap((value, index) => {
            const text = value ? [{ type: 'text', value }] : []
            return index === 0 ? text : [{ type: 'break' }, ...text]
        })
    })
}

const remarkPlugins = [() => splitSoftBreaks]

// Translated text is untrusted data: links show only their label and images only
// their alt text, so rendering never navigates or loads a resource.
const components: Components = {
    a: ({ children }) => <span>{children}</span>,
    img: ({ alt }) => (alt ? <span>{alt}</span> : null),
}

export function MarkdownResult({ text }: { text: string }) {
    return (
        <Markdown remarkPlugins={remarkPlugins} components={components}>
            {text}
        </Markdown>
    )
}
