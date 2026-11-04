import type { GoogleGenAI } from '@google/genai';
import { performance } from 'node:perf_hooks';

// Leave 15 seconds of Hosting's 60-second limit for authentication and transport.
export const AI_GENERATION_BUDGET_MS = 45_000;
export class AiGenerationTimeout extends Error {
  constructor() { super('AI generation deadline exceeded'); this.name = 'AiGenerationTimeout'; }
}

export async function generateWithModelFallback(
  ai: Pick<GoogleGenAI, 'models'>,
  options: Parameters<GoogleGenAI['models']['generateContent']>[0],
  budgetMs = AI_GENERATION_BUDGET_MS,
) {
  const deadline = performance.now() + budgetMs;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new AiGenerationTimeout());
      controller.abort();
    }, Math.max(0, budgetMs));
  });
  const models = [options.model || 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-3.5-flash'];
  let lastError: unknown;
  try {
    for (const model of models) {
      const remaining = Math.floor(deadline - performance.now());
      if (remaining <= 0 || controller.signal.aborted) throw new AiGenerationTimeout();
      try {
        return await Promise.race([ai.models.generateContent({
          ...options, model,
          config: {
            ...options.config,
            abortSignal: controller.signal,
            httpOptions: {
              ...options.config?.httpOptions,
              timeout: remaining,
              retryOptions: { attempts: 1 },
            },
          },
        }), timeout]);
      } catch (err: any) {
        if (err instanceof AiGenerationTimeout || controller.signal.aborted || performance.now() >= deadline) {
          throw new AiGenerationTimeout();
        }
        lastError = err;
        const status = err?.status || err?.statusCode ||
          (typeof err?.message === 'string' && err.message.includes('503') ? 503 : null);
        if (status !== 503 && status !== 429) throw err;
      }
    }
    throw lastError;
  } finally {
    clearTimeout(timer!);
    controller.abort();
  }
}
