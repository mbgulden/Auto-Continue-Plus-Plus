# OpenClaw Architecture & System Design

This document captures the known architectural components and constraints of the OpenClaw agent based on current intelligence.

## Core Component Structure
1. **Main Engine (`openclaw/openclaw`):** The central execution loop that interfaces with various LLMs to decompose and execute tasks.
2. **Skill Registry (`openclaw/clawhub`):** A decoupled repository of plugins and skills that the main engine can pull from.
3. **Transport/Interface Layer:** Interfaces are modularized to connect to WebSockets/Webhooks for Discord, Telegram, and WhatsApp, decoupling the UI from the agent logic.

## Security Constraints & Lessons Learned
A major architectural event in OpenClaw's history was the discovery of the **"ClawJacked"** vulnerability in February 2026.
- **The Flaw:** Permitted hackers to hijack the AI assistant through malicious links.
- **Architectural Lesson:** When agents process uncontrollable external inputs (like browsing arbitrary user-provided links), they are susceptible to prompt injection or command execution hijacking.
- **Requirement:** Any architecture mimicking OpenClaw *must* implement robust sandboxing, strict input sanitization, and potentially "Safe Mode" isolated execution contexts for external web navigation.

## Evolution
- Originally named "Clawdbot," then "Moltbot," before settling on "OpenClaw."
- Currently transitioning to an independent open-source foundation supported by OpenAI (as creator Peter Steinberger leads OpenAI's personal agents division).
