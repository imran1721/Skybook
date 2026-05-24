// Curated portfolio deck: one headline card per project + a few skill / hero
// cards. Each card is a target — once torn, project cards slide a chip into
// the collection panel; the chip persists into the game-over view.

/** Deployed full portfolio with case studies, resume, etc. */
export const PORTFOLIO_URL = "https://portfolio-imran-ansari.vercel.app";

const caseStudy = (slug: string) => `${PORTFOLIO_URL}/work/${slug}`;

export const START = {
  lat: 48.8520, // ~700m south of the Eiffel Tower
  lng: 2.2945,
  alt: 140,
  heading: 0,
};

export type POI = {
  title: string;
  body: string;
  stack?: string;
  href?: string;
  kicker?: string;
  /** If set, hitting this card adds a chip to the collection panel.
   *  Skill/hero/contact cards intentionally have no slug. */
  projectSlug?: string;
  /** Optional accent gradient for the collection chip thumbnail. */
  accent?: string;
};

export const POIS: POI[] = [
  // ===== Hero (no slug) =====
  {
    kicker: "Hello",
    title: "Imran Ansari",
    body: "Senior Full-Stack Engineer · 4+ years shipping production platforms",
  },

  // ===== Skills (no slug) =====
  {
    kicker: "Focus",
    title: "Agentic AI · Geospatial",
    body: "LLM tool-calling · in-browser Pyodide · schema-grounded SQL · 3D maps",
  },
  {
    kicker: "Stack",
    title: "React 19 · TypeScript · Python · GCP",
    body: "Vinxi · Rio.js · TanStack · Deck.gl · PostGIS · BigQuery · Cloud Run",
  },

  // ===== Featured projects (one card each, with projectSlug for collection) =====
  {
    projectSlug: "smart-market",
    kicker: "Lepton · 2024 → now",
    title: "SmartMarket Platform",
    body: "Frontend lead on the v1 rewrite — Datasets, Connections, agentic AI Assistant",
    stack: "React 19 · Vinxi · Pyodide · Playwright",
    href: caseStudy("smart-market"),
    accent: "linear-gradient(135deg, #14b8a6, #0f766e)",
  },
  {
    projectSlug: "google-rmi",
    kicker: "Lepton · 2024",
    title: "Google RMI Demo",
    body: "Customer showcase for Google's Roads Management Insights — traffic intelligence at city scale",
    stack: "React 19 · FastAPI · BigQuery · Deck.gl · Cloud Run",
    href: caseStudy("google-rmi"),
    accent: "linear-gradient(135deg, #f97316, #c2410c)",
  },
  {
    projectSlug: "route-registration",
    kicker: "Lepton · 2025",
    title: "Route Registration",
    body: "RMI companion — pick road segments on a Google Map, sync to BigQuery for downstream analytics",
    stack: "React · Google Maps · FastAPI · PostgreSQL",
    href: caseStudy("route-registration"),
    accent: "linear-gradient(135deg, #10b981, #047857)",
  },
  {
    projectSlug: "shipstation",
    kicker: "Innostax · Project Lead",
    title: "ShipStation Platform",
    body: "Integrated 15+ shipping-carrier modules · led a team of 7 · +40% API perf · −20% iteration cycles",
    stack: "Node.js · REST · SOAP · Jest · Mocha",
    href: caseStudy("shipstation"),
    accent: "linear-gradient(135deg, #3b82f6, #1e40af)",
  },
  {
    projectSlug: "plenti-exchange",
    kicker: "Innostax · Project Lead",
    title: "PlentiExchange",
    body: "1031 real-estate report generator — React + Node + .NET. −25% report time, −40% signup setup",
    stack: "React · Node · .NET · MongoDB · Azure",
    href: caseStudy("plenti-exchange"),
    accent: "linear-gradient(135deg, #f59e0b, #b45309)",
  },
  {
    projectSlug: "morehands",
    kicker: "Innostax · Project Lead",
    title: "Morehands Mobile",
    body: "Cross-platform iOS/Android home-services rebuild · −30% load · +50% engagement",
    stack: "Ionic · Salesforce · Firebase",
    href: caseStudy("morehands"),
    accent: "linear-gradient(135deg, #f97316, #9f1239)",
  },
  {
    projectSlug: "vibin",
    kicker: "Personal · 2025",
    title: "vibin.click",
    body: "Spotify Jam–style shared YouTube listening party — realtime sync via Supabase, host-based playback",
    stack: "Next.js · Supabase Realtime · YouTube API",
    href: caseStudy("vibin"),
    accent: "linear-gradient(135deg, #ec4899, #831843)",
  },
  {
    projectSlug: "slack-claude-bridge",
    kicker: "Personal · npm",
    title: "slack-claude-bridge",
    body: "Drive Claude Code on your laptop from Slack on your phone — Stop hook + Socket Mode + resume protocol",
    stack: "Node.js · TypeScript · Slack Socket Mode",
    href: caseStudy("slack-claude-bridge"),
    accent: "linear-gradient(135deg, #8b5cf6, #f59e0b)",
  },
  {
    projectSlug: "stockpe",
    kicker: "Personal · 2025",
    title: "stockpe",
    body: "Inventory + billing PWA for a friend's electronics shop — barcode scan, CSV import, native print",
    stack: "Next.js 16 · React 19 · Supabase · shadcn/ui",
    href: caseStudy("stockpe"),
    accent: "linear-gradient(135deg, #10b981, #f97316)",
  },

  // ===== Closing card (no slug) =====
  {
    kicker: "Want more?",
    title: "Game over screen has it all",
    body: "Email · GitHub · resume PDF — keep hitting cards to collect them",
  },
];

// Random filler used in endless mode AFTER the real portfolio deck is
// exhausted, so the sky never goes empty. These cards intentionally have no
// projectSlug (don't appear in the collection panel) and no href (just a
// visual/flavor token).
export const FILLER_POIS: POI[] = [
  // Aviation / pilot lingo
  { kicker: "Tower", title: "Cleared for takeoff", body: "Runway 27R · winds 270 at 8 knots" },
  { kicker: "Pilot says", title: "Hold short", body: "Cleared to taxi via Alpha, hold short of 18L" },
  { kicker: "Mach", title: "1 Mach ≈ 767 mph", body: "Speed of sound at sea level" },
  { kicker: "Cruise", title: "33,000 ft", body: "Typical commercial cruise altitude" },
  { kicker: "Squawk", title: "Code 7700", body: "Universal emergency transponder code" },
  { kicker: "Roger", title: "Roger that", body: "Means: 'I have received all of your last transmission'" },
  { kicker: "Bearing", title: "Heading 270", body: "Due west — you're chasing the sunset" },
  { kicker: "Tailwind", title: "Free speed", body: "A tailwind cuts hours off long-haul flights" },

  // Paris flavor (since that's where you're flying)
  { kicker: "Below you", title: "Paris, France", body: "1,000+ years of streets folded under your wing" },
  { kicker: "Eiffel Tower", title: "330 m tall", body: "Still the tallest structure in Paris" },
  { kicker: "La Défense", title: "Tour First", body: "Tallest building in France: 231 m" },
  { kicker: "Bonjour", title: "Vue magnifique", body: "Pretty good view from up here" },

  // Tech / engineering one-liners
  { kicker: "Pro tip", title: "Schema-grounded SQL", body: "Give the LLM your `_info.json` BEFORE its first query" },
  { kicker: "Pro tip", title: "Pyodide ≠ heavy", body: "Python in the browser is faster than you'd think" },
  { kicker: "Pro tip", title: "Real-API trust suite", body: "Catch FE↔BE contract regressions before staging promotes" },
  { kicker: "Stack", title: "Cesium + Google 3D Tiles", body: "What you're flying through right now" },
  { kicker: "Stack", title: "TypeScript everywhere", body: "From the plane controls to the billboard scheduler" },
  { kicker: "Built with", title: "Vite · React 19 · Cesium", body: "All wired with vibes and zero AI generated CSS" },

  // Game / boost hints
  { kicker: "Tip", title: "Press B to boost", body: "Spends 1 charge for a 5-second speed warp" },
  { kicker: "Tip", title: "Hold ⇧ Shift", body: "Pauses + zooms the nearest card so you can actually read it" },
  { kicker: "Tip", title: "3 cards = 1 charge", body: "Stack charges, then chain boosts for big speed" },
  { kicker: "Tip", title: "Camera angle 5° above", body: "Tweak pitchDeg in plane3d.ts if you want different framing" },

  // Personal / persona
  { kicker: "Imran says", title: "Don't write a wall of text", body: "Comment why, not what" },
  { kicker: "Imran says", title: "Ship the small thing first", body: "Then iterate. Then iterate again" },
  { kicker: "Imran says", title: "Tests catch what eyes miss", body: "Especially in real-API trust suites" },
  { kicker: "Imran says", title: "Open to senior roles", body: "Agentic AI · geospatial · frontend leadership" },

  // Easter eggs / fun
  { kicker: "Easter egg", title: "You read this?", body: "Nice catch — most fly past without noticing" },
  { kicker: "Achievement", title: "Sky reader", body: "Keep flying, more fun trivia ahead" },
  { kicker: "Vapor trail", title: "What you leave behind", body: "= the projects you've shipped" },
  { kicker: "Found it", title: "The flying portfolio idea", body: "Was born one weekend with too much caffeine" },
];
