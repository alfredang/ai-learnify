# Examples

## Trigger Phrases

- `/github-push`
- "push to github"
- "commit and push safely"
- "push my changes with secret scan"
- "secure push to github"
- "push to github and generate readme"

## Example Prompts

### Basic Push with Secret Scan
```
User: /github-push

Claude: I'll help you securely push to GitHub!

First, let me scan for any exposed secrets...

Scanning staged files:
- src/app.js
- src/config.js
- package.json

Security scan complete: No secrets detected.

Now let me commit and push your changes...

Commit: feat: add user authentication module
Push: Successfully pushed to origin/main
```

### Push with Secrets Found (Blocked)
```
User: push to github

Claude: I'll help you securely push to GitHub!

First, let me scan for any exposed secrets...

SECURITY ALERT: Secrets detected in staged files!

File: src/config.js:15
  Type: API Key
  Pattern: OPENAI_API_KEY = "sk-abc123..."

File: .env:3
  Type: Database URL
  Pattern: DATABASE_URL=postgres://user:password@...

BLOCKED: Cannot push until secrets are removed.

Remediation:
1. Remove secrets from src/config.js
2. Move credentials to environment variables
3. Add .env to .gitignore
4. Run: git reset HEAD .env
```

### Push with README Generation
```
User: push to github and create a readme

Claude: I'll help you push to GitHub with a new README!

1. Security scan: No secrets detected
2. Generating README.md...

Created README.md with:
- Project header with badges
- Feature list
- Tech stack table
- Getting started guide
- Contributing guidelines

3. Committing changes...
   - README.md (new)
   - src/app.js (modified)

Commit: docs: add comprehensive README.md
Push: Successfully pushed to origin/main
```

### Push with Pull Request
```
User: push my feature branch and create a pr

Claude: I'll push your feature branch and create a PR!

1. Security scan: No secrets detected
2. Pushing to origin/feature/user-auth...
3. Creating pull request...

PR #42 created: "feat: Add user authentication"
URL: https://github.com/user/repo/pull/42
```

## Expected Output Format

### Successful Push
```
Security scan: PASSED (no secrets detected)
Commit: <type>: <message>
Push: origin/<branch>
Status: SUCCESS
```

### Blocked Push
```
Security scan: FAILED
Secrets found: <count>
Files affected: <list>
Status: BLOCKED
Remediation: <steps>
```
