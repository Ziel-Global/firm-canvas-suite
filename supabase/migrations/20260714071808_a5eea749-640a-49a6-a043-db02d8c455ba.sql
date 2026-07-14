UPDATE auth.users
SET encrypted_password = crypt('Portal!Test2026', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE email IN (
  'test.super_admin@marlowevance.com',
  'test.admin@marlowevance.com',
  'test.senior_lawyer@marlowevance.com',
  'test.junior_lawyer@marlowevance.com',
  'test.support@marlowevance.com',
  'test.client@marlowevance.com'
);