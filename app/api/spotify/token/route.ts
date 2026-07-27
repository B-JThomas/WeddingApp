const tokenUrl = "https://accounts.spotify.com/api/token";

export async function POST(request: Request) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return Response.json({ error: "Spotify server configuration is missing." }, { status: 500 });

  const payload = (await request.json()) as { code?: string; codeVerifier?: string; redirectUri?: string };
  if (!payload.code || !payload.codeVerifier || !payload.redirectUri) return Response.json({ error: "Invalid Spotify sign-in request." }, { status: 400 });

  const body = new URLSearchParams({ grant_type: "authorization_code", code: payload.code, redirect_uri: payload.redirectUri, code_verifier: payload.codeVerifier });
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch(tokenUrl, { method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
  const result = await response.text();
  return new Response(result, { status: response.status, headers: { "Content-Type": "application/json" } });
}
