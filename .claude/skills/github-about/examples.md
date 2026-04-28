# GitHub About — Examples

## Trigger Phrases

- `/github-about`
- "update my repo about section"
- "update the github about"
- "update github about section"
- "set github description and topics"
- "add topics to my github repo"
- "set the live site url"
- "update repo metadata"
- "update the repo description"
- "set up the github repo"
- "polish my github repo"
- "update about"

## Example 1: Static HTML Game Project

**Project:** An escape room game with HTML/CSS/JS

**Input:**
```
/github-about
```

**Output:**
```
=== GitHub About Updated ===

Repository: alfredang/escaperooms

Description: AI-powered escape room game with interactive puzzles, hint system, and leaderboards
Homepage:    https://alfredang.github.io/escaperooms/
Topics:      javascript, css, html, game, escape-room, github-pages (added 6 new)

View: https://github.com/alfredang/escaperooms
```

## Example 2: React + Vite + Vercel Project

**Project:** A React dashboard deployed on Vercel

**Input:**
```
update my repo about section
```

**Output:**
```
=== GitHub About Updated ===

Repository: alfredang/analytics-dashboard

Description: Real-time analytics dashboard with charts, filters, and CSV export
Homepage:    https://analytics-dashboard.vercel.app
Topics:      typescript, react, vite, tailwindcss, vercel, web-app, dashboard (added 7 new)

View: https://github.com/alfredang/analytics-dashboard
```

## Example 3: Python CLI Tool

**Project:** A Python command-line tool

**Input:**
```
set the github description and topics
```

**Output:**
```
=== GitHub About Updated ===

Repository: alfredang/file-organizer

Description: CLI tool to automatically organize files by type, date, or custom rules
Homepage:    Already set (skipped)
Topics:      python, cli, command-line, developer-tools, automation (added 5 new)

View: https://github.com/alfredang/file-organizer
```

## Example 4: Already Configured Repo

**Project:** A repo with description and topics already set

**Input:**
```
/github-about
```

**Output:**
```
=== GitHub About Updated ===

Repository: alfredang/my-project

Description: Already set (skipped)
Homepage:    https://my-project.vercel.app (updated)
Topics:      Already set (skipped)

View: https://github.com/alfredang/my-project
```

## Example 5: Invoked via `/github-push`

**The `/github-about` skill runs automatically as part of `/github-push`:**

```
Security scan complete: No secrets detected.
Proceeding with push...

[main abc1234] feat: add user authentication
  5 files changed, 120 insertions(+)

Pushed to origin/main.

=== GitHub About Updated ===

Repository: alfredang/my-app

Description: Full-stack web app with user auth, dashboards, and real-time notifications
Homepage:    https://my-app.vercel.app
Topics:      typescript, nextjs, react, supabase, tailwindcss, vercel (added 6 new)

View: https://github.com/alfredang/my-app
```
