import { z } from 'zod'

export const GameSchema = z.object({
  id: z.string(),
  status: z.enum(['waiting', 'countdown', 'active', 'finished']),
  textContent: z.string(),
  textSource: z.string(),
  countdownStartedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  sessionId: z.string(),
})

export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string(),
  isReady: z.boolean(),
  isSpectator: z.boolean(),
  joinedAt: z.string(),
  sessionId: z.string(),
})

export const ProgressSchema = z.object({
  id: z.string(),
  position: z.number(),
  wpm: z.number(),
  errors: z.number(),
  charactersTyped: z.number(),
  finishedAt: z.string().nullable(),
  sessionId: z.string().default(''),
})

export type Game = z.infer<typeof GameSchema>
export type Player = z.infer<typeof PlayerSchema>
export type Progress = z.infer<typeof ProgressSchema>
