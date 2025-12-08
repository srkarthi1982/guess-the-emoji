import type { ActionAPIContext } from "astro:actions";
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import { and, db, eq, EmojiPuzzles, EmojiPuzzleAttempts, EmojiPuzzleSessions } from "astro:db";

function requireUser(context: ActionAPIContext) {
  const locals = context.locals as App.Locals | undefined;
  const user = locals?.user;

  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }

  return user;
}

function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export const server = {
  createPuzzle: defineAction({
    input: z.object({
      emojiSequence: z.string().min(1),
      answer: z.string().min(1),
      hint: z.string().optional(),
      category: z.string().optional(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      language: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const now = new Date();

      const puzzle = {
        id: crypto.randomUUID(),
        userId: user.id,
        emojiSequence: input.emojiSequence,
        answer: input.answer,
        hint: input.hint,
        category: input.category,
        difficulty: input.difficulty,
        language: input.language,
        isSystem: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      } satisfies typeof EmojiPuzzles.$inferInsert;

      await db.insert(EmojiPuzzles).values(puzzle);

      return {
        success: true,
        data: { puzzle },
      };
    },
  }),

  updatePuzzle: defineAction({
    input: z.object({
      id: z.string(),
      emojiSequence: z.string().min(1).optional(),
      answer: z.string().min(1).optional(),
      hint: z.string().optional(),
      category: z.string().optional(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      language: z.string().optional(),
      isActive: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const [puzzle] = await db
        .select()
        .from(EmojiPuzzles)
        .where(and(eq(EmojiPuzzles.id, input.id), eq(EmojiPuzzles.userId, user.id)));

      if (!puzzle) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Puzzle not found.",
        });
      }

      const updates: Partial<typeof EmojiPuzzles.$inferInsert> = {};

      if (input.emojiSequence !== undefined) updates.emojiSequence = input.emojiSequence;
      if (input.answer !== undefined) updates.answer = input.answer;
      if (input.hint !== undefined) updates.hint = input.hint;
      if (input.category !== undefined) updates.category = input.category;
      if (input.difficulty !== undefined) updates.difficulty = input.difficulty;
      if (input.language !== undefined) updates.language = input.language;
      if (input.isActive !== undefined) updates.isActive = input.isActive;

      if (Object.keys(updates).length === 0) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "No updates provided.",
        });
      }

      updates.updatedAt = new Date();

      await db
        .update(EmojiPuzzles)
        .set(updates)
        .where(eq(EmojiPuzzles.id, puzzle.id));

      return {
        success: true,
        data: {
          puzzle: { ...puzzle, ...updates },
        },
      };
    },
  }),

  archivePuzzle: defineAction({
    input: z.object({
      id: z.string(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const [puzzle] = await db
        .select()
        .from(EmojiPuzzles)
        .where(and(eq(EmojiPuzzles.id, input.id), eq(EmojiPuzzles.userId, user.id)));

      if (!puzzle || !puzzle.isActive) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Puzzle not found.",
        });
      }

      await db
        .update(EmojiPuzzles)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(EmojiPuzzles.id, puzzle.id));

      return {
        success: true,
        data: { id: puzzle.id },
      };
    },
  }),

  listMyPuzzles: defineAction({
    input: z.object({
      includeInactive: z.boolean().optional(),
      category: z.string().optional(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(20),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      let where = eq(EmojiPuzzles.userId, user.id);

      if (!input.includeInactive) {
        where = and(where, eq(EmojiPuzzles.isActive, true));
      }

      if (input.category) {
        where = and(where, eq(EmojiPuzzles.category, input.category));
      }

      if (input.difficulty) {
        where = and(where, eq(EmojiPuzzles.difficulty, input.difficulty));
      }

      const offset = (input.page - 1) * input.pageSize;

      const puzzles = await db
        .select()
        .from(EmojiPuzzles)
        .where(where)
        .limit(input.pageSize)
        .offset(offset)
        .orderBy(EmojiPuzzles.createdAt);

      return {
        success: true,
        data: {
          items: puzzles,
          total: puzzles.length,
          page: input.page,
        },
      };
    },
  }),

  startPuzzleSession: defineAction({
    input: z.object({
      mode: z.enum(["practice", "timed"]).optional(),
      totalQuestions: z.number().int().positive().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const now = new Date();

      const session = {
        id: crypto.randomUUID(),
        userId: user.id,
        mode: input.mode,
        createdAt: now,
        endedAt: null,
        totalQuestions: input.totalQuestions,
        correctAnswers: null,
      } satisfies typeof EmojiPuzzleSessions.$inferInsert;

      await db.insert(EmojiPuzzleSessions).values(session);

      return {
        success: true,
        data: { session },
      };
    },
  }),

  endPuzzleSession: defineAction({
    input: z.object({
      sessionId: z.string(),
      totalQuestions: z.number().int().min(0).optional(),
      correctAnswers: z.number().int().min(0).optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const [session] = await db
        .select()
        .from(EmojiPuzzleSessions)
        .where(and(eq(EmojiPuzzleSessions.id, input.sessionId), eq(EmojiPuzzleSessions.userId, user.id)));

      if (!session) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Session not found.",
        });
      }

      if (
        input.totalQuestions !== undefined &&
        input.correctAnswers !== undefined &&
        input.correctAnswers > input.totalQuestions
      ) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Correct answers cannot exceed total questions.",
        });
      }

      await db
        .update(EmojiPuzzleSessions)
        .set({
          endedAt: new Date(),
          totalQuestions: input.totalQuestions ?? session.totalQuestions,
          correctAnswers: input.correctAnswers ?? session.correctAnswers,
        })
        .where(eq(EmojiPuzzleSessions.id, session.id));

      return {
        success: true,
        data: { id: session.id },
      };
    },
  }),

  submitPuzzleAttempt: defineAction({
    input: z.object({
      puzzleId: z.string(),
      sessionId: z.string().optional(),
      guessText: z.string().min(1),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const [puzzle] = await db
        .select()
        .from(EmojiPuzzles)
        .where(eq(EmojiPuzzles.id, input.puzzleId));

      if (!puzzle || !puzzle.isActive) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Puzzle not found.",
        });
      }

      if (puzzle.userId && puzzle.userId !== user.id) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "You cannot access this puzzle.",
        });
      }

      let sessionId: string | null = null;

      if (input.sessionId) {
        const [session] = await db
          .select()
          .from(EmojiPuzzleSessions)
          .where(and(eq(EmojiPuzzleSessions.id, input.sessionId), eq(EmojiPuzzleSessions.userId, user.id)));

        if (!session) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Session not found.",
          });
        }

        sessionId = session.id;
      }

      const isCorrect =
        normalizeAnswer(input.guessText) === normalizeAnswer(puzzle.answer);

      const attempt = {
        id: crypto.randomUUID(),
        sessionId,
        puzzleId: puzzle.id,
        userId: user.id,
        guessText: input.guessText,
        isCorrect,
        createdAt: new Date(),
      } satisfies typeof EmojiPuzzleAttempts.$inferInsert;

      await db.insert(EmojiPuzzleAttempts).values(attempt);

      return {
        success: true,
        data: { attempt },
      };
    },
  }),
};
