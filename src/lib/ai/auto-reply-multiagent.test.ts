import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: unknown) => ({ body, init }),
  },
  after: (cb: () => unknown) => cb(),
}))

const h = vi.hoisted(() => ({
  loadAiConfig: vi.fn(),
  buildConversationContext: vi.fn(),
  retrieveKnowledge: vi.fn(),
  generateReply: vi.fn(),
  engineSendText: vi.fn(),
  loadAccountMetaCredentials: vi.fn(),
  sendTypingIndicator: vi.fn(),
  state: {
    conv: null as Record<string, unknown> | null,
    autoResponders: [] as { id: string }[],
    claim: true as boolean,
    updatePayload: null as Record<string, unknown> | null,
    rpcCalls: [] as { name: string; args: unknown }[],
    supportAgent: null as Record<string, unknown> | null,
    contactTags: [] as { id: string }[],
  },
}))

vi.mock('./config', () => ({ loadAiConfig: h.loadAiConfig }))
vi.mock('./context', () => ({ buildConversationContext: h.buildConversationContext }))
vi.mock('./knowledge', () => ({ retrieveKnowledge: h.retrieveKnowledge }))
vi.mock('./generate', () => ({ generateReply: h.generateReply }))
vi.mock('@/lib/flows/meta-send', () => ({
  engineSendText: h.engineSendText,
  loadAccountMetaCredentials: h.loadAccountMetaCredentials,
}))
vi.mock('@/lib/whatsapp/meta-api', () => ({
  sendTypingIndicator: h.sendTypingIndicator,
}))

vi.mock('./admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'automations') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          limit: () => Promise.resolve({ data: h.state.autoResponders, error: null }),
        }
        return chain
      }

      if (table === 'ai_agents') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: h.state.supportAgent, error: null }),
              }),
            }),
          }),
        }
      }

      if (table === 'contact_tags') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                ilike: () => ({
                  limit: () => Promise.resolve({ data: h.state.contactTags, error: null }),
                }),
              }),
            }),
          }),
          upsert: () => Promise.resolve({ error: null }),
        }
      }

      if (table === 'tags') {
        return {
          select: () => ({
            eq: () => ({
              ilike: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: 'tag-cliente-uuid' }, error: null }),
              }),
            }),
          }),
        }
      }

      if (table === 'support_sessions') {
        return {
          select: () => ({
            eq: () => ({
              ilike: () => ({
                is: () => ({
                  gt: () => ({
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
              is: () => ({
                gt: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }
      }

      // conversations
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: h.state.conv, error: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          h.state.updatePayload = payload
          return { eq: () => Promise.resolve({ error: null }) }
        },
      }
    },
    rpc: (name: string, args: unknown) => {
      h.state.rpcCalls.push({ name, args })
      return Promise.resolve({ data: h.state.claim, error: null })
    },
  }),
}))

import { dispatchInboundToAiReply } from './auto-reply'

describe('multi-agent auto-reply routing', () => {
  beforeEach(() => {
    h.loadAiConfig.mockReset()
    h.buildConversationContext.mockReset()
    h.retrieveKnowledge.mockReset()
    h.generateReply.mockReset()
    h.engineSendText.mockReset()

    h.state.conv = {
      assigned_agent_id: null,
      ai_autoreply_disabled: false,
      ai_reply_count: 0,
      active_agent_since: null,
    }
    h.state.autoResponders = []
    h.state.claim = true
    h.state.updatePayload = null
    h.state.rpcCalls = []
    h.state.supportAgent = {
      id: 'agent-support-uuid',
      account_id: 'acct-1',
      slug: 'support',
      name: 'Soporte',
      system_prompt: 'Eres el agente de Soporte Técnico LEGMA.',
      model: null,
      is_active: true,
      auto_reply_enabled: true,
      auto_reply_max_per_conversation: 4,
      handoff_agent_id: 'user-support-uuid',
      trigger_phrases: ['requiero soporte', 'ref: sop-legma'],
      session_ttl_hours: 24,
    }
    h.state.contactTags = []

    h.loadAiConfig.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      apiKey: 'sk-test',
      systemPrompt: 'Eres el agente de Ventas.',
      isActive: true,
      autoReplyEnabled: true,
      autoReplyMaxPerConversation: 3,
      handoffAgentId: 'user-sales-uuid',
      embeddingsApiKey: null,
    })
    h.buildConversationContext.mockResolvedValue([
      { role: 'user', content: 'Hola' },
    ])
    h.retrieveKnowledge.mockResolvedValue([])
    h.generateReply.mockResolvedValue({ text: 'Respuesta generada', handoff: false, usage: null })
  })

  it('routes to Support agent when trigger phrase is present and applies Support config', async () => {
    await dispatchInboundToAiReply({
      accountId: 'acct-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      configOwnerUserId: 'admin-1',
      inboundText: 'Hola requiero soporte con mi cuenta',
    })

    expect(h.generateReply).toHaveBeenCalledTimes(1)
    const callArgs = h.generateReply.mock.calls[0][0]
    expect(callArgs.systemPrompt).toContain('Eres el agente de Soporte Técnico LEGMA.')
    expect(callArgs.config.handoffAgentId).toBe('user-support-uuid')

    // Claim slot with Support max replies (4)
    const claimCall = h.state.rpcCalls.find((r) => r.name === 'claim_ai_reply_slot')
    expect(claimCall?.args).toMatchObject({ max_replies: 4 })

    expect(h.engineSendText).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        text: 'Respuesta generada',
        aiGenerated: true,
      }),
    )
  })

  it('leaves message in inbox without replying when contact has Cliente tag and writes directly', async () => {
    h.state.contactTags = [{ id: 'ct-1' }] // Tagged Cliente

    await dispatchInboundToAiReply({
      accountId: 'acct-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      configOwnerUserId: 'admin-1',
      inboundText: 'Hola, tengo una duda sobre mi reporte anterior',
    })

    // Neither support nor sales bot should reply!
    expect(h.generateReply).not.toHaveBeenCalled()
    expect(h.engineSendText).not.toHaveBeenCalled()
  })

  it('routes ordinary lead to Sales agent with sales prompt and cap', async () => {
    h.state.contactTags = [] // No Cliente tag

    await dispatchInboundToAiReply({
      accountId: 'acct-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      configOwnerUserId: 'admin-1',
      inboundText: 'Hola, me gustaría saber precios y planes',
    })

    expect(h.generateReply).toHaveBeenCalledTimes(1)
    const callArgs = h.generateReply.mock.calls[0][0]
    expect(callArgs.systemPrompt).toContain('Eres el agente de Ventas.')
    expect(callArgs.config.handoffAgentId).toBe('user-sales-uuid')

    const claimCall = h.state.rpcCalls.find((r) => r.name === 'claim_ai_reply_slot')
    expect(claimCall?.args).toMatchObject({ max_replies: 3 })
    expect(h.engineSendText).toHaveBeenCalledTimes(1)
  })
})

