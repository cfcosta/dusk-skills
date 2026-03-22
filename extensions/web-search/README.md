# web-search extension

Registers a `web_search` tool backed directly by the Kagi Search API, plus a `/web-search` command that executes the same search path directly and prints results without going through the agent.

## Behavior

- searches the web through Kagi
- optionally fetches and extracts readable page content from returned result URLs
- returns structured details plus plain-text output for the model

## Configuration

Set `KAGI_API_KEY` in the environment.

If `KAGI_API_KEY` is missing, the extension does not register `web_search` or `/web-search` at all.

The tool performs the Kagi request itself instead of shelling out to a separate search CLI.
