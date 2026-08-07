# EchoVision

EchoVision is a browser-based assistive vision app: it watches through your
camera, detects objects around you, and speaks what it sees out loud. Everything
runs locally in the browser — no account, no API key, no data leaves your device.


## Quickstart

You need [Docker](https://docs.docker.com/get-docker/). One command:

```bash
git clone https://github.com/TevBenji/EchoVision12345.git
cd EchoVision12345
docker compose up
```

Open **<http://localhost:8080>** and allow camera access.

Prefer Node? Node 22+ works too:

```bash
npm install
npm run dev          # also http://localhost:8080
```

No `.env` file is required. The app runs entirely on free, open-source
defaults out of the box.

> [!IMPORTANT]
> **The camera only works on `localhost` or HTTPS.** Browsers block
> `getUserMedia` outside a secure context, so opening the app at a LAN address
> like `http://192.168.1.5:8080` will show a permission error no matter what
> you click. To test on a phone, put it behind HTTPS — a tunnel such as
> `cloudflared tunnel --url http://localhost:8080` is the quickest way.

---

## Status

Honest state of things, so you know what you're cloning.

### Works

- **Local object detection** — TensorFlow.js + COCO-SSD, running on-device. This
  is the default and the only detection backend that is known to work end to end.
- **Spoken announcements** — the browser's built-in `SpeechSynthesis`. Includes a
  queue, priority handling, and configurable rate/volume.
- **Voice commands** — via the Web Speech API (`SpeechRecognition`). Chromium-based
  browsers only; Firefox and Safari do not implement it.
- **Camera view** — portrait 9:16, front/rear switching, with mobile-specific
  error handling and retry.
- **Settings and preferences** — persisted to `localStorage`.

### Rough

- **Distance estimation** is a heuristic, not real depth sensing. It compares the
  detected bounding-box size against a hardcoded table of typical real-world object
  widths (`DISTANCE_CALIBRATION` in `src/utils/objectDetection.ts`). Expect it to be
  roughly directional, not accurate. The table is the tuning knob — adjust it for
  your camera and mounting height.
- **Bundle size** is ~1.6 MB (441 KB gzipped), almost entirely TensorFlow.js. First
  load on a slow connection is slow. No code splitting yet.
- **The Profile page is a mock** — hardcoded placeholder user, no auth behind it.

### Not working / not wired up

- **Azure AI Vision** — the code path exists and was fixed to no longer crash in the
  browser (it previously used Node's `Buffer`), but it is untested against a live
  Azure resource. Off by default.
- **DeepSeek** — `callDeepseekApi()` performs **no network request**. It calls the
  local model and returns those results. The setting exists but does nothing.
- **Generic cloud detection** — returns mock data unless you point it at your own
  endpoint. There is no hosted service behind it.

---

## Configuration

Every variable is optional. Copy `.env.example` to `.env.local` only if you want
to enable an external provider.

| Variable                    | Purpose                                            | Default           |
| --------------------------- | -------------------------------------------------- | ----------------- |
| `VITE_ENABLE_EXTERNAL_APIS` | Master switch for all external detection providers | `false`           |
| `VITE_AZURE_VISION_URL`     | Azure AI Vision `/analyze` endpoint                | empty (disabled)  |
| `VITE_AZURE_VISION_KEY`     | Azure AI Vision subscription key                   | empty (disabled)  |
| `VITE_DEEPSEEK_URL`         | DeepSeek endpoint — currently unused, see Status   | empty             |
| `VITE_DEEPSEEK_KEY`         | DeepSeek API key — currently unused, see Status    | empty             |
| `VITE_CLOUD_DETECTION_URL`  | Your own detection endpoint                        | empty (mock data) |
| `VITE_CLOUD_DETECTION_KEY`  | Bearer token for the above                         | empty             |

Vite inlines `VITE_*` variables into the client bundle at build time. **Anything
you put here is readable by anyone who loads the page.** Never put a secret you
care about in a frontend build — if you need a protected key, put a small proxy
server in front of it.

A custom cloud endpoint should accept:

```json
{ "image": "<base64 jpeg>", "options": { "confidenceThreshold": 0.15, "maxDetections": 10 } }
```

and return `{ "objects": [{ "class": "chair", "confidence": 0.8, "bbox": {"x":0,"y":0,"width":0.1,"height":0.1} }] }`.

---

## Architecture

A static single-page app. No backend, no database, no server-side code.

```
Camera (getUserMedia)
      │
      ▼
CameraView ──frames──▶ objectDetection.ts ──▶ TensorFlow.js + COCO-SSD  (in-browser)
                              │                    └── optional: Azure / cloud endpoint
                              ▼
                        DetectedObject[]
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
      ObjectDetection.tsx              speechUtils.ts
      (bounding-box overlay)      (SpeechSynthesis queue)
```

| Path                           | Role                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `src/pages/`                   | Routed screens — `Home`, `Camera`, `Voice`, `Settings`, `Profile`, `Terms`, `Privacy` |
| `src/components/vision/`       | Camera feed, detection overlay, navigation hints, voice listener                      |
| `src/components/ui/`           | shadcn/ui primitives (vendored source, MIT)                                           |
| `src/utils/objectDetection.ts` | Model loading, inference, provider routing, distance heuristic                        |
| `src/utils/speechUtils.ts`     | Speech queue, phrasing, navigation instruction generation                             |
| `src/hooks/`                   | Device capability detection, cloud-detection settings, toasts                         |

State lives in `localStorage`. There is deliberately no database: the only
persisted data is per-device camera and speech preferences, which belong on the
device rather than on a server. Adding one would mean inventing a backend this
app does not otherwise need.

---

## Scripts

| Command             | What it does                |
| ------------------- | --------------------------- |
| `npm run dev`       | Vite dev server on :8080    |
| `npm run build`     | Production build to `dist/` |
| `npm run preview`   | Serve the built output      |
| `npm test`          | Run the Vitest suite        |
| `npm run lint`      | ESLint                      |
| `npm run typecheck` | `tsc --noEmit`              |
| `npm run format`    | Prettier write              |

---

## Deploying

The build output is static files — any static host works.

```bash
npm run build   # -> dist/
```

The included `Dockerfile` builds and serves it behind nginx with SPA routing, which
is the recommended path. Free-tier alternatives that work without modification
include Cloudflare Pages, Netlify, GitHub Pages, and Vercel — point them at
`npm run build` with an output directory of `dist`. None of these are required;
they are options.

Whatever you choose must serve over **HTTPS**, or the camera will not start.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © the five authors listed in [AUTHORS.md](AUTHORS.md).
