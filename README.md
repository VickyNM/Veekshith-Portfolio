# Veekshith Portfolio

A static portfolio site for a game and level designer. There is no build step: the pages read their content from one file, `portfolio.yaml`.

## Files

| File | What it is |
| --- | --- |
| `portfolio.yaml` | All the content and colours. Edit this to change the site. |
| `index.html` | Home page (selected work, what I do) |
| `project.html` | Case study page, opened as `project.html?id=crash-attack` |
| `resume.html` | Resume page |
| `css/style.css` | Styles, including the light and dark themes |
| `js/app.js` | Reads `portfolio.yaml` and fills the pages |
| `images/` | Screenshots, gameplay clips and posters, one folder per project |
| `tools/compress-video.ps1` | Turns a screen recording into a small web-ready MP4 (needs ffmpeg) |
| `server.py` | Local preview server |

## Editing

1. Open `portfolio.yaml`. Comments in the file explain each field.
2. Save, then refresh the browser.
3. A project with `draft: true` is hidden from the site. Remove that line when its page is ready.

## Previewing locally

```bash
python server.py
```

Then open http://localhost:8000. To see draft projects, add `?drafts=1` to the address.

## Adding gameplay clips

Use short MP4 clips instead of GIFs. They are about ten times smaller.

```bash
powershell -ExecutionPolicy Bypass -File tools\compress-video.ps1 -In "recording.mp4" -Out "images\crash-attack\clip.mp4"
```

Then add it to the project's `media:` list in `portfolio.yaml` with `loop: true`.

## Publishing (GitHub Pages)

1. Commit and push to the `main` branch.
2. In the repository on GitHub, open Settings, then Pages.
3. Under "Build and deployment", choose "Deploy from a branch", pick `main` and `/ (root)`, and save.
4. The site appears at `https://<username>.github.io/Veekshith-Portfolio/` after about a minute.

The sharing preview in `index.html` uses an absolute image address. If the site moves to a different address, update the `og:image` line in the `<head>`.
