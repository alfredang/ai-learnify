#!/usr/bin/env bash
# GitHub Pages Setup Script
# Enables GitHub Pages with Actions source and triggers deployment.
set -euo pipefail

# --- Configuration ---
PROJECT_DIR="${1:-.}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

echo "=== GitHub Pages Setup ==="
echo "Project directory: $PROJECT_DIR"
echo ""

# --- Step 1: Check GitHub CLI ---
if ! command -v gh &> /dev/null; then
    echo "ERROR: GitHub CLI (gh) not found."
    echo "Install: https://cli.github.com/"
    exit 1
fi

# --- Step 2: Check authentication ---
if ! gh auth status &> /dev/null 2>&1; then
    echo "ERROR: Not logged in to GitHub CLI."
    echo "Run: gh auth login"
    exit 1
fi
echo "Authenticated: $(gh auth status 2>&1 | grep 'Logged in' | head -1 | xargs)"

# --- Step 3: Extract owner/repo from git remote ---
cd "$PROJECT_DIR"

REMOTE_URL=$(git remote get-url origin 2>/dev/null || true)
if [ -z "$REMOTE_URL" ]; then
    echo "ERROR: No GitHub remote found."
    echo "Add one with: git remote add origin https://github.com/USER/REPO.git"
    exit 1
fi

OWNER=$(echo "$REMOTE_URL" | sed -E 's#.*(github\.com)[:/]([^/]+)/([^/.]+)(\.git)?$#\2#')
REPO=$(echo "$REMOTE_URL" | sed -E 's#.*(github\.com)[:/]([^/]+)/([^/.]+)(\.git)?$#\3#')

echo "Repository: $OWNER/$REPO"
echo ""

# --- Step 4: Enable GitHub Pages with Actions source ---
echo "--- Enabling GitHub Pages ---"

# Check if Pages is already enabled
PAGES_STATUS=$(gh api "/repos/$OWNER/$REPO/pages" 2>/dev/null && echo "exists" || echo "not_found")

if echo "$PAGES_STATUS" | grep -q "not_found"; then
    # Create Pages with Actions source
    if gh api -X POST "/repos/$OWNER/$REPO/pages" -f build_type=workflow 2>/dev/null; then
        echo "GitHub Pages: ENABLED (source: GitHub Actions)"
    else
        echo "WARNING: Could not enable GitHub Pages via API."
        echo "You may need to enable it manually in: Settings > Pages > Source > GitHub Actions"
    fi
else
    # Update existing Pages to use Actions source
    if gh api -X PUT "/repos/$OWNER/$REPO/pages" -f build_type=workflow 2>/dev/null; then
        echo "GitHub Pages: UPDATED (source: GitHub Actions)"
    else
        echo "GitHub Pages: Already configured"
    fi
fi

# --- Step 5: Enable the deployment workflow ---
echo ""
echo "--- Enabling Workflow ---"

if gh workflow enable deploy-pages.yml 2>/dev/null; then
    echo "Workflow: ENABLED (deploy-pages.yml)"
else
    echo "Workflow: Already enabled or not yet pushed"
fi

# --- Step 6: Trigger deployment ---
echo ""
echo "--- Triggering Deployment ---"

if gh workflow run deploy-pages.yml 2>/dev/null; then
    echo "Deployment: TRIGGERED"
else
    echo "Deployment will start on next push to main"
fi

# --- Summary ---
echo ""
echo "=== Setup Complete ==="
echo "Repository: $OWNER/$REPO"
echo "Pages URL:  https://$OWNER.github.io/$REPO/"
echo "Actions:    https://github.com/$OWNER/$REPO/actions"
echo ""
echo "Your site will be live after the first successful deployment."
echo ""
