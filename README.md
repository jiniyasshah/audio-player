# Afterhours — Audio Player

A simple audio-sharing website: upload a song, send a listening link, and let clients play and replay it for 24 hours. No sign-in or sign-up is required.

**Live website:** https://afterhours-listen.sanksss.chatgpt.site

## Features

- Drag-and-drop upload, up to 50 MB per file.
- MP3, M4A, WAV, OGG, FLAC and AAC, subject to browser codec support.
- Public, unguessable listening links that expire 24 hours after upload.
- Progressive byte-range streaming, seeking, pause, replay, repeat and volume.
- Server-side expiry checks for metadata and audio requests.
- Browser-specific upload management and the ability to end links early.
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
