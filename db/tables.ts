/**
 * Guess The Emoji - emoji-based puzzles (guess phrase/title/etc.).
 *
 * Design goals:
 * - Emoji puzzles with answers + hints.
 * - Difficulty & category for grouping (movies, phrases, songs).
 */

import { defineTable, column, NOW } from "astro:db";

export const EmojiPuzzles = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text({ optional: true }),          // null for system puzzles

    emojiSequence: column.text(),                     // e.g. "🚗💨🏁"
    answer: column.text(),
    hint: column.text({ optional: true }),
    category: column.text({ optional: true }),        // "movie", "song", "phrase", etc.
    difficulty: column.text({ optional: true }),      // "easy", "medium", "hard"
    language: column.text({ optional: true }),

    isSystem: column.boolean({ default: false }),
    isActive: column.boolean({ default: true }),

    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
});

export const EmojiPuzzleSessions = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(),

    mode: column.text({ optional: true }),            // "practice", "timed"
    createdAt: column.date({ default: NOW }),
    endedAt: column.date({ optional: true }),

    totalQuestions: column.number({ optional: true }),
    correctAnswers: column.number({ optional: true }),
  },
});

export const EmojiPuzzleAttempts = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    sessionId: column.text({
      references: () => EmojiPuzzleSessions.columns.id,
      optional: true,
    }),
    puzzleId: column.text({
      references: () => EmojiPuzzles.columns.id,
    }),
    userId: column.text({ optional: true }),

    guessText: column.text({ optional: true }),
    isCorrect: column.boolean({ default: false }),
    createdAt: column.date({ default: NOW }),
  },
});

export const tables = {
  EmojiPuzzles,
  EmojiPuzzleSessions,
  EmojiPuzzleAttempts,
} as const;
