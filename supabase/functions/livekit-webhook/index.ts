import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import { WebhookReceiver } from "https://esm.sh/livekit-server-sdk@2.1.2"

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const apiKey = Deno.env.get('LIVEKIT_API_KEY')
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')
    
    if (!apiKey || !apiSecret) {
      throw new Error('LiveKit configuration missing')
    }

    const receiver = new WebhookReceiver(apiKey, apiSecret)
    
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')

    const body = await req.text()
    const event = await receiver.receive(body, authHeader)

    // Extract session ID from room name (format: session_UUID)
    const sessionId = event.room?.name?.replace('session_', '')
    
    if (sessionId) {
      const { error } = await supabaseClient
        .from('meeting_logs')
        .insert({
          session_id: sessionId,
          event_type: event.event,
          payload: event
        })
      
      if (error) console.error('Error logging event:', error)

      // Optional: Handle specific events
      // e.g., Update status to 'completed' when room ends
      if (event.event === 'room_finished') {
        await supabaseClient
          .from('group_sessions')
          .update({ status: 'completed' })
          .eq('id', sessionId)
      }
    }

    return new Response('ok', { status: 200 })

  } catch (error) {
    console.error('Webhook error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }
})
