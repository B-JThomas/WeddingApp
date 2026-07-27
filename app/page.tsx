"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

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
};

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

function loadSavedState(): { songs?: Song[]; votes?: VoteBook; person?: Person } {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as { songs?: Song[]; votes?: VoteBook; person?: Person };
  } catch {
    return {};
  }
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

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

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify({ songs, votes, person }));
  }, [songs, votes, person]);

  const currentSong = songs.find((song) => song.id === currentId) ?? songs[0];
  const reviewed = songs.filter((song) => votes[song.id]?.[person]).length;
  const resultGroups = useMemo(() => {
    return songs.reduce<Record<string, Song[]>>((groups, song) => {
      const key = classify(song, votes);
      groups[key] = [...(groups[key] ?? []), song];
      return groups;
    }, {});
  }, [songs, votes]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === " ") { event.preventDefault(); setIsPlaying((playing) => !playing); }
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
            <div className="song-meta"><span className={`status ${currentSong.status.toLowerCase().replace(" ", "-")}`}>{currentSong.status}</span><span>{currentSong.album}</span></div>
            <div className="album-art" style={{ "--art": currentSong.colour } as React.CSSProperties}><span>{currentSong.title.split(" ").slice(0, 2).join("\n")}</span><b>{currentSong.artist}</b></div>
            <p className="artist-name">{currentSong.artist}</p>
            <h2>{currentSong.title}</h2>
            <div className="playback">
              <button className="round-button" onClick={() => setIsPlaying(!isPlaying)} aria-label={isPlaying ? "Pause preview" : "Play preview"}>{isPlaying ? "Ⅱ" : "▶"}</button>
              <div><strong>{isPlaying ? "Playing preview" : "Ready to listen"}</strong><span>Spotify opens if playback isn’t connected</span></div>
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
          <div className="results-list">{songs.filter((song) => filter === "All songs" || classify(song, votes) === filter).map((song) => <article className="result-row" key={song.id}><div className="mini-art" style={{ background: song.colour }}>{song.title.slice(0, 1)}</div><div className="result-song"><strong>{song.title}</strong><span>{song.artist}</span></div><div className="vote-state"><span>Alex <b className={votes[song.id]?.Alex}>{votes[song.id]?.Alex ?? "—"}</b></span><span>Jamie <b className={votes[song.id]?.Jamie}>{votes[song.id]?.Jamie ?? "—"}</b></span></div><span className={`outcome ${slug(classify(song, votes))}`}>{classify(song, votes)}</span><button className="edit-button" onClick={() => { setCurrentId(song.id); setScreen("review"); }}>Review</button></article>)}</div>
        </section>
      )}
    </main>
  );
}
