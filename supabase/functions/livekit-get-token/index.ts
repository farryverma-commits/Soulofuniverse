import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2.1.2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('livekit-get-token request received')

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
      console.error('Auth error in livekit-get-token:', authError)
      return new Response(JSON.stringify({ error: 'Unauthorized', details: authError?.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const { session_id } = await req.json()
    if (!session_id) throw new Error('Session ID is required')

    // 1. Fetch meeting details (use admin to bypass RLS)
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('group_sessions')
      .select('*')
      .eq('id', session_id)
      .single()

    if (sessionError || !session) throw new Error('Session not found')
    if (session.status !== 'live') throw new Response(JSON.stringify({ error: 'Meeting is not live yet' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // 2. Check if user is mentor (host)
    const isMentor = session.mentor_id === user.id

    // 3. If not mentor, check if approved (if required)
    if (!isMentor && session.require_approval) {
      const { data: participant, error: partError } = await supabaseAdmin
        .from('session_participants')
        .select('status')
        .eq('session_id', session_id)
        .eq('user_id', user.id)
        .single()

      if (partError || participant?.status !== 'approved') {
        throw new Error('Approval required to join this meeting')
      }
    }

    // 4. Generate LiveKit token
    const apiKey = Deno.env.get('LIVEKIT_API_KEY')
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')
    const livekitUrl = Deno.env.get('LIVEKIT_URL')

    if (!apiKey || !apiSecret || !livekitUrl) {
      throw new Error('LiveKit configuration missing')
    }

    // Get user profile for name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: profile?.full_name ?? user.email,
    })

    at.addGrant({
      roomJoin: true,
      room: `session_${session_id}`,
      canPublish: true, // Allow publishing by default, UI handles mute
      canSubscribe: true,
      roomAdmin: isMentor,
      canUpdateOwnMetadata: true,
      canUpdateMetadata: isMentor,
    })

    const participantToken = await at.toJwt()

    // Log participant join
    await supabaseAdmin.from('meeting_logs').insert({
      session_id,
      event_type: isMentor ? 'host_joined' : 'participant_joined',
      payload: { user_id: user.id, full_name: profile?.full_name }
    })

    return new Response(
      JSON.stringify({
        server_url: livekitUrl,
        participant_token: participantToken,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error in livekit-get-token:', error)
    return new Response(JSON.stringify({ 
      error: error instanceof Response ? 'ResponseError' : error.message,
      details: error.message 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: error instanceof Response ? error.status : 400,
    })
  }
})
