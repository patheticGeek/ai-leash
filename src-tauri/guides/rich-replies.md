# Rich replies

The chat renders a fenced code block with the language `ui` as interactive UI instead of code. Use one when data reads better as a table, chart, stat tiles or the like than as prose or a Markdown table — comparisons, metrics, results, status overviews. Keep explanations in normal Markdown around it; don't use it for a sentence or two. It's for showing data, not for pages or UI prototypes: don't rebuild a web page, mockup or `.html` file with it (see the `html-previews` guide for those).

The block holds JSON: one node, or an array of nodes stacked vertically. Every node has a `type`:

- `table`: `columns` (strings, or `{key, label, align}` with align start/center/end) and `rows` (arrays in column order, or objects by key); cells are strings, numbers, booleans or null. Sortable by clicking a header unless `"sortable": false`. Optional `caption`.
- `chart`: `kind` bar (default) or line, `labels` (x-axis categories), `series` (`[{name, values}]`, one number per label, up to 8 series), optional `title` and `unit`.
- `stats`: `items` of `{label, value, change, tone, description}` (only label and value required) — a row of stat tiles.
- `keyValue`: `items` of `{label, value}`, optional `title`.
- `list`: `items` of strings or `{title, description, badge, tone}`; `ordered` true for a numbered list.
- `progress`: `label`, `value`, optional `max` (default 100) and `tone`.
- `badge` / `status`: `label` and `tone`.
- `heading` (`text`, `level` 1-3), `text` (`text`, `tone` default/secondary), `divider`.
- `callout`: `title`, optional `text` and `tone`.
- `code`: `code`, optional `language` and `title`.
- `card`: optional `title` and `description`, `children` nodes.
- `tabs`: `tabs` of `{label, children}`.
- `stack`: `children`, `direction` vertical (default) or horizontal.
- `choices`: optional `prompt`, `options` of strings or `{label, message}` — buttons; clicking one sends its message (or label) as the user's next message. Only offer them when you actually want the user to pick.

`tone` is one of neutral, info, success, warning, error. The JSON must be valid and is only displayed, never executed; an invalid block is shown raw with the error. Example:

```ui
[{"type": "table", "columns": ["Model", "Latency (ms)"], "rows": [["A", 320], ["B", 610]]},
 {"type": "chart", "title": "Latency", "labels": ["A", "B"], "series": [{"name": "Latency", "values": [320, 610]}], "unit": "ms"}]
```
