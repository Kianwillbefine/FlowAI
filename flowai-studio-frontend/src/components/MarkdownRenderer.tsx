import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckOutlined, CopyOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import './MarkdownRenderer.css'

interface MarkdownRendererProps {
  content: string
  className?: string
}

const markdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ...(defaultSchema.attributes?.a || []),
      'target',
      'rel',
    ],
    code: [
      ...(defaultSchema.attributes?.code || []),
      ['className', 'hljs', /^language-/],
    ],
    pre: [
      ...(defaultSchema.attributes?.pre || []),
      ['className', /^language-/],
    ],
    span: [
      ...(defaultSchema.attributes?.span || []),
      ['className', /^hljs-/],
    ],
  },
}

const remarkPlugins = [remarkGfm]
const rehypePlugins = [
  rehypeRaw,
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
  [rehypeSanitize, markdownSanitizeSchema],
] as any

const extractText = (value: unknown): string => {
  if (value === null || value === undefined || typeof value === 'boolean') return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(extractText).join('')

  if (typeof value === 'object') {
    const item = value as {
      props?: { children?: ReactNode }
      value?: unknown
      children?: unknown
    }

    if (item.props?.children !== undefined) return extractText(item.props.children)
    if (item.value !== undefined) return extractText(item.value)
    if (item.children !== undefined) return extractText(item.children)
  }

  return ''
}

const getClassName = (value: unknown): string => {
  if (value === null || value === undefined || typeof value === 'boolean') return ''
  if (Array.isArray(value)) return value.map(getClassName).find(Boolean) || ''

  if (typeof value === 'object') {
    const item = value as {
      props?: { className?: string; children?: ReactNode }
      children?: unknown
    }

    if (item.props?.className) return item.props.className
    if (item.props?.children !== undefined) return getClassName(item.props.children)
    if (item.children !== undefined) return getClassName(item.children)
  }

  return ''
}

const getLanguageLabel = (className: string) => {
  const match = className.match(/language-([\w-]+)/)
  return match?.[1]?.toUpperCase() || 'CODE'
}

const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

const CodeBlock = ({ children }: { children: ReactNode }) => {
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<number | null>(null)
  const codeText = extractText(children).replace(/\n$/, '')
  const languageLabel = getLanguageLabel(getClassName(children))

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current)
    }
  }, [])

  const handleCopy = async () => {
    if (!codeText) return

    await copyText(codeText)
    setCopied(true)

    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current)
    }

    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false)
      copiedTimerRef.current = null
    }, 1600)
  }

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-toolbar">
        <span className="markdown-code-language">{languageLabel}</span>
        <button
          type="button"
          className="markdown-code-copy"
          onClick={handleCopy}
          disabled={!codeText}
          aria-label={copied ? '代码已复制' : '复制代码'}
          title={copied ? '已复制' : '复制代码'}
        >
          {copied ? <CheckOutlined /> : <CopyOutlined />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  )
}

const MarkdownRenderer = ({ content, className }: MarkdownRendererProps) => (
  <div className={['markdown-renderer', className].filter(Boolean).join(' ')}>
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={{
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        table: ({ children, ...props }) => (
          <div className="markdown-table-scroll">
            <table {...props}>{children}</table>
          </div>
        ),
        a: ({ children, ...props }) => (
          <a {...props} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        ),
        img: ({ alt, ...props }) => (
          <img {...props} alt={alt || ''} loading="lazy" referrerPolicy="no-referrer" />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
)

export default MarkdownRenderer
