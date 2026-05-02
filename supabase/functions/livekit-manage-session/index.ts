import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import { RoomServiceClient } from "https://esm.sh/livekit-server-sdk@2.1.2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No Authorization header provided')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Explicitly pass the token to getUser
    const accessToken = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(accessToken)
    
    if (authError || !user) {
      console.error('Auth error in livekit-manage-session:', authError)
      return new Response(JSON.stringify({ error: 'Unauthorized', details: authError?.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const { session_id, action } = await req.json()
    if (!session_id || !action) throw new Error('Session ID and action are required')

    // Verify ownership using admin client to ensure we can see the session even if RLS is strict
    const { data: session, error: fetchError } = await supabaseAdmin
      .from('group_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('mentor_id', user.id)
      .single()

    if (fetchError || !session) {
      console.error('Session fetch error:', fetchError)
      throw new Error('Session not found or access denied')
    }

    if (action === 'start') {
      await supabaseAdmin
        .from('group_sessions')
        .update({ status: 'live' })
        .eq('id', session_id)

      // Log meeting start
      await supabaseAdmin.from('meeting_logs').insert({
        session_id,
        event_type: 'session_started',
        payload: { user_id: user.id }
      })

      // Start Recording if enabled
      if (session.is_recorded) {
        // Here you would call LiveKit Egress API
        console.log('Recording started for session:', session_id)
        await supabaseAdmin.from('meeting_logs').insert({
          session_id,
          event_type: 'recording_started_placeholder',
          payload: { user_id: user.id }
        })
      }
    } else if (action === 'end') {
      // 1. Delete the LiveKit room to kick all participants out
      const livekitUrl = Deno.env.get('LIVEKIT_API_URL') ?? ''
      const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY') ?? ''
      const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET') ?? ''
      
      if (livekitUrl && livekitApiKey && livekitApiSecret) {
        try {
          const roomService = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret)
          await roomService.deleteRoom(session_id)
          console.log(`Deleted LiveKit room for session ${session_id}`)
        } catch (err) {
          console.error(`Failed to delete LiveKit room ${session_id}:`, err)
        }
      }

      // 2. Update DB status
      await supabaseAdmin
        .from('group_sessions')
        .update({ status: 'completed' })
        .eq('id', session_id)
        
      // 3. Log meeting end
      await supabaseAdmin.from('meeting_logs').insert({
        session_id,
        event_type: 'session_ended',
        payload: { user_id: user.id }
      })

      console.log('Session ended:', session_id)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error in livekit-manage-session:', error)
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.message 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
