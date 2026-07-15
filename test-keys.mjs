import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ttuyrnpuixhrlgrfafki.supabase.co',
  'sb_publishable_FgRjx8zOyBcr6D6WaXes5g_XatdKE45'
);

async function run() {
  const { data, error } = await supabase.from('profiles').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success!', data);
  }
}
run();
