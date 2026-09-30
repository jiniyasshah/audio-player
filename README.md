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

React 19, TypeScript, Vinext/Vite, Cloudflare Workers, D1 (metadata), R2 (audio), and Drizzle migrations. The source includes the existing Sites build integration.

## Local development

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

The app requires a Worker runtime with a D1 binding named `DB` and an R2 binding named `BUCKET`. The schema is in `db/schema.ts`, and migrations are in `drizzle/`. The existing Sites deployment provisions and wires these resources through `.openai/hosting.json`.

This GitHub repository stores the application source. Pushing here does not automatically redeploy the existing live site. Static GitHub Pages hosting alone cannot run the upload, database, or streaming endpoints. Hosting elsewhere requires provisioning the Worker, database, and bucket and configuring their bindings before deployment.

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
- `lib/storage.ts`: database and object storage access
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

After building, run:

```sh
node --experimental-strip-types tests/watermark.test.mjs
```

The test exercises the production worker, robotic speech synthesis, real MP3 output, stereo mixing, music ducking, automatic placement and invalid/overlapping/out-of-bounds timestamp handling. Additional local Worker checks verified that only the uploaded mixed MP3 is served and that deleting a track removes its stored object and rejects subsequent playback requests.

### Third-party audio code

Audio dependency notices and source links are in `public/licenses/README.txt`. The files under `lib/audio` are available under GPL-3.0-or-later; meSpeak and the MP3 encoder retain their upstream licenses. The build loader reads the eSpeak source using its original Latin-1 comment encoding.
