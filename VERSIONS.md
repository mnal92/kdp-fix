# Kindle EPUB Fix - Standalone Version

## Two Versions Available

### 1. **Modular Version** (Current - Requires Server)
- **Location**: `index.html` + `js/` folder
- **Pros**: Clean code, easier to maintain, PWA support
- **Cons**: Needs local server (`python -m http.server 8000`)
- **Best for**: Development, GitHub Pages deployment

### 2. **Standalone Version** (Coming Soon)
- **Location**: `standalone.html` (single file)
- **Pros**: Works offline, double-click to open, no server needed
- **Cons**: Larger file size (~500KB), harder to maintain
- **Best for**: Offline use, sharing with non-technical users

## Quick Decision Guide

**Use Modular Version if:**
- You're comfortable running a simple command
- You want the latest features and updates
- You're deploying to a web server

**Use Standalone Version if:**
- You want zero setup - just double-click and go
- You need to work completely offline
- You're sharing with someone who isn't technical

## Current Recommendation
For now, use the **modular version** with Python server:
```bash
cd C:\Users\nando\Documents\GitHub\kdp-fix
python -m http.server 8000
```
Then open: http://localhost:8000

I can create the standalone version if you prefer, but it will be a ~500KB single HTML file with everything embedded.
