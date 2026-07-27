# Last Dance

A tiny, private wedding-song review app for two people. Import a musician's setlist, listen through it one song at a time, make a quick Yes/No call, and see the shared shortlist when you are both done.

## What works now

- A beautiful mobile-friendly review experience
- Separate choices for Alex and Jamie (rename these in `app/page.tsx`)
- Choices persist in this browser even after refresh
- CSV import using `Artist` and `Title` (common header variations are accepted)
- Duplicate and blank-row removal during import
- Shared results grouped into both yes, different picks, both no, and awaiting vote
- CSV export of the combined results
- Spotify search fallback for every song
- Keyboard shortcuts: Space, Y, N, and Left Arrow

This is intentionally a lightweight, device-local version — ideal for a couple of weeks of setlist choosing without needing accounts, a database, or payments. For use across two separate devices, the small next step would be connecting Firebase Authentication and Firestore; the review UI is already structured around independent votes per person.

## Start it locally

```bash
npm run dev
```

Then open `http://localhost:3000`. To check the production build:

```bash
npm run build
```

## CSV format

```csv
Artist,Title
Fleetwood Mac,Dreams
Nat King Cole,L-O-V-E
```

Keep the file UTF-8 and include an artist and title column. The app accepts common alternatives such as `performer`, `song`, and `track_name`.
