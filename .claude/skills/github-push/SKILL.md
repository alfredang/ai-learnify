---
name: GitHub Push
description: Secure git push with automatic secret detection, README generation, and repository setup. Scans for secrets, auto-generates README, configures repo description/topics/discussions, and pushes to GitHub.
---

# GitHub Push

## Command
`/github-push` or `github-push`

## Navigate
Git & Security

## Keywords
github push, git push, secret detection, api key scan, credential scan, security check, push to github, commit and push, secret scanner, readme generator, safe push, secure push, pre-push hook, leak detection, api key exposed, password exposed

## Description
Securely push code to GitHub by automatically scanning for exposed secrets, API keys, and credentials. Auto-generates README.md if missing, configures repo description, live site URL, topics, and enables GitHub Discussions.

## Execution
This skill runs using **Claude Code with subscription plan**. Do NOT use pay-as-you-go API keys. All AI operations should be executed through the Claude Code CLI environment with an active subscription.

## Response
I'll help you securely push to GitHub!

The workflow includes:

| Step | Description |
|------|-------------|
| **Secret Scan** | Detect exposed API keys, passwords, and credentials |
| **File Review** | Check for sensitive files that shouldn't be committed |
| **README Gen** | Auto-generate README.md via `/create_github_readme` skill if missing |
| **Git Commit** | Stage and commit with AI-generated message |
| **Push** | Push to remote repository |
| **PR Create** | Optionally create a pull request |
| **Repo About** | Auto-invoke `/github-about` to set description, live site URL, and topics |

## Instructions

When executing `/github_push`, follow this workflow:

### Phase 1: Secret Detection (MANDATORY)

Before ANY git operations, scan the codebase for exposed secrets. This is a **blocking requirement** - do not proceed if secrets are found.

#### 1.1 Scan Staged Files
```bash
git diff --cached --name-only
```

#### 1.2 Secret Pattern Detection

Scan ALL staged files for these patterns:

**AWS Credentials**
```regex
AKIA[0-9A-Z]{16}
aws_access_key_id\s*=\s*['"][A-Za-z0-9/+=]+['"]
aws_secret_access_key\s*=\s*['"][A-Za-z0-9/+=]+['"]
```

**API Keys (Generic)**
```regex
api[_-]?key\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]
apikey\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]
api[_-]?secret\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]
```

**Private Keys**
```regex
-----BEGIN (RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----
-----BEGIN PRIVATE KEY-----
```

**Database Connection Strings**
```regex
postgres(ql)?://[^\s'"]+
mysql://[^\s'"]+
mongodb(\+srv)?://[^\s'"]+
redis://[^\s'"]+
```

**OAuth & Bearer Tokens**
```regex
bearer\s+[A-Za-z0-9\-_.~+/]+=*
oauth[_-]?token\s*[:=]\s*['"][A-Za-z0-9_\-]+['"]
access[_-]?token\s*[:=]\s*['"][A-Za-z0-9_\-]+['"]
refresh[_-]?token\s*[:=]\s*['"][A-Za-z0-9_\-]+['"]
```

**Cloud Provider Secrets**
```regex
# Google Cloud
AIza[0-9A-Za-z\-_]{35}

# Azure
[a-zA-Z0-9+/]{86}==

# Heroku
[hH]eroku.*[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}

# Stripe
sk_live_[0-9a-zA-Z]{24}
rk_live_[0-9a-zA-Z]{24}
pk_live_[0-9a-zA-Z]{24}

# Twilio
SK[0-9a-fA-F]{32}

# SendGrid
SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}

# Slack
xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*

# GitHub
gh[pousr]_[A-Za-z0-9_]{36,}

# OpenAI
sk-[A-Za-z0-9]{48}

# Anthropic
sk-ant-[A-Za-z0-9\-_]{90,}
```

**Generic Secrets**
```regex
password\s*[:=]\s*['"][^'"]{8,}['"]
secret\s*[:=]\s*['"][^'"]{8,}['"]
credential\s*[:=]\s*['"][^'"]{8,}['"]
private[_-]?key\s*[:=]\s*['"][^'"]+['"]
```

**JWT Tokens**
```regex
eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*
```

#### 1.3 Check for Sensitive Files

**Files that should NEVER be committed:**
- `.env`, `.env.*` (environment files)
- `*.pem`, `*.key`, `*.p12`, `*.pfx` (certificates/keys)
- `credentials.json`, `secrets.json`, `config.secret.*`
- `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519` (SSH keys)
- `*.keystore`, `*.jks` (Java keystores)
- `.htpasswd`, `.netrc`, `.npmrc` (auth files)
- `wp-config.php` (WordPress config)
- `database.yml` with credentials
- `settings.py` with SECRET_KEY

**IMPORTANT: Never store secrets in config files!**

Secrets should NEVER be hardcoded in configuration files like:
- `config.json`, `config.yaml`, `config.toml`
- `settings.json`, `settings.py`, `settings.js`
- `app.config.js`, `next.config.js`, `vite.config.ts`
- Any file that gets committed to version control

**Where to store secrets instead:**
- `.env` files (must be in `.gitignore`)
- `uv` secret files for Python projects (`uv` supports `.env` loading)
- Platform secret managers (Vercel, Railway, Fly.io environment variables)
- Cloud secret managers (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault)

**Verify .gitignore includes:**
```bash
grep -E "^\.env|^\.env\.|\.pem$|\.key$|credentials|secrets" .gitignore
```

#### 1.4 Secret Detection Results

**If secrets are found:**
1. **STOP** - Do not proceed with push
2. List all detected secrets with file:line locations
3. Provide remediation steps:
   - Remove the secret from the file
   - Move secrets to `.env` file (ensure `.env` is in `.gitignore`)
   - For Python/uv projects, use `.env` with `uv run` which auto-loads environment variables
   - Use `process.env.SECRET_NAME` (Node.js) or `os.environ["SECRET_NAME"]` (Python)
   - NEVER store secrets in config files (config.json, settings.py, etc.)
   - Add sensitive files to .gitignore
   - If already committed, guide through history rewrite

**Example output when secrets found:**
```
SECURITY ALERT: Secrets detected in staged files!

File: src/config.js:15
  Type: API Key
  Pattern: api_key = "sk-abc123..."

File: .env:3
  Type: Database URL
  Pattern: DATABASE_URL=postgres://user:password@...

BLOCKED: Cannot push until secrets are removed.

Remediation:
1. Remove secrets from config files (NEVER store secrets in config files!)
2. Move secrets to .env file (ensure .env is in .gitignore)
3. For Python/uv: use .env file - uv run auto-loads environment variables
4. Access via: process.env.API_KEY (Node.js) or os.environ["API_KEY"] (Python)
5. Run: git reset HEAD <file> to unstage
```

**If NO secrets found:**
```
Security scan complete: No secrets detected.
Proceeding with push...
```

### Phase 2: README Generation

Check if a `README.md` exists in the project root:

```bash
ls README.md 2>/dev/null
```

**If no README.md exists:**
1. Invoke the `/create_github_readme` skill to generate a professional README
2. The readme skill will auto-capture screenshots, add badges, tech stack, architecture diagrams, and more
3. After the skill completes, stage the generated `README.md` (and `screenshot.png` if created)

**If README.md already exists:**
- Skip this phase unless the user explicitly requests README regeneration

### Phase 3: Git Operations

#### 3.1 Check Status
```bash
git status
git diff --cached --stat
```

#### 3.2 Stage Files
If files need staging:
```bash
git add <specific-files>
```

**Important:** Never use `git add -A` or `git add .` - always add specific files to avoid accidentally committing sensitive files.

#### 3.3 Generate Commit Message
Based on the changes:
- Analyze what files were modified
- Understand the nature of changes (feature, fix, refactor, docs, etc.)
- Generate a concise commit message following conventional commits:
  - `feat:` new feature
  - `fix:` bug fix
  - `docs:` documentation
  - `refactor:` code refactoring
  - `test:` tests
  - `chore:` maintenance

#### 3.4 Commit
```bash
git commit -m "$(cat <<'EOF'
<type>: <description>

<optional body>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

#### 3.5 Push
```bash
git push origin <branch>
```

If push fails due to upstream changes:
```bash
git pull --rebase origin <branch>
git push origin <branch>
```

### Phase 4: Pull Request (Optional)

If user requests PR creation:

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
- Change 1
- Change 2

## Test Plan
- [ ] Test 1
- [ ] Test 2

---
Generated with [Claude Code](https://claude.ai/code)
EOF
)"
```

### Phase 5: Repository About (Auto-invoke `/github-about`)

After pushing, automatically run the `/github-about` skill to update the repo's About section.

The `/github-about` skill will:
1. **Description** — Analyze the codebase and set a compelling repo description (if not already set)
2. **Live Site URL** — Detect deployment URLs (Vercel, GitHub Pages, Netlify, etc.) and set the homepage
3. **Topics** — Analyze tech stack (languages, frameworks, platforms) and add relevant topics

Simply invoke `/github-about` — it handles authentication, detection, and updates automatically.

#### 5.4 Enable Discussions

After `/github-about` completes, also enable discussions if not already enabled:

```bash
gh repo view --json hasDiscussionsEnabled
```

**If discussions are NOT enabled:**
```bash
gh repo edit --enable-discussions
```

## Capabilities

- Scan for 20+ types of exposed secrets and credentials
- Detect sensitive files that shouldn't be committed
- Auto-generate professional README.md via `/create_github_readme` skill
- Create AI-powered commit messages
- Push to GitHub with safety checks
- Create pull requests with descriptions
- Auto-invoke `/github-about` to set repo description, live site URL, and topics
- Auto-enable GitHub Discussions
- Support for all git workflows (feature branches, main)

## Security Patterns Detected

| Category | Examples |
|----------|----------|
| **Cloud Credentials** | AWS, GCP, Azure, Heroku |
| **API Keys** | OpenAI, Anthropic, Stripe, Twilio, SendGrid |
| **Auth Tokens** | OAuth, Bearer, JWT, Session tokens |
| **Database URLs** | PostgreSQL, MySQL, MongoDB, Redis |
| **Private Keys** | RSA, DSA, EC, SSH, PGP |
| **Platform Tokens** | GitHub, Slack, Discord webhooks |
| **Generic Secrets** | Passwords, credentials, secrets in code |

## Next Steps

After running `/github_push`:
1. Verify the push succeeded on GitHub
2. Check Actions for CI/CD status
3. Review the generated README
4. Verify repo description, topics, and live site URL on GitHub
5. Check that Discussions are enabled and categories are set up
6. Share PR link if created
7. Monitor for any security alerts from GitHub
