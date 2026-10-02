# Afterhours — Audio Player

A simple audio-sharing website: upload a song, send a listening link, and let clients play and replay it for 24 hours. No sign-in or sign-up is required.

**Live website:** https://afterhours-listen.sanksss.chatgpt.site

## Features

- Drag-and-drop upload, up to 50 MB per file.
- MP3, M4A, WAV, OGG, FLAC and AAC, subject to browser codec support.
- Public, unguessable listening links that expire 24 hours after upload.
- Progressive byte-range streaming, seeking, pause, replay, repeat and volume.
- Server-side expiry checks for metadata and audio requests.
- Browser-specific upload management and a Delete action that removes the stored audio and disables its link before expiry.
- Optional custom robotic voice watermarks with automatic or manual timestamps, volume control, music ducking, and preview before sharing.
- Responsive black-and-white interface with a charcoal player.

There is no download button. Audio played in a browser can still be captured or recorded; this is not DRM. Anyone with a listening link can listen or forward it until expiry.

## Stack

React 19 and TypeScript, with two hosting targets: native Next.js on Vercel with private Vercel Blob storage, or Vinext/Vite on Cloudflare Workers with D1 and R2. The source retains the existing Sites build integration.

## Deploy to Vercel

Import this repository and use the repository root (leave Root Directory blank). `vercel.json` selects the correct framework and build automatically.

| Setting | Value |
| --- | --- |
| Framework Preset | Next.js |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm build:vercel` |
| Output Directory | `.next` (or Next.js default; remove the old `.output` override) |
| Node.js | 22.x |
| Development Command | `pnpm dev:vercel` |

Do not use `vite build` or `pnpm build` for Vercel. The default `pnpm build` still targets Sites/Cloudflare. The Vercel command builds the robotic voice worker, then runs `next build --webpack` and produces `.next`.

### Required storage setup

1. In the Vercel project, open **Storage → Create Database / Create Storage → Blob**.
2. Create a **Private** Blob store and connect it to this project for Production (and Preview if needed).
3. Check that the project has the server-only environment variable **`BLOB_READ_WRITE_TOKEN`** from that store. Keep the default variable name. Client upload token generation requires this read-write token even if OIDC is also available. Never prefix it with `NEXT_PUBLIC_` and never commit its value.
4. Redeploy the newest GitHub commit after connecting storage.

No separate database is required for the Vercel target: private metadata objects and a browser-owner index are stored alongside the private audio. The site builds without storage credentials, but uploads/listing require the private store at runtime. A public Blob store is not supported.

Audio is uploaded directly from the browser to Blob with a short-lived token restricted to one generated path, the selected MIME type, and the selected file size (up to 50 MB). This bypasses Vercel Functions' 4.5 MB request-body limit. The server verifies the completed upload before creating the listening link. Audio streams through the access-checked route with byte-range support; clients never receive the store's read-write token or a public audio URL.

Vercel tracks expire 24 hours after upload completion. Deletion revokes access immediately, removes the audio, and retains a private tombstone until expiry to prevent an in-flight upload from restoring a deleted link. Physical cleanup of expired files and tombstones runs when that sender next loads their tracks or starts an upload. It is not a scheduled purge at exactly 24 hours. Interrupted uploads reserve a slot for 15 minutes.

The Vercel deployment uses its own Blob store and browser cookies. Tracks previously uploaded to the Sites deployment are not migrated. Visitors do not sign in to the app; disable Vercel Deployment Protection on the production deployment if your clients need public access.

For a local Vercel-style preview, place the store token in `.env.local` (see `.env.example`), then run:

```sh
pnpm install --frozen-lockfile
pnpm dev:vercel
```

For production locally:

```sh
pnpm build:vercel
pnpm start:vercel
```

## Local development with Sites / Cloudflare

Use Node.js 22.13+ and the pnpm version declared in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_violet_cerise.sql
pnpm dev
```

Apply the initial migration once per local database, not on every launch. Open the development URL printed in your terminal. Browser ownership uses a Secure, HttpOnly cookie; for local development use localhost (a potentially trustworthy browser context) or HTTPS. A plain HTTP LAN hostname will not preserve the Secure cookie.

Useful commands:

```sh
pnpm exec tsc --noEmit
pnpm build
pnpm start
pnpm db:generate
```

`pnpm start` previews the built Worker locally. It does not deploy it.

## Storage and hosting

The Sites/Cloudflare target requires a Worker runtime with a D1 binding named `DB` and an R2 binding named `BUCKET`. The schema is in `db/schema.ts`, and migrations are in `drizzle/`. The existing Sites deployment provisions and wires these resources through `.openai/hosting.json`.

This GitHub repository stores the application source. Pushing here does not automatically redeploy the existing live site. Static GitHub Pages hosting alone cannot run the upload, database, or streaming endpoints. For Cloudflare hosting, provision the Worker, database, and bucket bindings. For Vercel, follow the separate setup above; Cloudflare bindings are not used there.

Uploaded audio and database contents are not included in this repository.

## Browser ownership and expiry

An unguessable browser cookie identifies the uploader without an account. Keep using the same browser, and retain its cookies, to list and end your links. Clearing cookies removes management access; already-shared links still expire normally. There is a limit of 10 active uploads per browser identity.

Links become inaccessible after 24 hours. Expired records and objects are removed opportunistically during subsequent upload/list requests; this version does not schedule physical deletion at the exact expiry second.

## Source layout

- `app/studio.tsx`: uploader and link management
- `app/shared.tsx`: player and shared UI
- `app/listener.tsx`: public listening room
- `app/api/tracks/`: upload, listing, metadata, deletion and streaming endpoints
- `lib/browser-owner.ts`: anonymous browser ownership
- `lib/audio-range.ts`: byte-range parsing
- `lib/storage.ts`: Cloudflare database and object storage access
- `lib/platform/vercel-api.ts`: Vercel Blob upload, metadata, deletion, and streaming handlers
- `lib/platform/cloudflare-api.ts`: existing Worker API implementation
- `lib/track-api.ts`: hosting adapter selected at build time
- `lib/direct-upload.ts`: direct browser-to-Blob upload client
- `vercel.json` / `next.config.ts`: native Vercel build configuration
- `db/` and `drizzle/`: schema and migrations

## Validation

The exported application previously passed TypeScript checking, a production build, and local Worker checks for anonymous uploads, isolated browser lists, ownership enforcement, cross-origin deletion protection, streaming ranges, and expiry.

## Robotic voice watermark

Enable the watermark after selecting an audio file, enter an English message (up to 120 characters), and choose Auto placement or comma-separated timestamps such as `0:15, 1:10, 2:30`. Auto placement starts around 10 seconds and repeats about every 45 seconds; short tracks adapt automatically. Manual placements must leave room for the whole message and cannot overlap.

Adjust the voice volume and optionally lower the music while the voice speaks. Choose **Prepare watermarked preview**, listen to the result, then create the link. Changing the file or settings invalidates the preview and requires preparing it again. Preparation can be cancelled.

The browser generates robotic speech with meSpeak/eSpeak, mixes it into PCM, and encodes a 192 kbps MP3 in a background worker. Only the finished mixed MP3 is uploaded; the original is not uploaded when watermarking is enabled. It is not a separate browser speech overlay. The sender's original file is unchanged. This is an audible deterrent, not DRM.

Watermarking supports mono/stereo tracks up to 10 minutes and needs enough browser memory to decode the track. Ordinary uploads retain their existing limits. No paid speech service, API key, microphone access, or account is required.

Delete is available beside each active track in the uploader's original browser. The server revokes access before deleting the audio object and metadata. Already-open listener pages recheck access every five seconds and stop playback when they detect deletion. Previously captured audio cannot be recalled.

### Audio verification

After either production build, run:

```sh
node --experimental-strip-types tests/watermark.test.mjs
node --experimental-strip-types tests/vercel-api.test.mjs
```

The test exercises the production worker, robotic speech synthesis, real MP3 output, stereo mixing, music ducking, automatic placement and invalid/overlapping/out-of-bounds timestamp handling. Additional local Worker checks verified that only the uploaded mixed MP3 is served and that deleting a track removes its stored object and rejects subsequent playback requests.

### Third-party audio code

Audio dependency notices and source links are in `public/licenses/README.txt`. The files under `lib/audio` are available under GPL-3.0-or-later; meSpeak and the MP3 encoder retain their upstream licenses. The build loader reads the eSpeak source using its original Latin-1 comment encoding.

The Vercel API checks use an in-memory private-store test double to verify scoped upload tokens, ownership isolation, byte ranges, expiry, deletion, and concurrent upload/deletion behavior. They do not provision or test a live Vercel Blob account.
