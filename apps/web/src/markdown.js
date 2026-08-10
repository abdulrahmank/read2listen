import MarkdownIt from 'markdown-it';

/**
 * Renders assistant replies (Markdown) to HTML for the chat bubbles.
 *
 * html: false is the security boundary — any raw HTML in the content (from
 * the model or the documents it read) is escaped, not rendered, so there is
 * no injection surface and no separate sanitizer is needed. linkify turns
 * bare URLs into links; breaks keeps single newlines as <br> the way chat
 * output reads.
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});

// Open links in a new tab and strip referrer/opener.
const defaultLinkOpen = md.renderer.rules.link_open
  || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export function renderMarkdown(text) {
  return md.render(String(text ?? ''));
}
