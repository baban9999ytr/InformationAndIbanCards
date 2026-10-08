export async function signInWithGoogle(supabaseClient, redirectTo = `${window.location.origin}/dashboard`) {
  if (!supabaseClient) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error) throw error;
  return data;
}
