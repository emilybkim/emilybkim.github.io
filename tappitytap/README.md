# TappityTap

A multiplayer typing race game built to demonstrate real-time sync with [Durable Streams](https://github.com/durable-streams/durable-streams) and [TanStack DB](https://tanstack.com/db). Players race to type literary passages as fast as possible, competing head-to-head across browser windows with live progress bars, WPM tracking, and instant results.

## Why This Exists

TappityTap was built as a demo for [Kyle's Playbook](https://github.com/KyleAMathews/kpb) (KPB) — a starter template designed for agent-driven development with pre-installed playbooks for Electric, TanStack DB, and Durable Streams. This app exercises the **Durable Streams** and **Durable State** playbooks to show how a real-time multiplayer app comes together using those patterns.

The playbooks provide structured skill documents that AI coding agents can reference when implementing features. TappityTap was built entirely through this workflow — an AI agent following the Durable Streams and Durable State playbook skills to wire up real-time sync, optimistic updates, and reactive queries.

## How It Works

### Architecture

```
Browser Tab A                    Browser Tab B
     │                                │
     │  optimistic update             │  optimistic update
     ▼                                ▼
┌──────────┐                    ┌──────────┐
│ StreamDB │                    │ StreamDB │
│ (local)  │                    │ (local)  │
└────┬─────┘                    └────┬─────┘
     │ append                        │ append
     ▼                               ▼
┌─────────────────────────────────────────┐
│         Durable Stream (cloud)          │
│     append-only log + long-poll         │
└─────────────────────────────────────────┘
     │                               │
     │ live subscription             │ live subscription
     ▼                               ▼
┌──────────┐                    ┌──────────┐
│ TanStack │                    │ TanStack │
│ DB       │◄──── reactive ────►│ DB       │
│ queries  │      sync          │ queries  │
└──────────┘                    └──────────┘
```

### Data Flow

1. **StreamDB** (`src/db/stream.ts`) creates a global singleton backed by a Durable Stream on Electric Cloud. Three collections are defined — `games`, `players`, and `progress` — each with Zod schemas and optimistic actions.

2. **Actions** use the upsert pattern: `onMutate` applies changes instantly to the local TanStack DB collection (optimistic update), while `mutationFn` appends the event to the Durable Stream and waits for transaction confirmation via `awaitTxId`.

3. **Live queries** (`useLiveQuery` from `@tanstack/react-db`) reactively subscribe to collection changes. When the stream delivers updates from other players, the local collections update and all queries re-evaluate automatically.

4. **Cross-window sync** happens through a React effect that watches the game's `status` field. When one player starts a countdown or finishes typing, the status change propagates through the stream to all connected windows, triggering local phase transitions.

### Key Patterns from the Playbook

- **Global StreamDB singleton** — created once at module scope, shared across all components
- **Preload before render** — `db.preload()` called in `App.tsx` before mounting `GamePage`
- **Optimistic actions** — `onMutate` for instant local feedback, `mutationFn` for durable persistence
- **Reactive queries with filtering** — `useLiveQuery` with `eq()` filters for session-scoped data
- **Session isolation** — each game session gets a unique `sessionId` so historical stream data from old games doesn't bleed through

## Game Flow

1. **Join** — Enter a name (or accept the random one) and click "Join Race"
2. **Lobby** — See other players join in real-time. Click "I'm Ready" to start the countdown
3. **Countdown** — 10-second countdown synced across all windows
4. **Race** — Type the displayed passage. Progress bars and WPM update live for all players
5. **Results** — When any player finishes, the game ends for everyone. Winner announced with final stats
6. **Play Again** — Starts a fresh session

In single-player mode, **SpeedBot** joins as an AI opponent racing at ~55 WPM.

## Tech Stack

- **React 19** + TypeScript
- **Vite** — dev server with proxy to Electric Cloud
- **Radix UI Themes** — dark theme component library
- **@durable-streams/client** + **@durable-streams/state** — stream client and state protocol
- **@tanstack/db** + **@tanstack/react-db** — reactive client-side database
- **Zod** — schema validation

## Project Structure

```
src/
├── App.tsx              # Entry point, stream preloading
├── GamePage.tsx         # Main game UI and logic (~650 lines)
├── db/
│   ├── schema.ts        # Zod schemas for Game, Player, Progress
│   └── stream.ts        # StreamDB singleton, actions, state schema
├── game/
│   ├── constants.ts     # Game config, player name generator, SpeedBot settings
│   ├── passages.ts      # Literary passages for typing races
│   └── lifecycle.ts     # Console testing helpers
├── App.css              # Custom styles
└── index.css            # Base styles
```

## Development

```bash
npm install
npm run dev
```

The Vite dev server proxies `/api/stream` to the Durable Stream on Electric Cloud, injecting auth headers automatically. No local stream server needed for development.

## Credits

Built with [Kyle's Playbook](https://github.com/KyleAMathews/kpb) and [Claude Code](https://claude.com/claude-code).
