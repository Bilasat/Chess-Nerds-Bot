// profileDB.js
import fs from "fs";
import path from "path";
import { Buffer } from "buffer";

const LOCAL_DB = path.join(process.cwd(), "profiles.json");

// GitHub config from env (defaults provided)
const GITHUB_TOKEN = process.env.GH_TOKEN || null;
const GITHUB_OWNER = process.env.GH_USER || "Bilasat";
const GITHUB_REPO = process.env.GH_REPO || "Bilasat/Chess-Nerds-Bot-Database";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const REMOTE_PATH = "profiles.json"; // path inside repo

// --- Helper: fetch wrapper for node global fetch ---
async function ghFetch(url, opts = {}) {
  const defaultHeaders = {
    "User-Agent": "chess-nerds-bot",
    Accept: "application/vnd.github.v3+json"
  };
  if (GITHUB_TOKEN) defaultHeaders.Authorization = `token ${GITHUB_TOKEN}`;
  opts.headers = Object.assign(defaultHeaders, opts.headers || {});
  return fetch(url, opts);
}

// ---------------------------------------------
// GitHub: get file metadata + content
// returns { content: <string>, sha: <string> } or null
// ---------------------------------------------
async function githubGetFile() {
  if (!GITHUB_TOKEN) return null;
  const url = `https://api.github.com/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/contents/${encodeURIComponent(REMOTE_PATH)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  try {
    const res = await ghFetch(url);
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error("GitHub GET error:", res.status, await res.text());
      return null;
    }
    const j = await res.json();
    if (!j.content) return null;
    const content = Buffer.from(j.content, "base64").toString("utf8");
    return { content, sha: j.sha };
  } catch (err) {
    console.error("githubGetFile error:", err);
    return null;
  }
}

// ---------------------------------------------
// GitHub: put/update file
// body: { message, content (utf8 string), sha? }
// returns true/false
// ---------------------------------------------
async function githubPutFile({ message = "update profiles.json", content = "{}", sha = null }) {
  if (!GITHUB_TOKEN) return false;
  const url = `https://api.github.com/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/contents/${encodeURIComponent(REMOTE_PATH)}`;
  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: GITHUB_BRANCH
  };
  if (sha) body.sha = sha;
  try {
    const res = await ghFetch(url, {
      method: "PUT",
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      console.error("GitHub PUT error:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("githubPutFile error:", err);
    return false;
  }
}

// ---------------------------------------------
// Fallback local read/write helpers
// ---------------------------------------------
function localRead() {
  try {
    if (!fs.existsSync(LOCAL_DB)) {
      fs.writeFileSync(LOCAL_DB, JSON.stringify({}, null, 2));
      return {};
    }
    const raw = fs.readFileSync(LOCAL_DB, "utf8");
    return JSON.parse(raw || "{}");
  } catch (err) {
    console.error("localRead error:", err);
    return {};
  }
}
function localWrite(obj) {
  try {
    fs.writeFileSync(LOCAL_DB, JSON.stringify(obj, null, 2));
    return true;
  } catch (err) {
    console.error("localWrite error:", err);
    return false;
  }
}

// ---------------------------------------------
// RAM cache for profiles
// ---------------------------------------------
let profiles = {};

// ---------------------------------------------
// VERİTABANINI YÜKLER
// - Öncelik: GitHub (okuma)
// - Fallback: local file
// - Eğer remote yoksa oluşturur
// ---------------------------------------------
export async function loadProfiles() {
  // If already loaded in RAM, return it
  if (profiles && Object.keys(profiles).length) return profiles;

  // Try GitHub
  const remote = await githubGetFile();
  if (remote && remote.content) {
    try {
      profiles = JSON.parse(remote.content);
      // persist locally as cache
      try { localWrite(profiles); } catch {}
      return profiles;
    } catch (err) {
      console.error("Failed parse remote profiles.json:", err);
      // fallthrough to local read
    }
  }

  // Try local
  profiles = localRead();
  // If local missing/empty, initialize & push to remote if possible
  if (!profiles || Object.keys(profiles).length === 0) {
    profiles = {};
    // push initial empty file to GitHub to ensure repo has it
    try {
      const putOk = await githubPutFile({ message: "Init profiles.json (bot)", content: JSON.stringify(profiles, null, 2) });
      if (!putOk) {
        // ensure local written
        localWrite(profiles);
      }
    } catch (e) {
      localWrite(profiles);
    }
  }
  return profiles;
}

// ---------------------------------------------
// VERİTABANI KAYDET
// - Güncel RAM 'profiles' ı önce GitHub'a yazmayı dener
// - Başarısız olursa local'a kaydeder
// ---------------------------------------------
export async function saveProfiles() {
  // stringify
  const content = JSON.stringify(profiles, null, 2);

  // Try fetch current sha first (to update)
  try {
    const remote = await githubGetFile();
    const sha = remote ? remote.sha : null;
    const ok = await githubPutFile({
      message: "Update profiles.json (bot)",
      content,
      sha
    });
    if (ok) {
      // also keep local cache updated
      try { localWrite(profiles); } catch {}
      return true;
    } else {
      // fallback to local
      localWrite(profiles);
      return false;
    }
  } catch (err) {
    console.error("saveProfiles error:", err);
    localWrite(profiles);
    return false;
  }
}

// ---------------------------------------------
// PROFİL GETİR / OLUŞTUR
// (synchronous semantics kept for compatibility with index.js)
// ---------------------------------------------
export function getProfile(userId) {
  // If profiles not loaded yet (RAM empty) — try synchronous local read
  if (!profiles || Object.keys(profiles).length === 0) {
    try {
      // load from local file (non-blocking alternative to awaiting loadProfiles)
      profiles = localRead();
    } catch (e) {
      profiles = {};
    }
  }

  if (!profiles[userId]) {
    profiles[userId] = {
      aboutMe: "",
      lichess: null,
      chesscom: null,
      wins: {}
    };
    // save asynchronously (don't block caller)
    saveProfiles().catch(() => {});
  }
  return profiles[userId];
}

// ---------------------------------------------
// ABOUT ME
// ---------------------------------------------
export function setAboutMe(userId, text) {
  const profile = getProfile(userId);
  profile.aboutMe = text;
  saveProfiles().catch(() => {});
  return profile;
}

// ---------------------------------------------
// LICHESS / CHESS.COM helpers
// ---------------------------------------------
export function setLichess(userId, data) {
  const profile = getProfile(userId);
  profile.lichess = data;
  saveProfiles().catch(() => {});
  return profile;
}
export function setChessCom(userId, data) {
  const profile = getProfile(userId);
  profile.chesscom = data;
  saveProfiles().catch(() => {});
  return profile;
}
export function removeLichess(userId) {
  const profile = getProfile(userId);
  profile.lichess = null;
  saveProfiles().catch(() => {});
}
export function removeChessCom(userId) {
  const profile = getProfile(userId);
  profile.chesscom = null;
  saveProfiles().catch(() => {});
}

// ---------------------------------------------
// WIN EKLE / KALDIR
// ---------------------------------------------
export function addWin(userId, category) {
  const profile = getProfile(userId);
  if (!profile.wins) profile.wins = {};
  profile.wins[category] = (profile.wins[category] || 0) + 1;
  saveProfiles().catch(() => {});
  return profile;
}
export function removeWin(userId, category) {
  const profile = getProfile(userId);
  if (!profile.wins || !profile.wins[category]) return profile;
  profile.wins[category]--;
  if (profile.wins[category] <= 0) delete profile.wins[category];
  saveProfiles().catch(() => {});
  return profile;
}

// ---------------------------------------------
// EXPORT convenience: ensure loadProfiles exported as-sync wrapper
// ---------------------------------------------
export { loadProfiles as loadProfilesAsync };
