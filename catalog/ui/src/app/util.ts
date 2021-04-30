// Use asciidoctor to translate descriptions
import * as AsciiDoctor from 'asciidoctor';
const asciidoctor = AsciiDoctor();

// Use dompurify to make asciidoctor output safe
import dompurify from 'dompurify';
// Force all links to target new window and not pass unsafe attributes
dompurify.addHook('afterSanitizeAttributes', function(node) {
  if (node.tagName == 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function renderAsciiDoc(asciidoc: string, options?: object): string {
  const sanitize_opt = {
    ADD_TAGS: [],
    ADD_ATTR: [],
  };
  if (options && options.allowIFrame) {
    sanitize_opt.ADD_TAGS.push('iframe');
    sanitize_opt.ADD_ATTR.push('allowfullscreen', 'frameborder');
  }
  return dompurify.sanitize(asciidoctor.convert(asciidoc), sanitize_opt);
}
