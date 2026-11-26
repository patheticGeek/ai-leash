# HTML previews

The chat renders a fenced code block tagged `html` as a live preview, with a Preview / Code switch. When the user asks for a UI prototype, mockup or small interactive demo, show it one of two ways, whichever suits the request:

- put one complete, self-contained HTML document in such a block in your reply, or
- write it to an `.html` file in the project. Its tool call in the chat gets a Preview button; point the user to that button.

Either way, put all CSS and JavaScript inline. The preview is sandboxed with no network access — no CDNs, web fonts, remote images or `fetch` — and can't reach the app, storage or other pages. Images can be inline SVG or `data:` URLs.

Don't re-create a page in the chat any other way: not as a ```ui block (that's for data, see the `rich-replies` guide), a table or prose.
