export const COUNTDOWN_SECONDS = 15
export const GAME_ROOM_ID = 'tappitytap-room'

const adjectives = [
  'Swift', 'Quick', 'Rapid', 'Nimble', 'Zippy',
  'Blazing', 'Turbo', 'Hyper', 'Sonic', 'Flash',
]

const nouns = [
  'Fingers', 'Typist', 'Coder', 'Hacker', 'Writer',
  'Racer', 'Runner', 'Dasher', 'Tapper', 'Clicker',
]

const avatars = ['⌨️', '🏎️', '🚀', '⚡', '🔥', '💨', '🎯', '🏁', '💻', '🎮']

export function generatePlayerName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  return `${adj} ${noun}`
}

export function generateAvatar(): string {
  return avatars[Math.floor(Math.random() * avatars.length)]
}

export const SPEEDBOT_ID = 'speedbot'
export const SPEEDBOT_NAME = 'SpeedBot'
export const SPEEDBOT_AVATAR = '🤖'
export const SPEEDBOT_BASE_WPM = 55
export const SPEEDBOT_WPM_VARIANCE = 10
