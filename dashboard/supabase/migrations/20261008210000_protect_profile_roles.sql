revoke update on public.profiles from authenticated;
grant update (
  full_name,
  phone,
  marketing_opt_in,
  account_type,
  onboarding_completed,
  updated_at
) on public.profiles to authenticated;
