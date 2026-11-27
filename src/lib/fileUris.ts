// The local paths in a clipboard's `file://` URIs: `text/uri-list` (files
// copied in a file manager), or plain text that's nothing but such URIs
// (GNOME's copied-files text starts with a "copy"/"cut" line). Empty if the
// text is anything else, so ordinary pasted text is left alone.
export function filePathsIn(uriList: string, plain: string): string[] {
  const fromLines = (text: string, allowVerb: boolean) => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    const body =
      allowVerb && (lines[0] === "copy" || lines[0] === "cut")
        ? lines.slice(1)
        : lines;
    if (body.length === 0 || !body.every((l) => l.startsWith("file://"))) {
      return [];
    }
    return body.map((uri) => {
      const path = decodeURIComponent(new URL(uri).pathname);
      // file:///C:/x on Windows.
      return /^\/[A-Za-z]:/.test(path) ? path.slice(1) : path;
    });
  };
  const listed = fromLines(uriList, false);
  return listed.length > 0 ? listed : fromLines(plain, true);
}
