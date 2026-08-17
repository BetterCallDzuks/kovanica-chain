---
name: ai-to-obsidian
description: Document work from Claude app, Grok, Hostinger VPS, phone, and Notion into Obsidian. Fully integrates all 3 — Dataview queries and cache, Obsidian Git auto-sync and version control, Syncthing live file sync — plus multi-device and Notion bridge. Use for logging AI sessions, VPS tasks, saving outputs, or vault sync. Triggers include document to obsidian, log AI work, save session, hostinger notes, dataview, sync notes, syncthing, git conflict, git sync, automate git, claude, notion, phone.
---

# Ai To Obsidian

## Overview

Produce Obsidian-compatible markdown notes that capture AI model outputs (Claude app, Grok, Codex, Gemini) and Hostinger VPS activity. Fully integrates all 3: Dataview (queries + cache), Obsidian Git (auto sync + version control), and Syncthing (live file sync across VPS, desktop, phone). Supports Notion as secondary store.

## Instructions

Always structure notes for Obsidian vaults:

- Use YAML frontmatter with date, tags, source (claude|grok|codex|gemini|hostinger-vps|notion|phone), project.
- Prefer bidirectional links [[Note Title]] and tags #ai #session #vps #phone.
- Separate sections: Prompt / Input, Response / Output, Actions Taken, Next Steps.
- For multi-model or multi-device work, create one note per session or daily note with embeds.

### Documenting AI sessions (Claude app + Grok)

1. Capture exact model/app used (Claude app / Grok) and timestamp.
2. Record user prompt and key context.
3. Summarize or quote final output.
4. Note any tools, files, or code produced.
5. Link related notes.
6. Source field: `claude` or `grok`.

### Multi-device (phone + VPS + desktop)

- Syncthing keeps the same vault folder live on phone (Obsidian mobile), desktop, and Hostinger VPS.
- On phone: install Obsidian + Syncthing app, add the same Device ID and shared folder.
- Prefer editing on one device at a time to reduce conflicts.
- After phone edits: wait for Syncthing “Up to Date”, then Git will pick up changes on next auto-commit.

### Hostinger VPS setup

Deploy Obsidian on Hostinger VPS via Docker template:

1. Go to hostinger.com/vps/docker → Obsidian → Deploy on chosen KVM plan (min 2 GB RAM recommended).
2. In hPanel Docker Manager note the access URL and port.
3. Install Syncthing + Obsidian Git for vault sync.
4. Document all setup commands and credentials locations (never store secrets in notes).

SSH only when user supplies IP + key/password. Log every VPS change as:

- `command` → result

### Notion bridge

When Notion is connected:

- After creating an Obsidian note, optionally mirror a short summary or the full note into a Notion page/database.
- Use source: notion when the original content came from Notion.
- Keep Obsidian as primary; Notion as searchable backup or team view.
- Frontmatter can include `notion-id` if useful.

### Dataview plugin usage

Require Dataview community plugin.

Core usage and optimized queries remain the same (see previous sections). Always force refresh after Syncthing or Git activity, especially after phone edits.

### Obsidian Git sync guide + automation

Primary version control. Auto-commit/push as before. Works across all devices once Syncthing has delivered the files.

Use `scripts/auto-git-sync.sh` on VPS via cron.

### Syncthing detailed config

Same as before, plus phone:

- Install Syncthing on Android/iOS.
- Add VPS and desktop Device IDs.
- Share the exact vault folder.
- Use the ignore list from `scripts/syncthing-ignore.txt`.

### End-to-end automation (all 3)

How to activate: say “document this”, “log session”, “sync notes”, “do all 3”, or mention Claude / phone / Notion.

Recommended combined workflow:

1. Capture from Claude app, Grok, phone, or VPS → write Obsidian note.
2. Syncthing instantly propagates to VPS + phone + desktop.
3. Obsidian Git auto-commits + pushes.
4. Force Dataview refresh.
5. Optionally mirror summary to Notion.
6. Daily health: Syncthing “Up to Date” on all devices, Git clean, Dataview current.

Resources:
- `scripts/auto-git-sync.sh` — cron-ready Git auto commit/push
- `scripts/syncthing-ignore.txt` — recommended ignore patterns
- `references/dataview-examples.md` — common queries + cache clear

### Note template

```markdown
---
date: YYYY-MM-DD
tags: [ai, session, model-name]
source: claude|grok|codex|gemini|hostinger-vps|notion|phone
project: 
---

# Session Title

## Context
...

## Input
...

## Output
...

## VPS / Phone Actions (if any)
- command: result

## Links
- [[Related Note]]
```

### Delivery

- Write ready-to-paste markdown.
- Prefer Obsidian Git push when available.
- Advise user to verify Syncthing status on phone/VPS and clear Dataview cache after write.
- Optionally push summary to Notion if requested.
- Keep notes concise; split long sessions into multiple linked notes.
- Do not invent credentials or assume VPS/phone access.
