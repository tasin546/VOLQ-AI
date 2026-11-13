import React, { Component, type ErrorInfo, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, WrapText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { type Options } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

interface CodeBlockProps {
  className?: string;
  children?: React.ReactNode;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ className, children }) => {
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const match = /language-(\w+)/.exec(className ?? '');
  const language = match?.[1] ?? 'text';
  const isInline = !className && !String(children).includes('\n');

  if (isInline) {
    return <code className={className}>{children}</code>;
  }

  const extractText = (node: React.ReactNode): string => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (React.isValidElement(node) && node.props && typeof node.props === 'object') {
      return extractText((node.props as { children?: React.ReactNode }).children);
    }
    return '';
  };

  const handleCopy = async () => {
    const codeText = extractText(children).replace(/\n$/, '');
    await navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="my-3.5 rounded-[var(--radius-md)] overflow-hidden border border-[var(--border)] bg-[var(--code-bg)] max-w-full">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[var(--code-header-bg)] border-b border-[var(--border)]">
        <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
          {language}
        </span>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setWrapped((v) => !v)}
            aria-label={wrapped ? 'Disable line wrapping' : 'Wrap code lines'}
            aria-pressed={wrapped}
            className={`inline-flex items-center gap-1 text-[11px] transition-colors ${
              wrapped ? 'text-[var(--text)] font-medium' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <WrapText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{wrapped ? 'Wrapped' : 'Wrap'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleCopy()}
            aria-label="Copy code block"
            className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="copied"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.14 }}
                  className="inline-flex items-center gap-1 text-[var(--text)]"
                >
                  <Check className="w-3.5 h-3.5" />
                  Copied
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.14 }}
                  className="inline-flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      <pre
        className={`p-3.5 text-[13px] leading-relaxed m-0 ${
          wrapped ? 'whitespace-pre-wrap break-words overflow-x-hidden' : 'overflow-x-auto'
        }`}
      >
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
};

const SafeLink: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement>> = ({
  href,
  children,
  ...props
}) => {
  const isSafeProtocol =
    typeof href === 'string' &&
    (href.startsWith('http://') ||
      href.startsWith('https://') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:'));

  const isInert = !href || !isSafeProtocol || href === '#' || href.trim() === '';

  if (isInert) {
    return (
      <span
        role="link"
        aria-disabled="true"
        className="underline cursor-default text-[var(--accent)] select-text"
      >
        {children}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="underline text-[var(--accent)] hover:opacity-80 transition-opacity"
      {...props}
    >
      {children}
    </a>
  );
};

export const volqSanitizeSchema: Options = {
  tagNames: [
    'p',
    'br',
    'hr',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'del',
    'ins',
    'mark',
    'small',
    'sub',
    'sup',
    'span',
    'code',
    'kbd',
    'abbr',
    'a',
    'ul',
    'ol',
    'li',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'pre',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'details',
    'summary',
  ],
  attributes: {
    a: ['href', 'title', 'target', 'rel'],
    abbr: ['title'],
    th: ['colSpan', 'rowSpan', 'align'],
    td: ['colSpan', 'rowSpan', 'align'],
    ol: ['start'],
    details: ['open'],
    code: ['className'],
  },
  protocols: {
    href: ['http', 'https', 'mailto', 'tel'],
  },
  strip: [
    'script',
    'style',
    'iframe',
    'frame',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'link',
    'meta',
    'base',
    'svg',
    'math',
    'video',
    'audio',
    'img',
  ],
};

export function preprocessAssistantContent(raw: string, isStreaming?: boolean): string {
  if (!raw) return '';

  // 1. Convert or drop unknown citation tags before sanitizing
  let text = raw
    .replace(/<citation(?:\s+[^>]*)?>(.*?)<\/citation>/gi, '$1')
    .replace(/<citation(?:\s+[^>]*)?\/>/gi, '');

  // 2. Buffer incomplete tail tags during streaming so `<stro` never flashes
  if (isStreaming) {
    const lastLt = text.lastIndexOf('<');
    if (lastLt !== -1) {
      const tail = text.slice(lastLt);
      if (!tail.includes('>')) {
        text = text.slice(0, lastLt);
      }
    }
  }

  return text;
}

interface ErrorBoundaryProps {
  fallbackText: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class MarkdownErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Markdown rendering error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="whitespace-pre-wrap break-words text-[15px]">
          {this.props.fallbackText}
        </div>
      );
    }
    return this.props.children;
  }
}

export interface MarkdownContentProps {
  content: string;
  isStreaming?: boolean;
}

export const MarkdownContentInner: React.FC<MarkdownContentProps> = ({
  content,
  isStreaming = false,
}) => {
  const sanitizedContent = useMemo(
    () => preprocessAssistantContent(content, isStreaming),
    [content, isStreaming]
  );

  return (
    <MarkdownErrorBoundary fallbackText={content}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, volqSanitizeSchema], rehypeHighlight]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => (
            <CodeBlock className={className}>{children}</CodeBlock>
          ),
          a: SafeLink,
        }}
      >
        {sanitizedContent}
      </ReactMarkdown>
    </MarkdownErrorBoundary>
  );
};

export const MarkdownContent = React.memo(MarkdownContentInner);
export default MarkdownContent;
