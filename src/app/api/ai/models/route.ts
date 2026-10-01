import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

export interface AiModelOption {
  id: string
  name: string
  context_length?: number
}

const FALLBACK_OPENROUTER_MODELS: AiModelOption[] = [
  { id: 'openai/gpt-4o-mini', name: 'OpenAI: GPT-4o Mini' },
  { id: 'openai/gpt-4o', name: 'OpenAI: GPT-4o' },
  { id: 'anthropic/claude-3.5-haiku', name: 'Anthropic: Claude 3.5 Haiku' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Anthropic: Claude 3.5 Sonnet' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek: DeepSeek V3' },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek: DeepSeek R1' },
  { id: 'google/gemini-2.5-flash', name: 'Google: Gemini 2.5 Flash' },
  { id: 'google/gemini-2.5-pro', name: 'Google: Gemini 2.5 Pro' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Meta: Llama 3.3 70B' },
  { id: 'mistralai/mistral-large-2411', name: 'Mistral: Mistral Large' },
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen: Qwen 2.5 72B' },
]

/**
 * GET /api/ai/models?provider=openrouter
 * Returns available models for the given provider.
 * Fetches dynamic list from OpenRouter with fallback to common models.
 */
export async function GET(request: Request) {
  try {
    await getCurrentAccount()

    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider') || 'openrouter'

    if (provider !== 'openrouter') {
      return NextResponse.json({ models: [] })
    }

    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Content-Type': 'application/json',
        },
        next: { revalidate: 3600 }, // Cache for 1 hour
      })

      if (res.ok) {
        const json = await res.json()
        if (Array.isArray(json?.data) && json.data.length > 0) {
          const models: AiModelOption[] = json.data.map(
            (m: { id: string; name?: string; context_length?: number }) => ({
              id: m.id,
              name: m.name ? `${m.name} (${m.id})` : m.id,
              context_length: m.context_length,
            }),
          )

          // Pin popular models to top
          const popularIds = new Set(FALLBACK_OPENROUTER_MODELS.map((m) => m.id))
          const prioritized = models.filter((m) => popularIds.has(m.id))
          const others = models.filter((m) => !popularIds.has(m.id))

          return NextResponse.json({
            models: [...prioritized, ...others],
          })
        }
      }
    } catch (err) {
      console.warn('[ai/models] Failed to fetch dynamic models from OpenRouter, using fallback list:', err)
    }

    return NextResponse.json({ models: FALLBACK_OPENROUTER_MODELS })
  } catch (err) {
    return toErrorResponse(err)
  }
}
