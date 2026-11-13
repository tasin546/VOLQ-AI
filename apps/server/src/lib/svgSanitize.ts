import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);

export class SvgSanitizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SvgSanitizationError';
  }
}

export function sanitizeSvg(rawSvg: string): string {
  const trimmed = rawSvg.trim();
  if (!/<svg[\s>]/i.test(trimmed)) {
    throw new SvgSanitizationError('Uploaded SVG does not contain a valid <svg> element');
  }

  // Strip event handlers & dangerous tags via DOMPurify SVG profile
  const clean = DOMPurify.sanitize(trimmed, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed', 'link', 'meta'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onanimationstart'],
  });

  // Parse sanitized SVG DOM to strip external href/xlink:href/src URLs
  const dom = new JSDOM(clean, { contentType: 'image/svg+xml' });
  const doc = dom.window.document;
  const svgEl = doc.querySelector('svg');
  if (!svgEl) {
    throw new SvgSanitizationError('SVG became empty after sanitization');
  }

  const allElements = doc.querySelectorAll('*');
  for (const el of allElements) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const val = attr.value.trim();

      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }

      if (name === 'href' || name === 'xlink:href' || name === 'src') {
        if (!val.startsWith('#')) {
          el.removeAttribute(attr.name);
        }
      }

      if (name === 'style' && /url\s*\(|expression\s*\(|javascript:/i.test(val)) {
        el.removeAttribute(attr.name);
      }
    }
  }

  return svgEl.outerHTML;
}
