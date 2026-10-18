# Portfolio CMS

A private dashboard for writing projects and blog posts on kailashamarnath.me.
It runs only on this laptop and turns what you write into normal static pages
that GitHub Pages serves, so the public site stays fast and free.

## Start it

```
cd cms
npm run cms
```

Your browser opens the dashboard. If it doesn't, open the link printed in the
terminal (it contains your private key). Press Ctrl+C in the terminal to stop it.
It needs Node.js 18 or newer and nothing else: there is nothing to `npm install`.

## Writing

- **New project / New blog post** opens the editor. Write like a document.
- **Section heading** (in the style menu) starts a new glass panel on the page,
  like "Overview" or "The Problem".
- **＋ Image** uploads or picks an image or video. **＋ Gallery** adds a row of images.
  You can also drag images from your desktop or paste them straight in.
- Click an image to make it full width, float it left or right, add a caption
  or alt text, move it, or remove it.
- **Visibility** decides what visitors see:
  - Draft: only in the dashboard.
  - Coming soon: a card on the home page, no page yet.
  - Published: its own page, plus a card.
- **Save** (Ctrl+S) keeps your work on this laptop and rebuilds the local copy of the
  site. **Preview** shows the page exactly as visitors will see it.
- **Publish** (top right) shows every changed file, then commits and pushes them to
  GitHub. GitHub Pages updates the live site a minute or two later.

## Where things live

| What | Where |
| --- | --- |
| Your writing (private, never published) | `cms/content/projects/*.html`, `cms/content/blog/*.html` |
| Site-wide settings | `cms/content/site.json` (or the Settings tab) |
| Previous versions of each file (last 20) | `cms/content/.history/` |
| Deleted items | `cms/content/.trash/` |
| Uploaded images | `Images/uploads/` |
| Generated pages | `<page-address>.html` in the site root |
| Page design | `cms/templates/page.html` and `assets/css/content.css` |

`cms/content/` is listed in `.gitignore`, so drafts never reach the public repository.
Because of that it is only on this laptop: back the folder up (OneDrive, a USB drive,
or a private GitHub repository) so a lost laptop doesn't take your drafts with it.

## Safety

- The dashboard only listens on 127.0.0.1, so other devices on your Wi‑Fi can't reach it.
- Every request needs the private key from the start-up link (kept in `cms/.key`;
  delete that file to make a new one). Other websites open in your browser can't use it.
- Pasted and typed content is cleaned of scripts and unsafe links before it is saved.
- Uploads are limited to PNG, JPG, GIF, WebP, MP4 and WebM, checked by their contents.
- No GitHub password or token is stored. Publishing uses the sign-in Git already has
  (Git for Windows or GitHub Desktop). If a push fails, use GitHub Desktop's "Push origin".
- The generator only overwrites pages it created itself, so hand-written pages are safe.

## Commands

```
npm run cms     # start the dashboard
npm run build   # rebuild pages, home page cards and sitemap.xml without the dashboard
npm test        # sanitizer and markdown checks
```
