import { describe, it, expect, vi } from 'vitest'
import {
  extractSupportCode,
  matchesSupportTriggerPhrases,
  resolveActiveAgent,
  SUPPORT_AGENT_SLUG,
} from './agents'

describe('agents resolver', () => {
  describe('extractSupportCode', () => {
    it('extracts standard SOP code with Ref label', () => {
      expect(extractSupportCode('Hola, necesito ayuda. Ref: SOP-AB12CD')).toBe('SOP-AB12CD')
    })

    it('extracts code without Ref label', () => {
      expect(extractSupportCode('soporte sop-99xyz urgente')).toBe('SOP-99XYZ')
    })

    it('returns null if no code is present', () => {
      expect(extractSupportCode('Hola, quiero información de precios')).toBeNull()
      expect(extractSupportCode('')).toBeNull()
    })
  })

  describe('matchesSupportTriggerPhrases', () => {
    it('matches accent-insensitive and case-insensitive phrases', () => {
      const phrases = ['soporte técnico', 'ayuda vip']
      expect(matchesSupportTriggerPhrases('Hola, requiero SOPORTE TECNICO por favor', phrases)).toBe(true)
      expect(matchesSupportTriggerPhrases('necesito ayuda VIP ahora', phrases)).toBe(true)
      expect(matchesSupportTriggerPhrases('Hola quiero comprar el plan pro', phrases)).toBe(false)
    })
  })

  describe('resolveActiveAgent', () => {
    function mockDb(opts: {
      supportAgent?: Record<string, unknown> | null
      session?: Record<string, unknown> | null
      conv?: Record<string, unknown> | null
      isClientTag?: boolean
    }) {
      const updates: { table: string; payload: unknown }[] = []
      const inserts: { table: string; payload: unknown }[] = []

      const db = {
        from: (table: string) => {
          if (table === 'ai_agents') {
            return {
              select: () => ({
                eq: (_col: string, val: string) => ({
                  eq: (_col2: string, val2: string) => ({
                    maybeSingle: () => Promise.resolve({ data: opts.supportAgent ?? null, error: null }),
                  }),
                  maybeSingle: () => Promise.resolve({ data: opts.supportAgent ?? null, error: null }),
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
                        maybeSingle: () => Promise.resolve({ data: opts.session ?? null, error: null }),
                      }),
                    }),
                  }),
                  is: () => ({
                    gt: () => ({
                      order: () => ({
                        limit: () => Promise.resolve({ data: opts.session ? [opts.session] : [], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
              update: (payload: unknown) => {
                updates.push({ table, payload })
                return { eq: () => Promise.resolve({ error: null }) }
              },
            }
          }

          if (table === 'conversations') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: opts.conv ?? null, error: null }),
                }),
              }),
              update: (payload: unknown) => {
                updates.push({ table, payload })
                return { eq: () => Promise.resolve({ error: null }) }
              },
            }
          }

          if (table === 'contact_tags') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    ilike: () => ({
                      limit: () =>
                        Promise.resolve({
                          data: opts.isClientTag ? [{ id: 'ct-1' }] : [],
                          error: null,
                        }),
                    }),
                  }),
                }),
              }),
              upsert: (payload: unknown) => {
                inserts.push({ table, payload })
                return Promise.resolve({ error: null })
              },
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

          return {
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
          }
        },
        _updates: updates,
        _inserts: inserts,
      }

      return db as any
    }

    const mockSupportAgent = {
      id: 'agent-support-uuid',
      account_id: 'acc-1',
      slug: SUPPORT_AGENT_SLUG,
      name: 'Soporte',
      is_active: true,
      auto_reply_enabled: true,
      auto_reply_max_per_conversation: 4,
      handoff_agent_id: 'user-support-uuid',
      trigger_phrases: ['soporte tecnico', 'boton soporte'],
      session_ttl_hours: 24,
    }

    it('routes explicit support trigger to support agent and resets conversation state', async () => {
      const db = mockDb({
        supportAgent: mockSupportAgent,
      })

      const res = await resolveActiveAgent({
        db,
        accountId: 'acc-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        inboundText: 'Hola requiero boton soporte urgente',
      })

      expect(res.kind).toBe('support')
      if (res.kind === 'support') {
        expect(res.agent.id).toBe('agent-support-uuid')
        expect(res.isNewSession).toBe(true)
      }

      // Check conversation reset
      const convUpdate = db._updates.find((u: any) => u.table === 'conversations')
      expect(convUpdate).toBeDefined()
      expect(convUpdate.payload).toMatchObject({
        active_agent_id: 'agent-support-uuid',
        entry_point: 'support_button',
        ai_reply_count: 0,
        ai_autoreply_disabled: false,
        assigned_agent_id: null,
        ai_handoff_summary: null,
      })

      // Check client tag upsert
      const tagInsert = db._inserts.find((i: any) => i.table === 'contact_tags')
      expect(tagInsert).toBeDefined()
      expect(tagInsert.payload).toMatchObject({
        contact_id: 'contact-1',
        tag_id: 'tag-cliente-uuid',
      })
    })

    it('keeps active support session when within TTL', async () => {
      const db = mockDb({
        supportAgent: mockSupportAgent,
        conv: {
          active_agent_id: 'agent-support-uuid',
          active_agent_since: new Date(Date.now() - 3600 * 1000).toISOString(), // 1h ago
        },
      })

      const res = await resolveActiveAgent({
        db,
        accountId: 'acc-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        inboundText: 'Aún sigo esperando mi acuerdo judicial',
      })

      expect(res.kind).toBe('support')
      if (res.kind === 'support') {
        expect(res.isNewSession).toBe(false)
      }
    })

    it('prevents sales bot from replying if contact has Cliente tag and writes directly', async () => {
      const db = mockDb({
        supportAgent: mockSupportAgent,
        conv: null,
        isClientTag: true,
      })

      const res = await resolveActiveAgent({
        db,
        accountId: 'acc-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        inboundText: 'Hola, tengo una pregunta sobre el sistema',
      })

      expect(res.kind).toBe('client_dormant')
      expect(res.agent).toBeNull()
    })

    it('routes ordinary non-client lead to sales', async () => {
      const db = mockDb({
        supportAgent: mockSupportAgent,
        conv: null,
        isClientTag: false,
      })

      const res = await resolveActiveAgent({
        db,
        accountId: 'acc-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        inboundText: 'Hola, cuánto cuesta el plan mensual?',
      })

      expect(res.kind).toBe('sales')
      expect(res.agent).toBeNull()
    })
  })
})

