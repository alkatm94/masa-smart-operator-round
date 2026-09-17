# MASA Smart Operator Round

Offline-first Progressive Web App for MASA / MARAFIQ pump-station operators. It provides a guided field round, camera evidence, manual/assisted readings, previous-reading comparisons, completion validation, local history, print/PDF reports and CSV/JSON export. It never sends control commands to pumps, valves, PLCs or SCADA.

## Stack

- Next.js-compatible Vinext, React 19 and TypeScript
- Browser IndexedDB persistence (no backend required)
- MediaDevices camera capture with compressed JPEG evidence
- Service worker and web app manifest for offline/PWA use
- Modular browser vision helpers in `lib/vision.ts`
- Responsive MASA identity based on the existing Handover System assets

## Install and run

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal. Demo credentials are pre-filled; any password is accepted in this local first version. Data stays on the current browser/device.

Production verification:

```bash
npm test
npm run lint
npm run build
npm start
```

## Use from iPhone

The development or production server must be reachable over HTTPS from the iPhone (camera access requires a secure context; `localhost` is the desktop-only exception). Open the HTTPS URL in Safari, tap **Share**, choose **Add to Home Screen**, then launch **MASA Round** from the Home Screen. The layout handles iPhone safe areas and standalone display mode.

## Offline storage

Application state, active rounds, readings, notes, settings, calibration records and compressed evidence images are stored in IndexedDB. The service worker caches the application shell and refreshes successful network responses. Settings includes JSON backup, restore and reset controls. Browser storage remains device-local and should be backed up before clearing Safari website data.

## Gauge calibration

Open **Settings → Gauge Calibration**. Enter minimum and maximum readings, minimum and maximum needle angles, choose a unit, use the live angle preview, and save. Calibration records are isolated from the UI so a trained circle/needle detector can use them later. Automatic gauge analysis performs image-quality checks only in this release; every result requires operator confirmation.

## Add stations or equipment

Edit `lib/demo-data.ts`. The `names` array defines stations and the `base()` function defines reusable check points. For production, replace these with per-station records or a synchronization API while keeping the `Station` and `RoundItem` shapes.

## Branding

- Replace `public/masa-logo.png` and `public/marafiq-logo.png` with approved assets using the same filenames.
- Update the brand tokens at the top of `app/globals.css` to customize colors, borders and status treatments.
- PWA icons are `public/icon-192.svg`, `public/icon-512.svg` and `public/favicon.svg`.

## Vision limitations

`lib/vision.ts` provides a modular on-device OCR adapter using the browser Text Detection API when available, image quality checks for poor light/glare/blur, calibrated gauge math, and a basic normalized visual-difference score. Safari support for native OCR varies. Production-grade equipment recognition and analog needle detection require representative, labeled station imagery and validation across the actual meters, lighting, glare and viewing angles. The interface therefore never auto-confirms or invents a reading; manual confirmation remains mandatory.
