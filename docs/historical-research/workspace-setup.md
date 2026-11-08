# Local workspace setup — 2026-11-07

- Active independent repository: `~/the scrabble bot for utd hacks`; local branch: `local/hackutd-engine`, with no remotes. Original audit checkout: `~/scrabblebot`, `hackutd/local-bot-upgrades`.
- Installed and enabled `context7@claude-plugins-official` using Codex's plugin
  command. Reviewed its three source files and remote server configuration.
  The generic skill scanner reported only an absent `SKILL.md`, expected for
  this MCP-only plugin; it found no scripts to execute.
- Its packaged client-tagged URL returned HTTP 401. The canonical public URL
  `https://mcp.context7.com/mcp` passed anonymous MCP initialization and listed
  `resolve-library-id` and `query-docs`. The repo config selects that endpoint
  and disables the packaged duplicate server. No credentials were added.
- Repo-local `.codex/config.toml` keeps GitHub and Context7 available and disables
  17 unrelated/overlapping plugin packs for this project. It inherits the user's
  selected model and reasoning setting. Other projects retain their plugin settings.
- Project configuration is loaded for trusted projects. Open a fresh Codex session
  in this checkout to load these overrides and the new MCP tools. The existing
  session continues with the already available tools. No token reduction has
  been measured or guaranteed; reducing irrelevant instructions and bounded tool
  output is the practical aim.
- The machine-specific `.codex/` directory is excluded by `.git/info/exclude`,
  so it will not be pushed with the eventual bot changes. Nothing was uninstalled
  and no global permission settings were changed.

Repo plugin scoping follows the [official Codex plugin configuration guidance](https://developers.openai.com/plugins/build/plugins#enable-or-disable-a-plugin-for-a-repo).
The design and reproducible baseline preserve context for continuation; read those
before rediscovering the code or expanding the plugin set.
