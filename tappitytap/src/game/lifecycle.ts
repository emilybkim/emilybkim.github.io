/**
 * Game lifecycle functions — console-testable, no UI dependency.
 *
 * Open the browser console and try:
 *   TT.join("Alice")
 *   TT.dump()
 */
import { streamDb } from '../db/stream'
import { GAME_ROOM_ID } from './constants'
import { getRandomPassage } from './passages'
import { generatePlayerName, generateAvatar } from './constants'
import type { Game, Player, Progress } from '../db/schema'

let currentPlayerId: string | null = null

export function join(name?: string) {
  const playerId = crypto.randomUUID()
  const sessionId = crypto.randomUUID()
  currentPlayerId = playerId

  const playerName = name || generatePlayerName()
  const avatar = generateAvatar()

  const player: Player = {
    id: playerId,
    name: playerName,
    avatar,
    isReady: false,
    isSpectator: false,
    joinedAt: new Date().toISOString(),
    sessionId,
  }

  const passage = getRandomPassage()
  const game: Game = {
    id: GAME_ROOM_ID,
    status: 'waiting',
    textContent: passage.text,
    textSource: passage.source,
    countdownStartedAt: null,
    startedAt: null,
    finishedAt: null,
    sessionId,
  }

  streamDb.actions.upsertGame(game)
  streamDb.actions.upsertPlayer(player)
  console.log(`[TT] Created game + joined as "${playerName}" (${avatar})`)
  return { playerId, sessionId }
}

export function dump() {
  console.group('[TT] Current State')
  console.log('Player ID:', currentPlayerId)
  try {
    const games = streamDb.collections.games.toArray as Game[]
    console.log('Games:', games)
  } catch { console.log('Games: (empty)') }
  try {
    const players = streamDb.collections.players.toArray as Player[]
    console.log('Players:', players)
  } catch { console.log('Players: (empty)') }
  try {
    const progress = streamDb.collections.progress.toArray as Progress[]
    console.log('Progress:', progress)
  } catch { console.log('Progress: (empty)') }
  console.groupEnd()
}

export const TT = { join, dump, get db() { return streamDb } }
