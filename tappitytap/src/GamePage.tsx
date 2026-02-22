import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Container, Flex, Heading, Text, Button, Card, Badge, TextField,
  Avatar, Separator,
} from '@radix-ui/themes'
import { useLiveQuery } from '@tanstack/react-db'
import { eq } from '@tanstack/db'
import { streamDb } from './db/stream'
import {
  GAME_ROOM_ID, COUNTDOWN_SECONDS, generatePlayerName, generateAvatar,
  SPEEDBOT_ID, SPEEDBOT_NAME, SPEEDBOT_AVATAR, SPEEDBOT_BASE_WPM, SPEEDBOT_WPM_VARIANCE,
} from './game/constants'
import { getRandomPassage } from './game/passages'
import type { Game, Player } from './db/schema'
import './App.css'

type GamePhase = 'joining' | 'lobby' | 'countdown' | 'racing' | 'results'

export function GamePage() {
  // ─── Local UI state ───────────────────────────────────────────────
  const [phase, setPhase] = useState<GamePhase>('joining')
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState(generatePlayerName())
  const [playerAvatar] = useState(generateAvatar())

  // Timing
  const [countdownStartedAt, setCountdownStartedAt] = useState<number | null>(null)
  const [raceStartedAt, setRaceStartedAt] = useState<number | null>(null)

  // Typing
  const [typed, setTyped] = useState<string[]>([])
  const typedRef = useRef<string[]>([])

  // SpeedBot (local-only, not synced — only used when racing solo)
  const [botProgress, setBotProgress] = useState<{
    position: number; wpm: number; errors: number; charactersTyped: number; finishedAt: string | null
  } | null>(null)
  const speedBotInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMultiplayer = useRef(false)
  const startSpeedBotRef = useRef<() => void>(() => {})

  // ─── Live queries from StreamDB collections ───────────────────────
  const { data: games } = useLiveQuery((q) =>
    q.from({ games: streamDb.collections.games })
      .where(({ games }) => eq(games.id, GAME_ROOM_ID))
  )
  const game: Game | undefined = games?.[0]

  const { data: allPlayers } = useLiveQuery((q) =>
    q.from({ players: streamDb.collections.players })
  )

  const { data: allProgress } = useLiveQuery((q) =>
    q.from({ progress: streamDb.collections.progress })
  )

  // Filter players to only those in the current game session
  const players = useMemo(() => {
    if (!game || !allPlayers) return []
    return allPlayers.filter((p) => p.sessionId === game.sessionId)
  }, [allPlayers, game?.sessionId])

  // Memoize raceText from the game object
  const raceText = useMemo(() => {
    if (game) return { text: game.textContent, source: game.textSource }
    return { text: '', source: '' }
  }, [game?.textContent, game?.textSource])

  // ─── Join ─────────────────────────────────────────────────────────

  const handleJoin = useCallback(() => {
    const id = crypto.randomUUID()
    const sid = crypto.randomUUID()
    setPlayerId(id)

    const player: Player = {
      id,
      name: playerName,
      avatar: playerAvatar,
      isReady: false,
      isSpectator: false,
      joinedAt: new Date().toISOString(),
      sessionId: sid,
    }

    if (game && (game.status === 'waiting' || game.status === 'countdown')) {
      player.sessionId = game.sessionId
      streamDb.actions.upsertPlayer(player)
    } else {
      const passage = getRandomPassage()
      const newGame: Game = {
        id: GAME_ROOM_ID,
        status: 'waiting',
        textContent: passage.text,
        textSource: passage.source,
        countdownStartedAt: null,
        startedAt: null,
        finishedAt: null,
        sessionId: sid,
      }
      streamDb.actions.upsertGame(newGame)
      streamDb.actions.upsertPlayer(player)
    }

    setPhase('lobby')
  }, [playerName, playerAvatar, game])

  // ─── Ready toggle ─────────────────────────────────────────────────

  const handleReady = useCallback(() => {
    if (!playerId || !players) return

    const me = players.find((p) => p.id === playerId)
    if (!me) return

    const nowReady = !me.isReady
    streamDb.actions.upsertPlayer({ ...me, isReady: nowReady })

    if (nowReady && game) {
      if (game.status === 'waiting') {
        // First player to ready — start the countdown
        setPhase('countdown')
        setCountdownStartedAt(Date.now())
        streamDb.actions.upsertGame({
          ...game,
          status: 'countdown',
          countdownStartedAt: new Date().toISOString(),
        })
      } else if (game.status === 'countdown' && phase === 'lobby') {
        // Countdown already started by another player — join it
        setPhase('countdown')
        const started = game.countdownStartedAt
          ? new Date(game.countdownStartedAt).getTime()
          : Date.now()
        setCountdownStartedAt(started)
      }
    }
  }, [playerId, players, game, phase])

  // ─── Sync stream game status → local phase ──────────────────────
  // When another player changes the game status (e.g., starts countdown),
  // this effect transitions the local phase to match.

  useEffect(() => {
    if (!game || phase === 'joining') return

    if (game.status === 'countdown' && phase === 'lobby') {
      // Don't auto-transition — let the player see the lobby and click "I'm Ready"
      // The handleReady function has a countdown-join branch that will handle this
    } else if (game.status === 'active' && (phase === 'lobby' || phase === 'countdown')) {
      // Late joiner or missed countdown — jump straight to racing
      setPhase('racing')
      const started = game.startedAt
        ? new Date(game.startedAt).getTime()
        : Date.now()
      setRaceStartedAt(started)
      setTyped([]); typedRef.current = []

      // Auto-ready the player if joining an active race
      if (playerId) {
        const me = (allPlayers ?? []).find((p) => p.id === playerId)
        if (me && !me.isReady) {
          streamDb.actions.upsertPlayer({ ...me, isReady: true })
        }
      }

      // Initialize progress for current player
      if (playerId && game.sessionId) {
        streamDb.actions.upsertProgress({
          id: playerId,
          position: 0,
          wpm: 0,
          errors: 0,
          charactersTyped: 0,
          finishedAt: null,
          sessionId: game.sessionId,
        })
      }
    } else if (game.status === 'finished' && phase === 'racing') {
      // Game ended (another player finished first) — submit final progress with WPM
      // recalculated based on the full race duration (not just when we last typed)
      const currentTyped = typedRef.current
      if (playerId && game.sessionId && raceText.text) {
        const text = raceText.text
        const position = Math.min(100, (currentTyped.length / text.length) * 100)
        const errors = currentTyped.reduce(
          (count, char, i) => count + (i < text.length && char !== text[i] ? 1 : 0),
          0
        )
        // Use the game's finishedAt as the end time for WPM calculation
        const raceEnd = game.finishedAt
          ? new Date(game.finishedAt).getTime()
          : Date.now()
        const raceStart = raceStartedAt ?? Date.now()
        const elapsed = (raceEnd - raceStart) / 60_000
        const correctChars = currentTyped.filter((c, i) => i < text.length && c === text[i]).length
        const wpm = elapsed > 0 ? Math.round((correctChars / 5) / elapsed) : 0

        streamDb.actions.upsertProgress({
          id: playerId, position, wpm, errors, charactersTyped: currentTyped.length,
          finishedAt: null, // They didn't finish
          sessionId: game.sessionId,
        })
      }
      setPhase('results')
    }
  }, [game?.status, phase, playerId, raceStartedAt, raceText.text])

  // ─── Countdown timer ──────────────────────────────────────────────

  const [countdownValue, setCountdownValue] = useState(COUNTDOWN_SECONDS)

  useEffect(() => {
    if (phase !== 'countdown' || !countdownStartedAt) return

    const interval = setInterval(() => {
      const elapsed = (Date.now() - countdownStartedAt) / 1000
      const remaining = Math.max(0, COUNTDOWN_SECONDS - elapsed)
      setCountdownValue(Math.ceil(remaining))

      if (remaining <= 0) {
        clearInterval(interval)
        setPhase('racing')
        setRaceStartedAt(Date.now())
        setTyped([]); typedRef.current = []

        // Initialize progress for current player
        if (playerId && game) {
          streamDb.actions.upsertProgress({
            id: playerId,
            position: 0,
            wpm: 0,
            errors: 0,
            charactersTyped: 0,
            finishedAt: null,
            sessionId: game.sessionId,
          })
        }

        // Transition game to active (only if still in countdown — avoid race between windows)
        if (game && game.status === 'countdown') {
          streamDb.actions.upsertGame({
            ...game,
            status: 'active',
            startedAt: new Date().toISOString(),
          })
        }

        startSpeedBotRef.current()
      }
    }, 100)

    return () => clearInterval(interval)
  }, [phase, countdownStartedAt, playerId, game])

  // ─── SpeedBot ─────────────────────────────────────────────────────

  const startSpeedBot = useCallback(() => {
    // Don't start SpeedBot if there are multiple players in the session
    // Use ALL session players (not just ready ones) to be consistent across windows
    if (isMultiplayer.current) return

    const textLength = raceText.text.length
    if (textLength === 0) return

    setBotProgress({ position: 0, wpm: 0, errors: 0, charactersTyped: 0, finishedAt: null })

    const botWpm = SPEEDBOT_BASE_WPM + (Math.random() * SPEEDBOT_WPM_VARIANCE * 2 - SPEEDBOT_WPM_VARIANCE)
    const charsPerMs = (botWpm * 5) / 60_000
    const startTime = Date.now()

    speedBotInterval.current = setInterval(() => {
      const elapsed = Date.now() - startTime
      const currentWpm = botWpm + (Math.random() * 6 - 3)
      const charsTyped = Math.floor(elapsed * charsPerMs)
      const position = Math.min(100, (charsTyped / textLength) * 100)

      setBotProgress({
        position,
        wpm: Math.round(currentWpm),
        errors: 0,
        charactersTyped: Math.min(charsTyped, textLength),
        finishedAt: position >= 100 ? new Date().toISOString() : null,
      })

      if (charsTyped >= textLength) {
        clearInterval(speedBotInterval.current!)
        speedBotInterval.current = null
      }
    }, 150)
  }, [raceText.text])
  startSpeedBotRef.current = startSpeedBot

  // Track multiplayer status — if ≥2 players join the session, it's multiplayer
  useEffect(() => {
    if (players.length > 1) {
      isMultiplayer.current = true
      // Kill SpeedBot if it was already started and another player joined
      if (speedBotInterval.current) {
        clearInterval(speedBotInterval.current)
        speedBotInterval.current = null
        setBotProgress(null)
      }
    } else {
      isMultiplayer.current = false
    }
  }, [players.length])

  useEffect(() => {
    return () => {
      if (speedBotInterval.current) clearInterval(speedBotInterval.current)
    }
  }, [])

  // ─── Typing handler ───────────────────────────────────────────────

  const typingRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (phase !== 'racing' || !playerId || !raceText.text) return
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta' || e.key === 'Tab') return

    if (e.key === 'Backspace') {
      setTyped((prev) => {
        const next = prev.slice(0, -1)
        typedRef.current = next
        return next
      })
      return
    }

    if (e.key.length !== 1) return

    setTyped((prev) => {
      const next = [...prev, e.key]
      typedRef.current = next
      return next
    })
  }, [phase, playerId, raceText.text])

  // Separate effect to handle progress updates and race completion
  // This avoids calling setState (setPhase) inside a setState updater (setTyped)
  useEffect(() => {
    if (phase !== 'racing' || !playerId || !raceText.text || typed.length === 0) return

    const text = raceText.text
    const position = Math.min(100, (typed.length / text.length) * 100)
    const errors = typed.reduce(
      (count, char, i) => count + (i < text.length && char !== text[i] ? 1 : 0),
      0
    )

    const elapsed = raceStartedAt ? (Date.now() - raceStartedAt) / 60_000 : 0
    const correctChars = typed.filter((c, i) => i < text.length && c === text[i]).length
    const wpm = elapsed > 0 ? Math.round((correctChars / 5) / elapsed) : 0

    const finishedAt = typed.length >= text.length && errors === 0 ? new Date().toISOString() : null

    streamDb.actions.upsertProgress({
      id: playerId, position, wpm, errors, charactersTyped: typed.length, finishedAt,
      sessionId: game?.sessionId ?? '',
    })

    if (typed.length >= text.length && errors === 0) {
      // Stop SpeedBot when the race ends
      if (speedBotInterval.current) {
        clearInterval(speedBotInterval.current)
        speedBotInterval.current = null
      }
      setPhase('results')
      if (game && game.status !== 'finished') {
        streamDb.actions.upsertGame({
          ...game,
          status: 'finished',
          finishedAt: new Date().toISOString(),
        })
      }
    }
  }, [typed.length, phase, playerId, raceText.text, raceStartedAt, game])

  useEffect(() => {
    if (phase === 'racing' && typingRef.current) typingRef.current.focus()
  }, [phase])

  // ─── Play Again ───────────────────────────────────────────────────

  const handlePlayAgain = useCallback(() => {
    const newId = crypto.randomUUID()
    const newSid = crypto.randomUUID()
    setPlayerId(newId)
    setTyped([]); typedRef.current = []
    setBotProgress(null)
    setCountdownStartedAt(null)
    setRaceStartedAt(null)
    setCountdownValue(COUNTDOWN_SECONDS)

    if (speedBotInterval.current) {
      clearInterval(speedBotInterval.current)
      speedBotInterval.current = null
    }
    isMultiplayer.current = false

    const passage = getRandomPassage()

    const newGame: Game = {
      id: GAME_ROOM_ID,
      status: 'waiting',
      textContent: passage.text,
      textSource: passage.source,
      countdownStartedAt: null,
      startedAt: null,
      finishedAt: null,
      sessionId: newSid,
    }
    const player: Player = {
      id: newId,
      name: playerName,
      avatar: playerAvatar,
      isReady: false,
      isSpectator: false,
      joinedAt: new Date().toISOString(),
      sessionId: newSid,
    }

    streamDb.actions.upsertGame(newGame)
    streamDb.actions.upsertPlayer(player)
    setPhase('lobby')
  }, [playerName, playerAvatar])

  // ─── Build progress map (synced + bot) ────────────────────────────

  // Filter progress to only current session
  const sessionPlayerIds = useMemo(() => {
    return new Set(players.map((p) => p.id))
  }, [players])

  const progressMap = useMemo(() => {
    const map: Record<string, { position: number; wpm: number; errors: number; charactersTyped: number; finishedAt: string | null }> = {}
    for (const p of allProgress ?? []) {
      // Only include progress for players in the current session
      if (sessionPlayerIds.has(p.id)) {
        map[p.id] = p
      }
    }
    if (botProgress) {
      map[SPEEDBOT_ID] = botProgress
    }
    return map
  }, [allProgress, botProgress, sessionPlayerIds])

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <Container size="2" py="6">
      {phase === 'joining' && (
        <JoinScreen name={playerName} onNameChange={setPlayerName} onJoin={handleJoin} />
      )}
      {phase === 'lobby' && (
        <LobbyScreen
          players={players ?? []}
          currentPlayerId={playerId}
          onReady={handleReady}
        />
      )}
      {phase === 'countdown' && (
        <CountdownScreen value={countdownValue} players={players ?? []} />
      )}
      {phase === 'racing' && (
        <RaceScreen
          text={raceText.text}
          source={raceText.source}
          typed={typed}
          players={players ?? []}
          progressMap={progressMap}
          currentPlayerId={playerId}
          typingRef={typingRef}
          onKeyDown={handleKeyDown}
        />
      )}
      {phase === 'results' && (
        <ResultsScreen
          progressMap={progressMap}
          players={players ?? []}
          raceStartedAt={raceStartedAt}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </Container>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Screen Components
// ═══════════════════════════════════════════════════════════════════════════

function JoinScreen({ name, onNameChange, onJoin }: {
  name: string; onNameChange: (name: string) => void; onJoin: () => void
}) {
  return (
    <Flex direction="column" align="center" gap="6" py="9">
      <Heading size="9">TappityTap</Heading>
      <Text size="4" color="gray">Multiplayer typing race</Text>
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <Flex direction="column" gap="4" p="4">
          <Text size="2" weight="bold">Your name</Text>
          <TextField.Root
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && onJoin()}
            placeholder="Enter your name..."
            autoFocus
          />
          <Button size="3" onClick={onJoin} disabled={!name.trim()}>
            Join Race
          </Button>
        </Flex>
      </Card>
    </Flex>
  )
}

function LobbyScreen({ players, currentPlayerId, onReady }: {
  players: Player[]; currentPlayerId: string | null; onReady: () => void
}) {
  const currentPlayer = players.find((p) => p.id === currentPlayerId)
  const isReady = currentPlayer?.isReady ?? false

  return (
    <Flex direction="column" gap="6">
      <Flex direction="column" align="center" gap="2">
        <Heading size="7">Lobby</Heading>
        <Text color="gray">Waiting for players...</Text>
      </Flex>

      <Flex direction="column" gap="3">
        <Text size="2" weight="bold" color="gray">Players ({players.length})</Text>
        {players.map((p) => (
          <Card key={p.id} className="slide-in">
            <Flex align="center" gap="3" p="2">
              <Avatar fallback={p.avatar} size="3" />
              <Flex direction="column" gap="1" style={{ flex: 1 }}>
                <Text weight="bold">
                  {p.name}
                  {p.id === currentPlayerId && <Text color="gray" size="1"> (you)</Text>}
                </Text>
              </Flex>
              {p.isReady && <Badge color="green" size="2">Ready</Badge>}
            </Flex>
          </Card>
        ))}
      </Flex>

      <Button size="3" onClick={onReady} variant={isReady ? 'soft' : 'solid'} color={isReady ? 'green' : 'cyan'}>
        {isReady ? 'Ready! (click to unready)' : "I'm Ready!"}
      </Button>
    </Flex>
  )
}

function CountdownScreen({ value, players }: { value: number; players: Player[] }) {
  return (
    <Flex direction="column" align="center" gap="6" py="9">
      <Heading size="9" className="countdown-number">{value}</Heading>
      <Text size="4" color="gray">Get ready to type!</Text>
      <Separator size="4" />
      <Flex direction="column" gap="2" style={{ width: '100%', maxWidth: 400 }}>
        {players.filter((p) => p.isReady).map((p) => (
          <Flex key={p.id} align="center" gap="2">
            <Avatar fallback={p.avatar} size="2" />
            <Text size="2">{p.name}</Text>
          </Flex>
        ))}
      </Flex>
    </Flex>
  )
}

type ProgressEntry = { position: number; wpm: number; errors: number; charactersTyped: number; finishedAt: string | null }

function RaceScreen({ text, source, typed, players, progressMap, currentPlayerId, typingRef, onKeyDown }: {
  text: string; source: string; typed: string[]; players: Player[]
  progressMap: Record<string, ProgressEntry>; currentPlayerId: string | null
  typingRef: React.RefObject<HTMLDivElement | null>; onKeyDown: (e: React.KeyboardEvent) => void
}) {
  const getProgress = (id: string): ProgressEntry =>
    progressMap[id] ?? { position: 0, wpm: 0, errors: 0, charactersTyped: 0, finishedAt: null }

  const racers = [
    ...players.filter((p) => p.isReady && !p.isSpectator),
    ...(progressMap[SPEEDBOT_ID]
      ? [{ id: SPEEDBOT_ID, name: SPEEDBOT_NAME, avatar: SPEEDBOT_AVATAR } as Player]
      : []),
  ]

  return (
    <Flex direction="column" gap="4">
      <Flex direction="column" gap="2">
        {racers.map((racer) => {
          const prog = getProgress(racer.id)
          const isSelf = racer.id === currentPlayerId
          const isBot = racer.id === SPEEDBOT_ID
          const barClass = isSelf ? 'race-bar-self' : isBot ? 'race-bar-bot' : 'race-bar-other'
          return (
            <Flex key={racer.id} direction="column" gap="1">
              <Flex align="center" justify="between">
                <Flex align="center" gap="2">
                  <Avatar fallback={racer.avatar} size="1" />
                  <Text size="2" weight={isSelf ? 'bold' : 'regular'}>{racer.name}</Text>
                </Flex>
                <Text size="1" color="gray">{prog.wpm} WPM</Text>
              </Flex>
              <div style={{ width: '100%', height: 36, backgroundColor: 'var(--gray-3)', borderRadius: 6, overflow: 'hidden' }}>
                <div className={`race-bar ${barClass}`} style={{ width: `${prog.position}%`, height: '100%' }} />
              </div>
            </Flex>
          )
        })}
      </Flex>
      <Separator size="4" />
      <div ref={typingRef} className="typing-area passage" tabIndex={0} onKeyDown={onKeyDown}
        onBlur={() => typingRef.current?.focus()}
        style={{ padding: 16, borderRadius: 8, minHeight: 100, cursor: 'text' }}>
        {text.split('').map((char, i) => {
          let cn = 'char-pending'
          if (i < typed.length) cn = typed[i] === char ? 'char-correct' : 'char-error'
          else if (i === typed.length) cn = 'char-current'
          return <span key={i} className={cn}>{char}</span>
        })}
      </div>
      <Text size="1" color="gray" align="center">{source}</Text>
    </Flex>
  )
}

function ResultsScreen({ progressMap, players, raceStartedAt, onPlayAgain }: {
  progressMap: Record<string, ProgressEntry>; players: Player[]
  raceStartedAt: number | null; onPlayAgain: () => void
}) {
  const results = Object.entries(progressMap)
    .map(([id, prog]) => {
      const player = players.find((p) => p.id === id)
      const isBot = id === SPEEDBOT_ID
      const name = player?.name ?? (isBot ? SPEEDBOT_NAME : null)
      const avatar = player?.avatar ?? (isBot ? SPEEDBOT_AVATAR : '?')
      const raceTime = prog.finishedAt && raceStartedAt
        ? (new Date(prog.finishedAt).getTime() - raceStartedAt) / 1000 : null
      return { id, name, avatar, ...prog, raceTime }
    })
    // Filter out unknown entries (stale progress from other sessions)
    .filter((r) => r.name !== null)
    .sort((a, b) => {
      if (a.finishedAt && !b.finishedAt) return -1
      if (!a.finishedAt && b.finishedAt) return 1
      if (a.finishedAt && b.finishedAt) return new Date(a.finishedAt).getTime() - new Date(b.finishedAt).getTime()
      return b.position - a.position
    })

  const medals = ['🥇', '🥈', '🥉']

  return (
    <Flex direction="column" align="center" gap="6" py="6">
      {results.length > 0 && (
        <Flex direction="column" align="center" gap="2">
          <Text size="8" className="trophy">🏆</Text>
          <Heading size="7">{results[0].name} wins!</Heading>
        </Flex>
      )}
      <Card style={{ width: '100%', maxWidth: 500 }}>
        <Flex direction="column" gap="3" p="4">
          <Text size="2" weight="bold" color="gray">Results</Text>
          {results.map((r, i) => (
            <Flex key={r.id} align="center" gap="3">
              <Text size="4">{medals[i] ?? `${i + 1}.`}</Text>
              <Avatar fallback={r.avatar} size="2" />
              <Flex direction="column" style={{ flex: 1 }}>
                <Text weight="bold">{r.name}</Text>
                <Text size="1" color="gray">
                  {r.errors} errors{r.raceTime != null && ` · ${r.raceTime.toFixed(1)}s`}
                </Text>
              </Flex>
              <Badge size="2" color="cyan">{r.wpm} WPM</Badge>
            </Flex>
          ))}
        </Flex>
      </Card>
      <Button size="3" onClick={onPlayAgain}>Play Again</Button>
    </Flex>
  )
}
