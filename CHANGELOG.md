# Change Log

All notable changes to the "Auto-Continue Plus Plus" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.1.6] - 2026-03-10

### Fixed
- Fixed deployment script and deployed latest stable version for the Auto-Accept system.

## [1.1.5] - 2026-03-08

### Added
- Improvements to CDP automation and task delegation stability.

## [1.1.4] - 2026-03-07

### Added
- Minor updates and auto-accept improvements.

## [1.1.3] - 2026-03-06

### Added
- **Human-Centric Context Handoff Logic**: Differentiates between AI and user driven actions to provide a graceful handoff experience. Stops the system from forcefully wiping context during human idle time and replaces aggressive toasts with polite reminders.
- **Language Server Process Scanner API Hack**: Discovers the local language server process, port, and security token. Connects securely to the Antigravity backend API port.
- **True Dashboard Metrics via API**: Switched Power User Dashboard budget projection lines from guessed mathematics to hard budget Quota API scrapes using the hidden language server connection.
- **Adaptive Context Window Auto-Scaling**: The system now dynamically adjusts its Handoff thresholds depending on your active model limit (e.g. 120k vs 2M tokens).

## [1.1.2] - 2026-03-06

### Fixed
- Replaced failing native `antigravity.chat.new` command during Handoff with a highly stable CDP DOM injection click.
- Prevented aggressive Context Tracker interruptions while the user is actively typing a prompt by introducing an `isStable()` 10-second idle check.

## [1.1.1] - 2026-03-06

### Fixed
- Fixed issue displaying over 200MB of `.vsix` binaries tracked in local commit history preventing deployment.
- Hardened `.vscodeignore` and `.gitignore` file rules for future safe publishing.

## [1.1.0] - 2026-03-06

### Added
- Architected and implemented a "Hard Contract" Multi-Agent Swarm system for Auto-Continue Plus Plus.
- **SwarmLockManager**: Implemented Mutex file locking (`swarm_locks.json`) to prevent agent collisions.
- **ContractManager**: Implemented strict boundaries restricting agents to specific directories.
- **SwarmOrchestrator**: Added a new Swarm CLI tool and the ability to spawn parallel agents from a parsed megaprompt.
- Registered a new VS Code command `Auto-Continue Swarm: Spawn Delegates via Megaprompt`.

## [1.0.7] - 2026-03-06

### Added
- Rewrote the auto-accept loop to use Chromium DevTools Protocol (CDP) DOM scraping instead of VS Code commands.
- Guaranteed seamless auto-acceptance of Antigravity tasks even when the agent panel is backgrounded or minimized.
- Fixed stalling issues with `Alt+Enter` keybinding equivalents missing their target contexts.

## [1.0.6] - 2026-03-06

### Added
- Transformed Lineage Dashboard into a global **Power User Agent Manager**.
- Introduced `LineageManager` Global Conversation Heuristics to parse total machine Antigravity activity.
- Dynamically extracts titles, live progress bars, and idle times from AI brains.
- Live active workspaces (Heartbeats) visually separated into the Fleet pool.
- Included 1-click jump links directly into Antigravity target Brain folders.

## [1.0.6]

### Added
- Added `SyncEngine` and Background P2P Heartbeat sync to `ContextTracker.ts`.
- Moved Handoff Summary deletion protocol to a persistent archival system for branch lineage.

## [1.0.5] - 2026-03-06

## [1.0.4] - 2026-03-06

### Added
- Ensured physical deletion of obsolete extension folders (Auto Accept Agent, Gemini CLI Companion, etc.).
- Improved stability and clean-up processes.

## [1.0.3] - 2026-03-06

### Added
- Added force local/workspace brain sync command.
- Quality of life updates.

## [1.0.0] - Initial Release

### Added
- Initial release of Auto-Continue Plus Plus.
- Features powerful auto-accept loop for terminal commands.
- Implemented multi-tab agent tracking.
- Added watchdog system to recover stuck agents.
- Introduced `bannedCommands` setting to prevent dangerous operations.
- Dynamic token counting and max token limit config.
- Custom marketplace Gallery configuration.
