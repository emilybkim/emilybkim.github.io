import { createStateSchema, createStreamDB } from '@durable-streams/state'
import type { ActionDefinition } from '@durable-streams/state'
import { GameSchema, PlayerSchema, ProgressSchema } from './schema'
import type { Game, Player, Progress } from './schema'

// ─── Prevent visibility-based stream pausing ─────────────────────────────────
// The Durable Streams client pauses long-poll when document.hidden === true.
// This is a reasonable optimisation for production, but breaks during testing
// and in any scenario where the tab is backgrounded (e.g., mobile multitasking).
// Override so the stream stays active regardless of tab visibility.
if (typeof document !== 'undefined') {
  Object.defineProperty(document, 'hidden', { get: () => false, configurable: true })
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true })
}

// ─── State schema ────────────────────────────────────────────────────────────

export const schema = createStateSchema({
  games: {
    schema: GameSchema,
    type: 'game',
    primaryKey: 'id',
  },
  players: {
    schema: PlayerSchema,
    type: 'player',
    primaryKey: 'id',
  },
  progress: {
    schema: ProgressSchema,
    type: 'progress',
    primaryKey: 'id',
  },
})

// ─── Stream URL ──────────────────────────────────────────────────────────────

const streamUrl = typeof window !== 'undefined'
  ? `${window.location.origin}/api/stream`
  : 'http://localhost:5173/api/stream'

// ─── StreamDB with actions ───────────────────────────────────────────────────

export const streamDb = createStreamDB({
  streamOptions: {
    url: streamUrl,
    contentType: 'application/json',
  },
  state: schema,
  actions: ({ db, stream }) => ({
    upsertPlayer: {
      onMutate: (player: Player) => {
        if (db.collections.players.has(player.id)) {
          db.collections.players.update(player.id, (draft) => {
            Object.assign(draft, player)
          })
        } else {
          db.collections.players.insert(player)
        }
      },
      mutationFn: async (player: Player) => {
        const txid = crypto.randomUUID()
        await stream.append(JSON.stringify(
          schema.players.upsert({ value: player, headers: { txid } })
        ))
        await db.utils.awaitTxId(txid)
      },
    } satisfies ActionDefinition<Player>,

    upsertGame: {
      onMutate: (game: Game) => {
        if (db.collections.games.has(game.id)) {
          db.collections.games.update(game.id, (draft) => {
            Object.assign(draft, game)
          })
        } else {
          db.collections.games.insert(game)
        }
      },
      mutationFn: async (game: Game) => {
        const txid = crypto.randomUUID()
        await stream.append(JSON.stringify(
          schema.games.upsert({ value: game, headers: { txid } })
        ))
        await db.utils.awaitTxId(txid)
      },
    } satisfies ActionDefinition<Game>,

    upsertProgress: {
      onMutate: (progress: Progress) => {
        if (db.collections.progress.has(progress.id)) {
          db.collections.progress.update(progress.id, (draft) => {
            Object.assign(draft, progress)
          })
        } else {
          db.collections.progress.insert(progress)
        }
      },
      mutationFn: async (progress: Progress) => {
        const txid = crypto.randomUUID()
        await stream.append(JSON.stringify(
          schema.progress.upsert({ value: progress, headers: { txid } })
        ))
        await db.utils.awaitTxId(txid)
      },
    } satisfies ActionDefinition<Progress>,
  }),
})

// ─── Exports ─────────────────────────────────────────────────────────────────

export const preloadStream = () => streamDb.preload()
