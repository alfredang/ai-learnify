#!/bin/bash
# Secret Scanner for GitHub Push
# Scans staged files for exposed secrets before pushing

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SECRETS_FOUND=0
declare -a FINDINGS

echo "Scanning for exposed secrets..."
echo ""

# Get list of staged files
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || echo "")

if [ -z "$STAGED_FILES" ]; then
    echo -e "${YELLOW}No staged files to scan.${NC}"
    exit 0
fi

# Secret patterns
declare -A PATTERNS=(
    # AWS
    ["AWS Access Key"]='AKIA[0-9A-Z]{16}'
    ["AWS Secret Key"]='aws_secret_access_key\s*=\s*['\''"][A-Za-z0-9/+=]+['\''"]'

    # API Keys
    ["Generic API Key"]='api[_-]?key\s*[:=]\s*['\''"][A-Za-z0-9_\-]{20,}['\''"]'
    ["OpenAI Key"]='sk-[A-Za-z0-9]{48}'
    ["Anthropic Key"]='sk-ant-[A-Za-z0-9\-_]{90,}'

    # Private Keys
    ["Private Key"]='-----BEGIN (RSA|DSA|EC|OPENSSH|PGP)? ?PRIVATE KEY-----'

    # Database URLs
    ["PostgreSQL URL"]='postgres(ql)?://[^\s'\''"]+'
    ["MySQL URL"]='mysql://[^\s'\''"]+'
    ["MongoDB URL"]='mongodb(\+srv)?://[^\s'\''"]+'
    ["Redis URL"]='redis://[^\s'\''"]+'

    # OAuth/Tokens
    ["Bearer Token"]='[Bb]earer\s+[A-Za-z0-9\-_.~+/]+=*'
    ["JWT Token"]='eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*'

    # Cloud Providers
    ["Google API Key"]='AIza[0-9A-Za-z\-_]{35}'
    ["Stripe Key"]='sk_live_[0-9a-zA-Z]{24}'
    ["Stripe Publishable"]='pk_live_[0-9a-zA-Z]{24}'
    ["Twilio Key"]='SK[0-9a-fA-F]{32}'
    ["SendGrid Key"]='SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}'
    ["Slack Token"]='xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*'
    ["GitHub Token"]='gh[pousr]_[A-Za-z0-9_]{36,}'
    ["Heroku API Key"]='[hH]eroku.*[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}'

    # Generic Secrets
    ["Password"]='password\s*[:=]\s*['\''"][^'\''\"]{8,}['\''"]'
    ["Secret"]='secret\s*[:=]\s*['\''"][^'\''\"]{8,}['\''"]'
    ["Credential"]='credential\s*[:=]\s*['\''"][^'\''\"]+['\''"]'
)

# Sensitive file patterns
SENSITIVE_FILES=(
    "\.env$"
    "\.env\."
    "\.pem$"
    "\.key$"
    "\.p12$"
    "\.pfx$"
    "credentials\.json"
    "secrets\.json"
    "id_rsa$"
    "id_dsa$"
    "id_ecdsa$"
    "id_ed25519$"
    "\.keystore$"
    "\.jks$"
    "\.htpasswd$"
    "\.netrc$"
    "\.npmrc$"
)

# Check for sensitive files
echo "Checking for sensitive files..."
for file in $STAGED_FILES; do
    for pattern in "${SENSITIVE_FILES[@]}"; do
        if echo "$file" | grep -qE "$pattern"; then
            SECRETS_FOUND=$((SECRETS_FOUND + 1))
            FINDINGS+=("${RED}Sensitive File:${NC} $file")
            echo -e "  ${RED}FOUND:${NC} Sensitive file staged: $file"
        fi
    done
done

# Scan file contents for secrets
echo "Scanning file contents..."
for file in $STAGED_FILES; do
    # Skip binary files
    if file "$file" 2>/dev/null | grep -q "binary"; then
        continue
    fi

    # Skip if file doesn't exist (deleted)
    if [ ! -f "$file" ]; then
        continue
    fi

    for pattern_name in "${!PATTERNS[@]}"; do
        pattern="${PATTERNS[$pattern_name]}"

        # Search for pattern in staged content
        matches=$(git diff --cached "$file" 2>/dev/null | grep -nE "$pattern" || true)

        if [ -n "$matches" ]; then
            SECRETS_FOUND=$((SECRETS_FOUND + 1))
            while IFS= read -r match; do
                line_num=$(echo "$match" | cut -d: -f1)
                FINDINGS+=("${RED}$pattern_name${NC} in $file:$line_num")
                echo -e "  ${RED}FOUND:${NC} $pattern_name in $file"
            done <<< "$matches"
        fi
    done
done

echo ""

# Report results
if [ $SECRETS_FOUND -gt 0 ]; then
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}SECURITY ALERT: $SECRETS_FOUND secret(s) detected!${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo "Findings:"
    for finding in "${FINDINGS[@]}"; do
        echo -e "  - $finding"
    done
    echo ""
    echo "Remediation steps:"
    echo "  1. Remove secrets from the flagged files"
    echo "  2. Use environment variables instead"
    echo "  3. Add sensitive files to .gitignore"
    echo "  4. Run: git reset HEAD <file> to unstage"
    echo ""
    echo -e "${RED}Push BLOCKED. Fix issues before pushing.${NC}"
    exit 1
else
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Security scan complete: No secrets detected${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Safe to push!"
    exit 0
fi
