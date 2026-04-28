# Examples

## Trigger Phrases

- `/github-page`
- "deploy to github pages"
- "set up github pages"
- "host my site on github pages"
- "deploy my react app to github pages"
- "enable github pages for this repo"

## Example Prompts

### Static HTML Site
```
User: /github-page

Claude: I'll help you deploy to GitHub Pages!

Pre-flight checks:
- GitHub CLI: OK
- Authentication: OK
- Remote: github.com/user/my-site

Detected: Static HTML site (index.html found in root)
No build step needed.

Creating .github/workflows/deploy-pages.yml...
Committing and pushing workflow...
Enabling GitHub Pages (source: GitHub Actions)...
Enabling workflow...

=== GitHub Pages Deployment ===

Workflow: deploy-pages.yml (created)
GitHub Pages: ENABLED
GitHub Actions: ENABLED

Your site will be live at: https://user.github.io/my-site/
Check progress: https://github.com/user/my-site/actions
```

### React + Vite Project
```
User: deploy my react app to github pages

Claude: I'll help you deploy to GitHub Pages!

Pre-flight checks:
- GitHub CLI: OK
- Authentication: OK
- Remote: github.com/user/react-app

Detected: Vite project (vite.config.ts found)
Build command: npm ci && npm run build
Output directory: ./dist
Node.js version: 20

NOTE: Setting base in vite.config.ts to '/react-app/' for correct asset paths.

Creating .github/workflows/deploy-pages.yml...
Committing and pushing workflow...
Enabling GitHub Pages (source: GitHub Actions)...
Triggering first deployment...

=== GitHub Pages Deployment ===

Workflow: deploy-pages.yml (created)
GitHub Pages: ENABLED
GitHub Actions: ENABLED

Your site will be live at: https://user.github.io/react-app/
Check progress: https://github.com/user/react-app/actions
```

### Next.js Static Export
```
User: set up github pages for my next.js project

Claude: I'll help you deploy to GitHub Pages!

Pre-flight checks:
- GitHub CLI: OK
- Authentication: OK
- Remote: github.com/user/next-site

Detected: Next.js project (next.config.mjs found)
Build command: npm ci && npm run build
Output directory: ./out

NOTE: Ensure next.config.mjs has output: 'export' and basePath: '/next-site'
for static export to work with GitHub Pages.

Creating .github/workflows/deploy-pages.yml...
Committing and pushing workflow...
Enabling GitHub Pages (source: GitHub Actions)...
Triggering first deployment...

=== GitHub Pages Deployment ===

Workflow: deploy-pages.yml (created)
GitHub Pages: ENABLED
GitHub Actions: ENABLED

Your site will be live at: https://user.github.io/next-site/
Check progress: https://github.com/user/next-site/actions
```

### No GitHub Remote (Blocked)
```
User: deploy to github pages

Claude: I'll help you deploy to GitHub Pages!

Pre-flight checks:
- GitHub CLI: OK
- Authentication: OK
- Remote: ERROR

No GitHub remote found.
Add one with: git remote add origin https://github.com/USER/REPO.git
Then run /github-page again.
```

## Expected Output Format

### Successful Deployment
```
Pre-flight: PASSED
Project type: <type>
Workflow: CREATED (.github/workflows/deploy-pages.yml)
GitHub Pages: ENABLED (source: GitHub Actions)
GitHub Actions: ENABLED
Pages URL: https://<OWNER>.github.io/<REPO>/
Status: Deploying...
```

### Blocked
```
Pre-flight: FAILED
Reason: <missing gh CLI / no remote / not authenticated>
Fix: <remediation steps>
```
