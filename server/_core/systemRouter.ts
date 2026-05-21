import { z } from "zod";
import { getLLMHealth, invokeLLM } from "./llm";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  aiHealth: publicProcedure
    .input(
      z
        .object({
          ping: z.boolean().optional().default(false),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const health = getLLMHealth();

      if (!input?.ping || !health.ok) {
        return health;
      }

      try {
        await invokeLLM({
          messages: [
            { role: "system", content: "Reply with OK only." },
            { role: "user", content: "Health check" },
          ],
          max_tokens: 8,
        });
        return { ...health, pingOk: true };
      } catch (error) {
        return {
          ...health,
          ok: false,
          pingOk: false,
          error: error instanceof Error ? error.message : "Azure OpenAI ping failed",
        };
      }
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
