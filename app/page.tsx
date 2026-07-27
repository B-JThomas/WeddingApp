"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Person = "Alex" | "Jamie";
type VoteValue = "yes" | "no";
type VoteBook = Record<string, Partial<Record<Person, VoteValue>>>;

type Song = {
  id: string;
  artist: string;
  title: string;
  album: string;
  status: "Matched" | "Needs review" | "Unmatched";
  colour: string;
  spotify?: { uri: string; title: string; artist: string; album: string; imageUrl?: string };
};

type SpotifySession = { accessToken: string; refreshToken?: string; expiresAt: number };
type SpotifyPlayer = { connect: () => Promise<boolean>; disconnect: () => void; togglePlay: () => Promise<void>; addListener: (event: string, callback: (payload: { device_id?: string; message?: string }) => void) => boolean };

declare global {
  interface Window {
    Spotify?: { Player: new (options: { name: string; getOAuthToken: (callback: (token: string) => void) => void; volume: number }) => SpotifyPlayer };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

const initialSongs: Song[] = [
  { id: "dreams", artist: "Fleetwood Mac", title: "Dreams", album: "Rumours", status: "Matched", colour: "#c87952" },
  { id: "home", artist: "Edward Sharpe & The Magnetic Zeros", title: "Home", album: "Up From Below", status: "Matched", colour: "#cba33d" },
  { id: "love", artist: "Nat King Cole", title: "L-O-V-E", album: "L-O-V-E", status: "Matched", colour: "#5b9279" },
  { id: "everywhere", artist: "Fleetwood Mac", title: "Everywhere", album: "Tango in the Night", status: "Matched", colour: "#567d9e" },
  { id: "first-day", artist: "Bright Eyes", title: "First Day of My Life", album: "I'm Wide Awake, It's Morning", status: "Needs review", colour: "#ac6b7a" },
  { id: "sun", artist: "The Paper Kites", title: "Bloom", album: "Woodland", status: "Matched", colour: "#76946e" },
];

const people: Person[] = ["Alex", "Jamie"];
const storageKey = "last-dance-review-demo";
const spotifyStorageKey = "last-dance-spotify";
const spotifyClientId = "ce0d964b25884286b8df44eb06b66d1a";

function loadSavedState(): { songs?: Song[]; votes?: VoteBook; person?: Person } {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as { songs?: Song[]; votes?: VoteBook; person?: Person };
  } catch {
    return {};
  }
}

function loadSpotifySession(): SpotifySession | null {
  if (typeof window === "undefined") return null;
  try {
    const session = JSON.parse(sessionStorage.getItem(spotifyStorageKey) ?? "null") as SpotifySession | null;
    return session?.expiresAt && session.expiresAt > Date.now() ? session : null;
  } catch { return null; }
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function randomString(length: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (byte) => alphabet[byte % alphabet.length]).join("");
}

async function codeChallenge(verifier: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function redirectUri() { return `${window.location.origin}/`; }

function classify(song: Song, votes: VoteBook) {
  const pair = votes[song.id] ?? {};
  if (pair.Alex === "yes" && pair.Jamie === "yes") return "Both yes";
  if (pair.Alex && pair.Jamie && pair.Alex === "no" && pair.Jamie === "no") return "Both no";
  if (pair.Alex && pair.Jamie) return "Different picks";
  return "Awaiting vote";
}

function parseSongs(text: string): Song[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const cells = (line: string) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
  const headers = cells(lines[0]).map((header) => header.toLowerCase().replace(/[^a-z]/g, ""));
  const artistIndex = headers.findIndex((header) => ["artist", "artistname", "performer"].includes(header));
  const titleIndex = headers.findIndex((header) => ["title", "song", "songtitle", "track", "trackname"].includes(header));
  if (artistIndex < 0 || titleIndex < 0) return [];
  const seen = new Set<string>();
  return lines.slice(1).flatMap((line, index) => {
    const values = cells(line);
    const artist = values[artistIndex]?.trim();
    const title = values[titleIndex]?.trim();
    const key = slug(`${artist}-${title}`);
    if (!artist || !title || seen.has(key)) return [];
    seen.add(key);
    return [{ id: `${key}-${index}`, artist, title, album: "Your imported setlist", status: "Needs review" as const, colour: ["#9c7860", "#6f8fa0", "#a66c7d", "#78936d"][index % 4] }];
  });
}

export default function Home() {
  const [savedState] = useState(loadSavedState);
  const [songs, setSongs] = useState<Song[]>(savedState.songs?.length ? savedState.songs : initialSongs);
  const [votes, setVotes] = useState<VoteBook>(savedState.votes ?? {});
  const [person, setPerson] = useState<Person>(savedState.person ?? "Alex");
  const [screen, setScreen] = useState<"review" | "results">("review");
  const [currentId, setCurrentId] = useState(() => {
    const restoredSongs = savedState.songs?.length ? savedState.songs : initialSongs;
    const restoredPerson = savedState.person ?? "Alex";
    return restoredSongs.find((song) => !savedState.votes?.[song.id]?.[restoredPerson])?.id ?? restoredSongs[0].id;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("All songs");
  const [spotify, setSpotify] = useState<SpotifySession | null>(loadSpotifySession);
  const [deviceId, setDeviceId] = useState("");
  const playerRef = useRef<SpotifyPlayer | null>(null);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify({ songs, votes, person }));
  }, [songs, votes, person]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const verifier = sessionStorage.getItem("spotify-verifier");
    if (!code || !verifier || state !== sessionStorage.getItem("spotify-state")) return;
    void (async () => {
      const response = await fetch("/api/spotify/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, codeVerifier: verifier, redirectUri: redirectUri() }) });
      if (!response.ok) { setNotice("Spotify couldn’t finish connecting. Check the redirect address in your Spotify app settings."); return; }
      const data = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
      const session = { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 };
      sessionStorage.setItem(spotifyStorageKey, JSON.stringify(session));
      setSpotify(session);
      sessionStorage.removeItem("spotify-verifier"); sessionStorage.removeItem("spotify-state");
      window.history.replaceState({}, "", window.location.pathname);
      setNotice("Spotify is connected — finding the right track and album cover now.");
    })();
  }, []);

  useEffect(() => {
    if (!spotify) return;
    const initialise = () => {
      if (!window.Spotify || playerRef.current) return;
      const player = new window.Spotify.Player({ name: "Last Dance", getOAuthToken: (callback) => callback(spotify.accessToken), volume: 0.65 });
      player.addListener("ready", ({ device_id }) => setDeviceId(device_id ?? ""));
      player.addListener("not_ready", () => setDeviceId(""));
      player.addListener("authentication_error", ({ message }) => setNotice(message ?? "Spotify needs you to sign in again."));
      player.addListener("account_error", ({ message }) => setNotice(message ?? "Spotify Premium is needed for browser playback."));
      player.addListener("playback_error", ({ message }) => setNotice(message ?? "Spotify couldn’t play this track."));
      void player.connect();
      playerRef.current = player;
    };
    if (window.Spotify) initialise();
    else {
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      window.onSpotifyWebPlaybackSDKReady = initialise;
      document.body.appendChild(script);
    }
    return () => { playerRef.current?.disconnect(); playerRef.current = null; setDeviceId(""); };
  }, [spotify]);

  const currentSong = songs.find((song) => song.id === currentId) ?? songs[0];
  const reviewed = songs.filter((song) => votes[song.id]?.[person]).length;
  const resultGroups = useMemo(() => {
    return songs.reduce<Record<string, Song[]>>((groups, song) => {
      const key = classify(song, votes);
      groups[key] = [...(groups[key] ?? []), song];
      return groups;
    }, {});
  }, [songs, votes]);

  const matchSong = useCallback(async (song: Song) => {
    if (!spotify || song.spotify) return song.spotify;
    const query = encodeURIComponent(`track:${song.title} artist:${song.artist}`);
    const response = await fetch(`https://api.spotify.com/v1/search?type=track&limit=1&q=${query}`, { headers: { Authorization: `Bearer ${spotify.accessToken}` } });
    if (!response.ok) return undefined;
    const data = await response.json() as { tracks?: { items?: Array<{ uri: string; name: string; artists: Array<{ name: string }>; album: { name: string; images: Array<{ url: string }> } }> } };
    const track = data.tracks?.items?.[0];
    if (!track) return undefined;
    const match = { uri: track.uri, title: track.name, artist: track.artists.map((artist) => artist.name).join(", "), album: track.album.name, imageUrl: track.album.images[0]?.url };
    setSongs((items) => items.map((item) => item.id === song.id ? { ...item, spotify: match, status: "Matched" } : item));
    return match;
  }, [spotify]);

  useEffect(() => {
    if (!spotify || !currentSong || currentSong.spotify) return;
    const timer = window.setTimeout(() => { void matchSong(currentSong); }, 0);
    return () => window.clearTimeout(timer);
  }, [spotify, currentSong, matchSong]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === " ") { event.preventDefault(); void playOrPause(); }
      if (event.key.toLowerCase() === "y") vote("yes");
      if (event.key.toLowerCase() === "n") vote("no");
      if (event.key === "ArrowLeft") {
        const index = songs.findIndex((song) => song.id === currentSong.id);
        if (index > 0) setCurrentId(songs[index - 1].id);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  function switchPerson(nextPerson: Person) {
    setPerson(nextPerson);
    const next = songs.find((song) => !votes[song.id]?.[nextPerson]);
    if (next) setCurrentId(next.id);
    else setNotice(`${nextPerson} has reviewed the whole list. You can still change any choice from the shortlist.`);
  }

  async function connectSpotify() {
    const verifier = randomString(64);
    const state = randomString(24);
    const challenge = await codeChallenge(verifier);
    sessionStorage.setItem("spotify-verifier", verifier);
    sessionStorage.setItem("spotify-state", state);
    const params = new URLSearchParams({ client_id: spotifyClientId, response_type: "code", redirect_uri: redirectUri(), code_challenge_method: "S256", code_challenge: challenge, state, scope: "streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state" });
    window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
  }

  async function playOrPause() {
    if (!spotify) { await connectSpotify(); return; }
    if (isPlaying) { await playerRef.current?.togglePlay(); setIsPlaying(false); return; }
    if (!deviceId) { setNotice("Spotify is connecting to this browser. Give it a moment, then press play again."); return; }
    const match = await matchSong(currentSong);
    if (!match) { setNotice("We couldn’t find this version on Spotify. Try Open in Spotify instead."); return; }
    const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, { method: "PUT", headers: { Authorization: `Bearer ${spotify.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ uris: [match.uri] }) });
    if (!response.ok) { setNotice("Spotify couldn’t start this song. Try reconnecting Spotify or Open in Spotify."); return; }
    setIsPlaying(true);
  }

  function vote(value: VoteValue) {
    if (!currentSong) return;
    const updated = { ...votes, [currentSong.id]: { ...votes[currentSong.id], [person]: value } };
    setVotes(updated);
    setIsPlaying(false);
    const position = songs.findIndex((song) => song.id === currentSong.id);
    const next = songs.slice(position + 1).find((song) => !updated[song.id]?.[person]) ?? songs.find((song) => !updated[song.id]?.[person]);
    if (next) setCurrentId(next.id);
    else setNotice("That’s your whole list — lovely work. Your choices are saved.");
  }

  function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imported = parseSongs(String(reader.result));
      if (!imported.length) {
        setNotice("We couldn’t find artist and title columns. Try headers like Artist, Title.");
        return;
      }
      setSongs(imported);
      setVotes({});
      setCurrentId(imported[0].id);
      setNotice(`${imported.length} songs are ready to review. We removed blank rows and duplicates.`);
      setScreen("review");
    };
    reader.readAsText(file);
  }

  function exportResults() {
    const rows = ["Artist,Song,Alex,Jamie,Outcome", ...songs.map((song) => [song.artist, song.title, votes[song.id]?.Alex ?? "", votes[song.id]?.Jamie ?? "", classify(song, votes)].map((item) => `"${item}"`).join(","))];
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    link.download = "wedding-shortlist.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (!currentSong) return null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setScreen("review")} aria-label="Go to song review">
          <span className="brand-mark">✦</span><span>LAST DANCE</span>
        </button>
        <nav aria-label="Main navigation">
          <button className={screen === "review" ? "nav-active" : ""} onClick={() => setScreen("review")}>Review</button>
          <button className={screen === "results" ? "nav-active" : ""} onClick={() => setScreen("results")}>Shortlist <span>{resultGroups["Both yes"]?.length ?? 0}</span></button>
        </nav>
        <button className={`spotify-button ${spotify ? "spotify-connected" : ""}`} onClick={() => void connectSpotify()}>{spotify ? "Spotify connected" : "Connect Spotify"}</button>
        <label className="person-switch">Reviewing as
          <select value={person} onChange={(event) => switchPerson(event.target.value as Person)}>
            {people.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
      </header>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}

      {screen === "review" ? (
        <section className="review-layout" aria-label="Song review">
          <aside className="side-panel">
            <p className="eyebrow">WEDDING SETLIST</p>
            <h1>Choose the ones<br />that feel like <em>you.</em></h1>
            <p className="side-copy">Your answers stay private until you’re both ready to see the shortlist.</p>
            <div className="progress-block">
              <div className="progress-label"><span>Your progress</span><strong>{reviewed} of {songs.length}</strong></div>
              <div className="progress-track"><span style={{ width: `${songs.length ? (reviewed / songs.length) * 100 : 0}%` }} /></div>
            </div>
            <label className="import-button">Import a setlist<input type="file" accept=".csv,text/csv" onChange={handleImport} /></label>
            <p className="import-note">CSV with Artist + Title columns</p>
          </aside>

          <article className="song-card">
            <div className="song-meta"><span className={`status ${currentSong.status.toLowerCase().replace(" ", "-")}`}>{currentSong.spotify ? "Spotify matched" : currentSong.status}</span><span>{currentSong.spotify?.album ?? currentSong.album}</span></div>
            <div className={`album-art ${currentSong.spotify?.imageUrl ? "has-cover" : ""}`} style={{ "--art": currentSong.colour } as CSSProperties}>{currentSong.spotify?.imageUrl ? <img src={currentSong.spotify.imageUrl} alt={`Album cover for ${currentSong.spotify.album}`} /> : <><span>{currentSong.title.split(" ").slice(0, 2).join("\n")}</span><b>{currentSong.artist}</b></>}</div>
            <p className="artist-name">{currentSong.spotify?.artist ?? currentSong.artist}</p>
            <h2>{currentSong.spotify?.title ?? currentSong.title}</h2>
            <div className="playback">
              <button className="round-button" onClick={() => void playOrPause()} aria-label={!spotify ? "Connect Spotify" : isPlaying ? "Pause song" : "Play song"}>{isPlaying ? "Ⅱ" : "▶"}</button>
              <div><strong>{!spotify ? "Connect Spotify to listen" : deviceId ? isPlaying ? "Playing in this browser" : "Ready to listen" : "Connecting Spotify player"}</strong><span>{currentSong.spotify?.imageUrl ? "Real Spotify match" : "Album art appears as soon as Spotify matches it"}</span></div>
              <a href={`https://open.spotify.com/search/${encodeURIComponent(`${currentSong.artist} ${currentSong.title}`)}`} target="_blank" rel="noreferrer">Open in Spotify ↗</a>
            </div>
            <div className="choice-row">
              <button className="no-button" onClick={() => vote("no")}><span>✕</span>Not for us</button>
              <button className="yes-button" onClick={() => vote("yes")}><span>♡</span>Yes, please</button>
            </div>
            <div className="card-footer"><button onClick={() => { const index = songs.findIndex((song) => song.id === currentSong.id); if (index > 0) setCurrentId(songs[index - 1].id); }}>← Previous</button><span>Y / N to vote · Space to play</span></div>
          </article>
        </section>
      ) : (
        <section className="results-page">
          <div className="results-heading"><div><p className="eyebrow">WEDDING SETLIST</p><h1>Your shared <em>shortlist.</em></h1><p>{resultGroups["Both yes"]?.length ?? 0} songs you both chose. Keep the little sparks.</p></div><button className="export-button" onClick={exportResults}>Export CSV ↓</button></div>
          <div className="filter-row">{["All songs", "Both yes", "Different picks", "Both no", "Awaiting vote"].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item} <span>{item === "All songs" ? songs.length : resultGroups[item]?.length ?? 0}</span></button>)}</div>
          <div className="results-list">{songs.filter((song) => filter === "All songs" || classify(song, votes) === filter).map((song) => <article className="result-row" key={song.id}>{song.spotify?.imageUrl ? <img className="mini-art cover" src={song.spotify.imageUrl} alt="" /> : <div className="mini-art" style={{ background: song.colour }}>{song.title.slice(0, 1)}</div>}<div className="result-song"><strong>{song.spotify?.title ?? song.title}</strong><span>{song.spotify?.artist ?? song.artist}</span></div><div className="vote-state"><span>Alex <b className={votes[song.id]?.Alex}>{votes[song.id]?.Alex ?? "—"}</b></span><span>Jamie <b className={votes[song.id]?.Jamie}>{votes[song.id]?.Jamie ?? "—"}</b></span></div><span className={`outcome ${slug(classify(song, votes))}`}>{classify(song, votes)}</span><button className="edit-button" onClick={() => { setCurrentId(song.id); setScreen("review"); }}>Review</button></article>)}</div>
        </section>
      )}
    </main>
  );
}
