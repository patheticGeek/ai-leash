// The `srcdoc` an HTML preview's frame gets: the agent's HTML with a CSP and
// a small bootstrap script in front. Kept apart from `HtmlPreview.tsx` (no
// React) so the sandbox can be exercised on its own. The why of each piece
// is in `HtmlPreview.tsx`'s header and docs/features/agent-chat.md.

const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/** The `postMessage` key the injected script reports the height under. */
export const HEIGHT_KEY = "alHtmlPreviewHeight";
/** Posted once each time the bootstrap starts: a frame `load` with no boot
 * before it is a page the frame navigated to, not this document. */
export const BOOT_KEY = "alHtmlPreviewBoot";

// Runs before any of the agent's own scripts. Height: the larger of the
// root's box and the body's bottom edge (plus its margin), so content that
// shrinks lets the frame shrink too.
const BOOTSTRAP = `(function(){
parent.postMessage({${BOOT_KEY}:1},"*");
var last=-1;
function measure(){
  var de=document.documentElement,b=document.body;
  var h=de.getBoundingClientRect().height;
  if(b){
    var r=b.getBoundingClientRect();
    var m=parseFloat(getComputedStyle(b).marginBottom)||0;
    h=Math.max(h,r.bottom+m+window.scrollY);
  }
  h=Math.ceil(h);
  if(h!==last){last=h;parent.postMessage({${HEIGHT_KEY}:h},"*");}
}
var ro=new ResizeObserver(measure);
ro.observe(document.documentElement);
document.addEventListener("DOMContentLoaded",function(){
  if(document.body)ro.observe(document.body);
  measure();
});
addEventListener("load",measure);
document.addEventListener("click",function(e){
  var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;
  if(a&&!/^#/.test(a.getAttribute("href")||""))e.preventDefault();
},true);
})();`;

const HEAD = [
  `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
  `<meta name="color-scheme" content="light">`,
  `<script>${BOOTSTRAP}</script>`,
].join("");

/** The `srcdoc` for `html`: the CSP and bootstrap script go first — after a
 * leading doctype, so the page keeps standards mode; the parser hoists them
 * into the head the page's own `<html>`/`<head>` tags then merge into. */
export function buildPreviewDocument(html: string): string {
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (!doctype) return HEAD + html;
  const end = doctype[0].length;
  return html.slice(0, end) + HEAD + html.slice(end);
}

/** Whether `html` is a whole page rather than a snippet — a ```html block
 * that is one opens on its preview, a snippet on its code. */
export function isHtmlDocument(html: string): boolean {
  return /<!doctype html|<html[\s>]|<body[\s>]/i.test(html);
}
