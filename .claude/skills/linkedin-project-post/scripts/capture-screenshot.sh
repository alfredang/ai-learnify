#!/bin/bash
# Capture screenshot of a website for LinkedIn post
# Usage: ./capture-screenshot.sh <URL> [output-filename]
# Screenshot saves to ~/Downloads by default

URL=$1
FILENAME=${2:-"linkedin-screenshot.png"}
DOWNLOADS="$HOME/Downloads"
OUTPUT="$DOWNLOADS/$FILENAME"

if [ -z "$URL" ]; then
    echo "Usage: ./capture-screenshot.sh <URL> [output-filename]"
    echo "Example: ./capture-screenshot.sh https://myapp.netlify.app"
    echo "Screenshot will be saved to ~/Downloads/linkedin-screenshot.png"
    exit 1
fi

echo "📸 Capturing screenshot of $URL..."
echo "📁 Saving to: $OUTPUT"

# Try puppeteer first (most common)
if command -v npx &> /dev/null; then
    echo "Using Puppeteer..."
    npx --yes puppeteer screenshot "$URL" --output "$OUTPUT" --viewport 1200x630
    if [ $? -eq 0 ]; then
        echo "✅ Screenshot saved to $OUTPUT"
        echo "📂 Opening Downloads folder..."
        open "$DOWNLOADS" 2>/dev/null || xdg-open "$DOWNLOADS" 2>/dev/null
        exit 0
    fi
fi

# Try shot-scraper (Python)
if command -v shot-scraper &> /dev/null; then
    echo "Using shot-scraper..."
    shot-scraper "$URL" -o "$OUTPUT" --width 1200 --height 630
    if [ $? -eq 0 ]; then
        echo "✅ Screenshot saved to $OUTPUT"
        echo "📂 Opening Downloads folder..."
        open "$DOWNLOADS" 2>/dev/null || xdg-open "$DOWNLOADS" 2>/dev/null
        exit 0
    fi
fi

# Fallback to screenshot API
echo "Using screenshot API..."
curl -s "https://api.screenshotone.com/take?url=$URL&viewport_width=1200&viewport_height=630&format=png&access_key=free" -o "$OUTPUT"

if [ -f "$OUTPUT" ]; then
    echo "✅ Screenshot saved to $OUTPUT"
    echo "📂 Opening Downloads folder..."
    open "$DOWNLOADS" 2>/dev/null || xdg-open "$DOWNLOADS" 2>/dev/null
    echo "🔗 Opening LinkedIn compose page..."
    sleep 1
    open "https://www.linkedin.com/feed/?shareActive=true" 2>/dev/null || xdg-open "https://www.linkedin.com/feed/?shareActive=true" 2>/dev/null
    echo ""
    echo "📝 Ready to post! Paste your text and upload the screenshot."
else
    echo "❌ Failed to capture screenshot"
    exit 1
fi
