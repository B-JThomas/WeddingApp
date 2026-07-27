import { getStore } from "@netlify/blobs";

const stateKey = "wedding-review-state";
const people = new Set(["Bailey", "Chloe"]);

function store() {
  return getStore({ name: "last-dance", consistency: "strong" });
}

function response(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function readState() {
  return store().get(stateKey, { type: "json", consistency: "strong" });
}

function validSongs(value) {
  return Array.isArray(value) && value.every((song) => song && typeof song.id === "string" && typeof song.artist === "string" && typeof song.title === "string");
}

const handler = async (request) => {
  if (request.method === "GET") return response({ state: await readState() });
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

  let action;
  try { action = await request.json(); } catch { return response({ error: "Invalid request" }, 400); }

  const current = await readState();
  if (action.type === "initialise") {
    if (!validSongs(action.state?.songs) || typeof action.state?.votes !== "object") return response({ error: "Invalid state" }, 400);
    const state = current ?? { songs: action.state.songs, votes: action.state.votes };
    if (!current) await store().setJSON(stateKey, state);
    return response({ state });
  }

  if (!current) return response({ error: "Shared review is not ready yet" }, 409);

  if (action.type === "vote") {
    if (typeof action.songId !== "string" || !people.has(action.person) || !["yes", "no"].includes(action.value)) return response({ error: "Invalid vote" }, 400);
    const votes = { ...current.votes, [action.songId]: { ...(current.votes?.[action.songId] ?? {}), [action.person]: action.value } };
    const state = { ...current, votes };
    await store().setJSON(stateKey, state);
    return response({ state });
  }

  if (action.type === "setlist") {
    if (!validSongs(action.songs)) return response({ error: "Invalid setlist" }, 400);
    const songIds = new Set(action.songs.map((song) => song.id));
    const votes = Object.fromEntries(Object.entries(current.votes ?? {}).filter(([id]) => songIds.has(id)));
    const state = { songs: action.songs, votes };
    await store().setJSON(stateKey, state);
    return response({ state });
  }

  return response({ error: "Unknown action" }, 400);
};

export default handler;
