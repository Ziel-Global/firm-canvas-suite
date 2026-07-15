import { createClient } from '@supabase/supabase-js';

function createSupabaseFetch(supabaseKey) {
  return (input, init) => {
    const headers = new Headers(init?.headers || {});
    if (headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }
    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

// Admin client
const supabaseAdmin = createClient(
  'https://balnwtbjaumviavmpavb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0dXlybnB1aXhocmxncmZhZmtpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDAxMDc0NiwiZXhwIjoyMDk5NTg2NzQ2fQ._ETmBkovKpUqTF9X1FcVm3DYzFO3oXq748XNCAL8zp8',
  { global: { fetch: createSupabaseFetch('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0dXlybnB1aXhocmxncmZhZmtpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDAxMDc0NiwiZXhwIjoyMDk5NTg2NzQ2fQ._ETmBkovKpUqTF9X1FcVm3DYzFO3oXq748XNCAL8zp8') } }
);

// Client client
const supabase = createClient(
  'https://balnwtbjaumviavmpavb.supabase.co',
  'sb_publishable_FgRjx8zOyBcr6D6WaXes5g_XatdKE45',
  { global: { fetch: createSupabaseFetch('sb_publishable_FgRjx8zOyBcr6D6WaXes5g_XatdKE45') } }
);

async function run() {
  const email = `test-${Date.now()}@example.com`;
  const password = 'TestPassword123!';
  
  console.log('Creating user...');
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    console.error('Create error:', createError);
    return;
  }
  console.log('Created user id:', created.user.id);

  console.log('Attempting to log in as', email);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Login Failed:', error.message);
  } else {
    console.log('Login Succeeded!', data.user.id);
  }
}

run();
