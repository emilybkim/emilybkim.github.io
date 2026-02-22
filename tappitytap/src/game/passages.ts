export const passages = [
  {
    text: "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness.",
    source: "A Tale of Two Cities — Charles Dickens",
  },
  {
    text: "Call me Ishmael. Some years ago, having little money in my purse and nothing to interest me on shore, I went to sea.",
    source: "Moby Dick — Herman Melville",
  },
  {
    text: "In the beginning God created the heaven and the earth. And the earth was without form, and void.",
    source: "Genesis 1:1 — King James Bible",
  },
  {
    text: "It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.",
    source: "Pride and Prejudice — Jane Austen",
  },
  {
    text: "All happy families are alike; each unhappy family is unhappy in its own way. Everything was in confusion.",
    source: "Anna Karenina — Leo Tolstoy",
  },
  {
    text: "The quick brown fox jumps over the lazy dog near the riverbank on a warm summer afternoon by the old mill.",
    source: "Classic pangram, extended",
  },
  {
    text: "There is nothing either good or bad, but thinking makes it so. To me it is a prison. Well, then it is one.",
    source: "Hamlet — William Shakespeare",
  },
  {
    text: "Real-time sync makes apps feel alive. Data flows like water between every connected device in the world.",
    source: "Durable Streams",
  },
  {
    text: "I went to the woods because I wished to live deliberately, to front only the essential facts of life.",
    source: "Walden — Henry David Thoreau",
  },
  {
    text: "Two roads diverged in a wood, and I took the one less traveled by, and that has made all the difference.",
    source: "The Road Not Taken — Robert Frost",
  },
  {
    text: "We hold these truths to be self-evident, that all men are created equal and endowed with certain rights.",
    source: "Declaration of Independence, adapted",
  },
  {
    text: "Now is the winter of our discontent made glorious summer by this sun of York, and all the clouds that loured.",
    source: "Richard III — William Shakespeare",
  },
]

export function getRandomPassage() {
  return passages[Math.floor(Math.random() * passages.length)]
}
