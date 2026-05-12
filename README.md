# ORA Mining Dashboard

Production-style Next.js App Router frontend for an ORA mining dashboard. The app is UI-only for now and uses mock data from `lib/mock-data.json`.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Framer Motion
- Lucide React icons

## Run Locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

## Checks

```bash
npm run lint
npm run build
```

## Structure

- `app/` - App Router pages, layout, and global styles
- `components/` - Reusable dashboard UI components
- `lib/` - Mock data, navigation data, and utilities
