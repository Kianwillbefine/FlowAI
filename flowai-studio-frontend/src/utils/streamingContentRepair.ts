const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

interface FenceState {
  marker: '`' | '~'
  length: number
}

interface RepairState {
  fence: FenceState | null
  htmlTagStack: string[]
  virtualHtmlTagStack: string[]
  pendingTagCompletion: string
}

const getFenceMatch = (line: string) => {
  const match = line.match(/^ {0,3}([`~]{3,})/)
  if (!match) return null

  const markerRun = match[1]
  return {
    marker: markerRun[0] as FenceState['marker'],
    length: markerRun.length,
  }
}

const isFenceCloseLine = (line: string, fence: FenceState) => {
  const match = line.match(/^ {0,3}([`~]{3,})\s*$/)
  if (!match) return false

  const markerRun = match[1]
  return markerRun[0] === fence.marker && markerRun.length >= fence.length
}

const countRun = (value: string, start: number, marker: string) => {
  let cursor = start
  while (cursor < value.length && value[cursor] === marker) {
    cursor += 1
  }
  return cursor - start
}

const findHtmlTagEnd = (line: string, start: number) => {
  let quote: string | null = null

  for (let cursor = start + 1; cursor < line.length; cursor += 1) {
    const char = line[cursor]

    if (quote) {
      if (char === quote) quote = null
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '>') return cursor
  }

  return -1
}

const hasBalancedTagQuotes = (value: string) => {
  let quote: string | null = null

  for (let cursor = 0; cursor < value.length; cursor += 1) {
    const char = value[cursor]

    if (quote) {
      if (char === quote) quote = null
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
    }
  }

  return quote === null
}

const closeHtmlTag = (stack: string[], tagName: string) => {
  const stackIndex = stack.lastIndexOf(tagName)
  if (stackIndex === -1) return

  stack.splice(stackIndex)
}

const parseHtmlTag = (rawTag: string, state: RepairState) => {
  const tagBody = rawTag.slice(1, -1).trim()
  if (!tagBody || tagBody.startsWith('!') || tagBody.startsWith('?')) return
  if (/^(?:[a-z][\w+.-]*:|[^@\s]+@[^@\s]+$)/i.test(tagBody)) return

  const isClosingTag = tagBody.startsWith('/')
  const tagNameMatch = tagBody.match(/^\/?\s*([A-Za-z][\w:-]*)(?=\s|\/|$)/)
  const tagName = tagNameMatch?.[1]?.toLowerCase()
  if (!tagName) return

  if (isClosingTag) {
    closeHtmlTag(state.htmlTagStack, tagName)
    return
  }

  const isSelfClosing = /\/\s*$/.test(tagBody)
  if (!isSelfClosing && !VOID_HTML_TAGS.has(tagName)) {
    state.htmlTagStack.push(tagName)
  }
}

const parsePendingHtmlTag = (pendingTag: string, state: RepairState) => {
  if (!hasBalancedTagQuotes(pendingTag)) return

  const pendingTagBody = pendingTag.slice(1).trim()
  if (/^(?:[a-z][\w+.-]*:|[^@\s]+@[^@\s]*$)/i.test(pendingTagBody)) return

  const match = pendingTag.match(/^<\s*(\/?)\s*([A-Za-z][\w:-]*)(?=\s|\/|$)(?:\s[^<>]*)?\/?\s*$/)
  const tagName = match?.[2]?.toLowerCase()
  if (!tagName) return

  const isClosingTag = match?.[1] === '/'
  const isSelfClosing = /\/\s*$/.test(pendingTag)

  if (isClosingTag) {
    if (!state.htmlTagStack.includes(tagName)) return
    closeHtmlTag(state.htmlTagStack, tagName)
    state.pendingTagCompletion = '>'
    return
  }

  state.pendingTagCompletion = '>'

  if (!isSelfClosing && !VOID_HTML_TAGS.has(tagName)) {
    state.virtualHtmlTagStack.push(tagName)
  }
}

const parseHtmlTagsOutsideInlineCode = (line: string, state: RepairState, isLastLine: boolean) => {
  let inlineCodeRunLength = 0

  for (let cursor = 0; cursor < line.length; cursor += 1) {
    const char = line[cursor]

    if (char === '`') {
      const runLength = countRun(line, cursor, '`')
      if (inlineCodeRunLength === 0) {
        inlineCodeRunLength = runLength
      } else if (runLength >= inlineCodeRunLength) {
        inlineCodeRunLength = 0
      }
      cursor += runLength - 1
      continue
    }

    if (inlineCodeRunLength > 0 || char !== '<') continue

    if (line.startsWith('<!--', cursor)) {
      const commentEnd = line.indexOf('-->', cursor + 4)
      if (commentEnd === -1) break
      cursor = commentEnd + 2
      continue
    }

    const tagEnd = findHtmlTagEnd(line, cursor)
    if (tagEnd === -1) {
      if (isLastLine) {
        parsePendingHtmlTag(line.slice(cursor), state)
      }
      break
    }

    parseHtmlTag(line.slice(cursor, tagEnd + 1), state)
    cursor = tagEnd
  }
}

const getLineEnd = (content: string, start: number) => {
  const nextLineBreak = content.indexOf('\n', start)
  return nextLineBreak === -1 ? content.length : nextLineBreak
}

const analyzeContent = (content: string) => {
  const state: RepairState = {
    fence: null,
    htmlTagStack: [],
    virtualHtmlTagStack: [],
    pendingTagCompletion: '',
  }

  let lineStart = 0

  while (lineStart <= content.length) {
    const lineEnd = getLineEnd(content, lineStart)
    const line = content.slice(lineStart, lineEnd).replace(/\r$/, '')
    const isLastLine = lineEnd === content.length

    if (state.fence) {
      if (isFenceCloseLine(line, state.fence)) {
        state.fence = null
      }
    } else {
      const fenceMatch = getFenceMatch(line)
      if (fenceMatch) {
        state.fence = fenceMatch
      } else {
        parseHtmlTagsOutsideInlineCode(line, state, isLastLine)
      }
    }

    if (isLastLine) break
    lineStart = lineEnd + 1
  }

  return state
}

export const repairMarkdownDisplayContent = (content: string) => {
  if (!content) return content

  const state = analyzeContent(content)
  let repairedContent = content + state.pendingTagCompletion

  if (state.fence) {
    const fenceClose = state.fence.marker.repeat(state.fence.length)
    repairedContent += `${/\n$/.test(repairedContent) ? '' : '\n'}${fenceClose}`
  }

  const closingTags = [
    ...state.virtualHtmlTagStack.slice().reverse(),
    ...state.htmlTagStack.slice().reverse(),
  ]

  if (closingTags.length > 0) {
    if (state.fence && !/\n$/.test(repairedContent)) {
      repairedContent += '\n'
    }

    repairedContent += closingTags.map((tagName) => `</${tagName}>`).join('')
  }

  return repairedContent
}
