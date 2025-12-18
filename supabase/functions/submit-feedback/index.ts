
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Create Supabase client with service role key to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Create a regular client to verify the user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get the authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      console.error('User error:', userError);
      throw new Error('User not authenticated');
    }

    console.log('Authenticated user:', user.id);

    // Parse the request body
    const { title, description } = await req.json();

    // Validate input
    if (!title || !title.trim()) {
      throw new Error('Title is required');
    }

    if (!description || !description.trim()) {
      throw new Error('Description is required');
    }

    console.log('Inserting feedback for user:', user.id);

    // Use the admin client to insert feedback (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from('feedback')
      .insert({
        sender_id: user.id,
        title: title.trim(),
        description: description.trim(),
        created_at: new Date().toISOString(),
        is_deleted: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    console.log('Feedback inserted successfully:', data);

    return new Response(
      JSON.stringify({
        success: true,
        data,
        message: 'Feedback submitted successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in submit-feedback function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An error occurred',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
