import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://balnwtbjaumviavmpavb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0dXlybnB1aXhocmxncmZhZmtpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDAxMDc0NiwiZXhwIjoyMDk5NTg2NzQ2fQ._ETmBkovKpUqTF9X1FcVm3DYzFO3oXq748XNCAL8zp8'
);

async function run() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) console.error(error);
  else console.log(data.users.map(u => ({ email: u.email, id: u.id, last_sign_in: u.last_sign_in_at })));
}
run();
