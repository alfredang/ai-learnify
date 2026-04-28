---
name: linkedin-project-post
description: Generate exciting LinkedIn posts to showcase your vibe coding projects with emojis, hashtags, features, tech stack, and call-to-action for engagement.
---

# LinkedIn Project Post

## Command
`/linkedin-post` or `linkedin-post`

## Keywords
linkedin, linkedin post, share project, vibe coding, showcase project, social media post, project announcement, github project, portfolio post

## Description
Generate an engaging LinkedIn post to showcase your coding project with excitement, emojis, and a call-to-action for the developer community.

## Execution
This skill runs using **Claude Code with subscription plan**. Do NOT use pay-as-you-go API keys.

## Response
I'll generate an exciting LinkedIn post for your project!

The post will include:

| Section | Description |
|---------|-------------|
| **Screenshot** | Auto-captured screenshot of the demo site |
| **Auto-Post** | Publish directly via LinkedIn MCP (if configured) |
| **Hook** | Exciting opening with emojis to grab attention |
| **Live Demo Link** | URL to the deployed app |
| **GitHub Repo Link** | URL to the source code |
| **What It's About** | Brief description of the project purpose |
| **Key Features** | Bullet list of main features with checkmarks |
| **Tech Stack** | Technologies used with emoji icons |
| **Call to Action** | Encourage fork, comment, discuss, star |
| **Hashtags** | Relevant hashtags for visibility |

## Screenshot / Image Attachment
If a live demo URL is provided, **always** capture a screenshot and attach it as the LinkedIn post image. The screenshot serves as the visual preview that appears with the post — LinkedIn posts with images get significantly more engagement.

### Capture Flow
1. Check if the user already has a screenshot or image they want to use. If yes, use that.
2. If a live demo URL is provided and no existing screenshot, auto-capture one using the methods below.
3. Save the screenshot to **~/Downloads/linkedin-screenshot.png**.
4. Open the Downloads folder so the user can easily drag-and-drop the image when composing the post.

### Using the included script (Recommended)
```bash
./scripts/capture-screenshot.sh [URL]
# Saves to ~/Downloads/linkedin-screenshot.png and opens folder
```

### Method 1: Using Puppeteer (Node.js)
```bash
npx puppeteer screenshot [URL] --output ~/Downloads/linkedin-screenshot.png --viewport 1200x630
```

### Method 2: Using Shot-scraper (Python)
```bash
shot-scraper [URL] -o ~/Downloads/linkedin-screenshot.png --width 1200 --height 630
```

### Method 3: Using Screenshot API
```bash
curl "https://api.screenshotone.com/take?url=[URL]&viewport_width=1200&viewport_height=630&format=png" -o ~/Downloads/linkedin-screenshot.png
```

### Recommended Screenshot Settings
- **Dimensions**: 1200x630px (LinkedIn optimal)
- **Format**: PNG or JPG
- **Save location**: ~/Downloads folder
- **Full page**: No, capture viewport only

### Screenshot Tips
- Capture the hero section or main feature
- Ensure the app is in a visually appealing state
- If login required, capture the landing/login page
- Downloads folder opens automatically for easy upload
- **Always remind the user to attach the screenshot** as the post image on LinkedIn

## Instructions
When generating a LinkedIn post, follow this structure:

### 1. Opening Hook
Start with enthusiasm and relevant emojis:
```
I'm thrilled to share a vibe-coding project I've been building — [Project Name] — [one-line description]! 🚀✨
```

### 2. Links Section
```
🌐 Check it out: [Live Demo URL]

📦 GitHub repo: [GitHub URL]
```

### 3. What It's About
```
🧭 What it's all about

[2-3 sentences describing the problem it solves and who it's for]
```

### 4. Key Features
```
🚀 Key Features

✅ [Feature 1]
✅ [Feature 2]
✅ [Feature 3]
✅ [Feature 4]
✅ [Feature 5]
… and more to come!
```

### 5. Tech Stack
```
🛠️ Built With

💻 Tech Stack:
• [Technology 1]
• [Technology 2]
• [Technology 3]
• [Technology 4]
• Hosted on [Platform]
```

### 6. Call to Action
```
⭐ Get Involved

Love [topic] or coding? Feel free to fork the project, leave a comment, and start a discussion!
👉 Don't forget to ⭐ star the repo — every star motivates open-source creators like me!

🔗 Repo: [GitHub URL]
```

### 7. Hashtags
Add 5-10 relevant hashtags:
```
#VibeCoding #OpenSource #WebDev #JavaScript #React #BuildInPublic #DevCommunity #100DaysOfCode #CodeNewbie #SideProject
```

## Emoji Guide
Use these emojis appropriately:
- 🚀 Launch/Features
- ✨ Highlights
- 🌐 Web/Live demo
- 📦 GitHub/Package
- 🧭 About/Navigation
- ✅ Features/Checkmarks
- 🛠️ Tech/Tools
- 💻 Code/Development
- ⭐ Star/Call to action
- 👉 Pointer/Direction
- 🔗 Links
- 🎯 Goals/Purpose
- 💡 Ideas/Tips
- 🔥 Hot/Trending

## Tone Guidelines
- Enthusiastic but authentic
- Professional yet approachable
- Celebrate the achievement
- Invite collaboration
- Show gratitude to the community

## Capabilities
- Generate engaging LinkedIn posts for any coding project
- Auto-post with image via LinkedIn MCP (lurenss/linkedin-mcp or Lnxtanx/LinkedIn-MCP)
- Auto-capture screenshots for post images
- Customize tone based on project type
- Include relevant hashtags for discoverability
- Create compelling calls-to-action
- Highlight tech stack professionally
- Fallback to manual browser flow if no MCP configured

## Auto-Post via LinkedIn MCP (Recommended)

If a LinkedIn MCP server is configured, **automatically publish the post with the screenshot image** instead of opening the browser. This is the preferred flow — zero manual steps.

### Supported LinkedIn MCP Servers

| MCP Server | Language | Tools | Install |
|-----------|----------|-------|---------|
| [lurenss/linkedin-mcp](https://github.com/lurenss/linkedin-mcp) | Node.js | `create_linkedin_post`, `create_linkedin_image_post` | `npm install` + build |
| [Lnxtanx/LinkedIn-MCP](https://github.com/Lnxtanx/LinkedIn-MCP) | Python | `create_post` (text/image/video/doc) | `uv add fastmcp requests` |

### Auto-Post Flow

#### Step 1: Check if LinkedIn MCP is available

Try calling the MCP tool to validate credentials:
- **lurenss/linkedin-mcp**: Call `validate_linkedin_credentials` or `get_linkedin_profile`
- **Lnxtanx/LinkedIn-MCP**: Call `create_post` with a dry-run or check for tool availability

If no LinkedIn MCP is configured, fall back to the manual flow (open browser).

#### Step 2: Post with image (preferred)

**Using lurenss/linkedin-mcp:**
```
Tool: create_linkedin_image_post
Arguments:
  text: "<generated post text>"
  image_path: "~/Downloads/linkedin-screenshot.png"
```

**Using Lnxtanx/LinkedIn-MCP:**
```
Tool: create_post
Arguments:
  text: "<generated post text>"
  media_type: "IMAGE"
  media_path: "~/Downloads/linkedin-screenshot.png"
```

#### Step 3: Post text-only (fallback if image fails)

If the image upload fails, fall back to a text-only post:

**Using lurenss/linkedin-mcp:**
```
Tool: create_linkedin_post
Arguments:
  text: "<generated post text>"
```

**Using Lnxtanx/LinkedIn-MCP:**
```
Tool: create_post
Arguments:
  text: "<generated post text>"
  media_type: "TEXT"
```

#### Step 4: Confirm success

After posting, report the result:
```
=== LinkedIn Post Published ===

Status: PUBLISHED
Type:   Image post
Image:  ~/Downloads/linkedin-screenshot.png

Your post is now live on LinkedIn!
```

### MCP Setup (One-time)

To enable auto-posting, the user must configure a LinkedIn MCP server. Guide them through setup if not configured:

**Option A: lurenss/linkedin-mcp (Node.js)**

1. Create a LinkedIn Developer App at https://www.linkedin.com/developers/
2. Add OAuth redirect URI: `http://localhost:8080/callback`
3. Request "Share on LinkedIn" and "Sign In with LinkedIn" products
4. Generate an access token (valid 60 days)
5. Add to Claude Code MCP config (`~/.claude/settings.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "linkedin-mcp": {
      "command": "node",
      "args": ["/path/to/linkedin-mcp/build/index.js"],
      "env": {
        "LINKEDIN_CLIENT_ID": "your_client_id",
        "LINKEDIN_CLIENT_SECRET": "your_client_secret",
        "LINKEDIN_ACCESS_TOKEN": "your_access_token"
      }
    }
  }
}
```

**Option B: Lnxtanx/LinkedIn-MCP (Python/FastMCP)**

1. Same LinkedIn Developer App setup as above
2. Get access token with `w_member_social` scope
3. Get your Member URN (`urn:li:person:XXXXXXXXXX`)
4. Configure credentials in `main.py`
5. Run: `uv run fastmcp dev main.py`

## Manual Fallback (No MCP)

If no LinkedIn MCP is configured, fall back to the manual browser flow:

### Open LinkedIn to Post
```bash
open "https://www.linkedin.com/feed/?shareActive=true"
```

### Manual Steps
1. Screenshot auto-captured and saved to ~/Downloads/linkedin-screenshot.png
2. LinkedIn compose page opens in browser
3. Paste the generated post text
4. **Attach the screenshot as the post image** → Click the photo icon → upload linkedin-screenshot.png from Downloads
5. Tag relevant people or companies if applicable
6. Post during peak LinkedIn hours (Tue-Thu, 8-10am)
7. Engage with comments promptly

## Next Steps
After the post is published (via MCP or manually):
1. Verify the post appears on your LinkedIn feed
2. Check that the image/screenshot is displaying correctly
3. Tag relevant people or companies if applicable
4. Post during peak LinkedIn hours (Tue-Thu, 8-10am) for best engagement
5. Engage with comments promptly
6. Share the post link with your team

**Tip**: LinkedIn posts with images receive up to 2x more engagement than text-only posts. Always include the screenshot.
