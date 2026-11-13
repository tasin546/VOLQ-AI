import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  MarkdownContentInner,
  preprocessAssistantContent,
} from '../components/chat/MarkdownContent';

describe('Item 1: Model Output HTML Rendering and Security Allowlist', () => {
  it('renders the exact screenshot string with formatted tags and inert link', () => {
    const input =
      '<p>This is a <strong>sample</strong> paragraph with <em>embedded</em> text, a <a href="#">link</a>, and <span>inline elements</span> to test.</p>';

    const html = ReactDOMServer.renderToStaticMarkup(
      <MarkdownContentInner content={input} />
    );

    // 1. Must contain formatted paragraph
    expect(html).toContain('<p>This is a ');
    // 2. Must contain strong tag
    expect(html).toContain('<strong>sample</strong>');
    // 3. Must contain em tag
    expect(html).toContain('<em>embedded</em>');
    // 4. Must contain span inline elements
    expect(html).toContain('<span>inline elements</span>');
    // 5. Must render <a href="#"> as an inert link span
    expect(html).toContain('role="link"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('link</span>');
    // Must NOT contain literal escaped tag strings like &lt;p&gt;
    expect(html).not.toContain('&lt;p&gt;');
    expect(html).not.toContain('&lt;strong&gt;');
  });

  it('renders valid external links with security attributes and blocks malicious protocols', () => {
    const input =
      '<a href="https://example.com/safe">Safe Link</a> and <a href="javascript:alert(1)">Evil Link</a> and <a href="data:text/html,evil">Data Link</a>';

    const html = ReactDOMServer.renderToStaticMarkup(
      <MarkdownContentInner content={input} />
    );

    // Safe link has rel and target="_blank"
    expect(html).toContain('href="https://example.com/safe"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');

    // javascript: and data: are stripped
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('data:text/html');
  });

  it('neutralizes an XSS corpus (scripts, event handlers, styles, iframes, svgs, forbidden tags)', () => {
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '<img src="invalid" onerror="alert(1)" />',
      '<iframe src="https://evil.com" srcdoc="<script>alert(1)</script>"></iframe>',
      '<svg><circle cx="50" cy="50" r="40" stroke="green" /><script>alert(1)</script></svg>',
      '<math><mi xlink:href="javascript:alert(1)">click</mi></math>',
      '<form action="https://evil.com"><input type="text" name="pw"/><button>Submit</button></form>',
      '<span class="spoof-class" id="spoof-id" style="color:red;position:fixed" data-secret="123" onclick="alert(1)">styled text</span>',
      '<details open><summary>Details</summary><p>Allowed collapsible content</p></details>',
    ].join('\n');

    const html = ReactDOMServer.renderToStaticMarkup(
      <MarkdownContentInner content={xssPayloads} />
    );

    // Stripped elements
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<math');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<button');

    // Stripped attributes
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('class="spoof-class"');
    expect(html).not.toContain('id="spoof-id"');
    expect(html).not.toContain('data-secret');

    // Allowed details/summary tag survives
    expect(html).toContain('<details open="">');
    expect(html).toContain('<summary>Details</summary>');
    expect(html).toContain('<p>Allowed collapsible content</p>');
  });

  it('keeps HTML inside code fences and inline backticks strictly literal', () => {
    const input = [
      '```html',
      '<p><strong>Inside code fence</strong> with <script>alert(1)</script></p>',
      '```',
      'And inline `<code><script>safe</script></code>`.',
    ].join('\n');

    const html = ReactDOMServer.renderToStaticMarkup(
      <MarkdownContentInner content={input} />
    );

    // Inside code fence, tags must be syntax-highlighted as code, NEVER executed or parsed as real DOM tags
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('hljs language-html');
    expect(html).toContain('<span class="hljs-name">p</span>');
    expect(html).toContain('<span class="hljs-name">script</span>');

    // Inline backticks also stay literal escaped text
    expect(html).toContain('&lt;code&gt;&lt;script&gt;safe&lt;/script&gt;&lt;/code&gt;');
  });

  it('buffers incomplete tail tags during streaming so partial tags do not flash', () => {
    const partialStream = '<p>Hello <strong>world</strong> <stro';
    const buffered = preprocessAssistantContent(partialStream, true);
    expect(buffered).toBe('<p>Hello <strong>world</strong> ');

    const completeStream = '<p>Hello <strong>world</strong> <strong>new</strong>';
    const notBuffered = preprocessAssistantContent(completeStream, true);
    expect(notBuffered).toBe(completeStream);
  });

  it('drops or converts unknown citation tags before sanitizing so they never display as raw text', () => {
    const input =
      'According to the manual <citation title="API Guide" id="doc-1">Reference 1</citation>, we should proceed.';
    const processed = preprocessAssistantContent(input, false);

    expect(processed).toBe('According to the manual Reference 1, we should proceed.');
    expect(processed).not.toContain('<citation');

    const html = ReactDOMServer.renderToStaticMarkup(
      <MarkdownContentInner content={input} />
    );
    expect(html).not.toContain('&lt;citation');
    expect(html).toContain('Reference 1');
  });
});
