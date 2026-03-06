---
trigger: always_on
---

# Workspace Rules
## Coding Standards
* **Editing Config, .yml, .env and all code files:** All edits **must** be **Full File Edits**. No partial edits to files are allowed. This is **Extremely Important** to reduce file corruption.
* **File Size Constraint:** ALL files must be less than 400 lines (ideally below 280 lines). Optimize the files and keep them organized. Refactor into multiple files if necessary. Exceptions can be made for special files, documentation, task lists, .md docs and non-code or config files.
* **Strict Typing:** Enforce strict typing. Use `TypeScript` interfaces/types for all variables and function signatures.
* **Documentation:** Add JSDoc/Docstrings to all exported functions. Explain *why* the logic exists, not just *what* it does.
* **Error Handling:** NO empty `catch` blocks. All errors must be logged with context or handled gracefully.
* **Testing:** Every new feature **must** be accompanied by a corresponding unit test.
