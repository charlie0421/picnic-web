// Synthetic verified actor boundary only; this does not exercise GoTrue,
// getUser token verification, cookies, login, logout or session refresh.
let actor: string | null = null;

export function selectFixtureActor(value: string | null) {
  actor = value;
}

export async function createSupabaseServerClient() {
  return { auth: { async getUser() {
    return { data: { user: actor === null ? null : { id: actor } }, error: null };
  } } };
}
