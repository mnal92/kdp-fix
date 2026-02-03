# Kindle EPUB Fix (v2.0)

A premium, browser-based tool to optimize and repair EPUB files specifically for Amazon's "Send to Kindle" service. 100% client-side, offline-safe, and privacy-focused.

## ✨ Features

- **Parallel Processing**: Batch process multiple EPUBs simultaneously.
- **Smart Repair**: 
  - Fixes UTF-8 encoding declarations.
  - Repairs broken NCX/Nav Table of Contents.
  - Automatically handles malformed OPF structures.
  - Sanitizes HTML and removes stray tags.
- **Advanced Editing**:
  - In-browser Metadata Editor (Title, Author, Series, Language).
  - Drag & Drop cover replacement.
- **Visual Excellence**:
  - Optimized for 4K displays (responsive 2-column layout).
  - Apple-inspired design with Dark/Light mode support.
  - Real-time PT/EN localization.
- **Privacy First**: Files are NEVER uploaded to any server. Everything happens in your browser.

## 🚀 Quick Start

Due to security restrictions on ES6 modules and Service Workers, a local server is required.

### 1. Run the Server
Open your terminal in the project folder and run:

```bash
# Using Python (Pre-installed on most systems)
python -m http.server 8000
```

### 2. Open the App
Visit: **[http://localhost:8000](http://localhost:8000)**

## 📦 Project Structure

- `index.html`: Main application entry point.
- `styles.css`: Advanced Apple-style design system.
- `script.js`: Application coordinator and state management.
- `sw.js`: Service worker for offline functionality.
- `js/`:
  - `epub-engine.js`: Heart of the app. Handles EPUB reading, fixing, and writing.
  - `utils.js`: Helper functions for compression and DOM manipulation.
  - `constants.js`: Localization strings and configuration.

## 🛠️ Offline Support (PWA)

This app is a Progressive Web App. Once loaded via the local server for the first time, you can:
1. "Install" it or "Add to Home Screen".
2. Use it completely offline without needing to rerun the server command (provided the browser cache is maintained).

## 🔒 Security & Privacy

This application uses the `zip.js` library to deconstruct and rebuild EPUB files directly in your browser's memory.
- No files are uploaded.
- No analytics are tracked.
- No external APIs are called during processing.

---
Created with ❤️ for Kindle readers.
