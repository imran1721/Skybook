# OG / social preview image

Drop a file named **`og-image.png`** in this directory to make link previews
work on Slack, LinkedIn, iMessage, Twitter/X, Discord, etc.

## Spec

- **File**: `public/og-image.png`
- **Dimensions**: 1200 × 630 px (standard OG / Twitter `summary_large_image`)
- **Format**: PNG or JPG (PNG recommended for the clean teal accents)
- **Weight**: keep under ~500 KB if possible

## What to put on it

A screenshot of the plane mid-flight over Paris works great. Suggested overlay:

```
┌──────────────────────────────────────────────────┐
│                                                  │
│       Imran Ansari                               │
│       Senior Full-Stack Engineer                 │
│       Agentic AI · Geospatial · Frontend         │
│                                                  │
│       [plane flying over Paris screenshot]       │
│                                                  │
└──────────────────────────────────────────────────┘
```

## Easiest workflow

1. Open the live game, fly to a great angle (Eiffel Tower in the background,
   plane centered, billboards visible).
2. Take a 1200 × 630-ish screenshot (or crop a larger one to 1200 × 630).
3. In Figma / Photopea / Canva, drop the screenshot in and add the text overlay.
4. Export as `og-image.png`, drop here.

The meta tags are already wired in `index.html` — once the file exists, social
previews will start working with no code changes.
