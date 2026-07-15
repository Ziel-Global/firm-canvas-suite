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

const supabase = createClient(
  'https://balnwtbjaumviavmpavb.supabase.co',
  'sb_publishable_FgRjx8zOyBcr6D6WaXes5g_XatdKE45',
  { global: { fetch: createSupabaseFetch('sb_publishable_FgRjx8zOyBcr6D6WaXes5g_XatdKE45') } }
);

async function run() {
  const email = 'admin@marlowevance.com';
  const password = 'Marlowe!Vance2026';
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
