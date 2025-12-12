// profileDB.js
import fs from "fs";
import path from "path";
import { Buffer } from "buffer";

// -------------------------------------------------------
// CONFIG
// -------------------------------------------------------
const LOCAL_DB = path.join(process.cwd(), "profiles.json");

const GITHUB_TOKEN = process.env.GH_TOKEN || null;
const GITHUB_OWNER = process.env.GH_USER || "Bilasat";
const GITHUB_REPO = process.env.GH_REPO || "Chess-Nerds-Bot-Database";
const GITHUB_BRANCH = process.env.GH_BRANCH || "main";
const REMOTE_PATH = "profiles.json";

// -------------------------------------------------------
// Helper: GitHub Fetch
// -------------------------------------------------------
async function ghFetch(url, opts = {}) {
  const headers = {
    "User-Agent": "chess-nerds-bot",
    Accept: "application/vnd.github.v3+json"
  };
  if (GITHUB_TOKEN) headers.Authorization = `token ${GITHUB_TOKEN}`;

  return fetch(url, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) }
  });
}

// -------------------------------------------------------
// GitHub GET
// -------------------------------------------------------
async function githubGetFile() {
  if (!GITHUB_TOKEN) return null;

  const url =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
    `/contents/${REMOTE_PATH}?ref=${GITHUB_BRANCH}`;

  try {
    const res = await ghFetch(url);

    if (res.status === 404) return null;
    if (!res.ok) {
      console.error("GitHub GET error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    if (!data.content) return null;

    const content = Buffer.from(data.content, "base64").toString("utf8");
    return { content, sha: data.sha };
  } catch (err) {
    console.error("githubGetFile error:", err);
    return null;
  }
}

// -------------------------------------------------------
// GitHub PUT
// -------------------------------------------------------
async function githubPutFile({ message, content, sha = null }) {
  if (!GITHUB_TOKEN) return false;

  const url =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
    `/contents/${REMOTE_PATH}`;

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

// -------------------------------------------------------
// LOCAL fallback
// -------------------------------------------------------
function localRead() {
  try {
    if (!fs.existsSync(LOCAL_DB)) {
      fs.writeFileSync(LOCAL_DB, JSON.stringify({}, null, 2));
      return {};
    }
    return JSON.parse(fs.readFileSync(LOCAL_DB, "utf8"));
  } catch (err) {
    console.error("localRead error:", err);
    return {};
  }
}

function localWrite(obj) {
  try {
    fs.writeFileSync(LOCAL_DB, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error("localWrite error:", err);
  }
}

// -------------------------------------------------------
// RAM CACHE
// -------------------------------------------------------
let profiles = {};

// -------------------------------------------------------
// LOAD (GitHub → Local → Empty)
// -------------------------------------------------------
export async function loadProfiles() {
  // RAM already loaded
  if (Object.keys(profiles).length > 0) return profiles;

  // First try GitHub
  const remote = await githubGetFile();
  if (remote && remote.content) {
    try {
      profiles = JSON.parse(remote.content);
      localWrite(profiles);
      return profiles;
    } catch {
      console.error("Remote profiles.json parse error");
    }
  }

  // Fallback local
  profiles = localRead();

  // If empty → create
  if (!profiles || Object.keys(profiles).length === 0) {
    profiles = {};
    const ok = await githubPutFile({
      message: "Init profiles.json",
      content: JSON.stringify(profiles, null, 2)
    });
    if (!ok) localWrite(profiles);
  }

  return profiles;
}

// -------------------------------------------------------
// SAVE (RAM → GitHub → Local)
// -------------------------------------------------------
export async function saveProfiles() {
  const content = JSON.stringify(profiles, null, 2);

  try {
    const remote = await githubGetFile();
    const sha = remote ? remote.sha : null;

    const ok = await githubPutFile({
      message: "Update profiles.json",
      content,
      sha
    });

    if (ok) {
      localWrite(profiles);
      return true;
    }
  } catch {}

  // fallback
  localWrite(profiles);
  return false;
}

// -------------------------------------------------------
// CORE FUNCTIONS (index.js ile %100 uyumlu)
// -------------------------------------------------------
export function getProfile(userId) {
  if (Object.keys(profiles).length === 0) profiles = localRead();

  if (!profiles[userId]) {
    profiles[userId] = {
      aboutMe: "",
      lichess: null,
      chesscom: null,
      wins: {}
    };
    saveProfiles().catch(() => {});
  }

  return profiles[userId];
}

export function setAboutMe(userId, text) {
  const p = getProfile(userId);
  p.aboutMe = text;
  saveProfiles().catch(() => {});
  return p;
}

export function setLichess(userId, data) {
  const p = getProfile(userId);
  p.lichess = data;
  saveProfiles().catch(() => {});
  return p;
}

export function setChessCom(userId, data) {
  const p = getProfile(userId);
  p.chesscom = data;
  saveProfiles().catch(() => {});
  return p;
}

export function removeLichess(userId) {
  const p = getProfile(userId);
  p.lichess = null;
  saveProfiles().catch(() => {});
}

export function removeChessCom(userId) {
  const p = getProfile(userId);
  p.chesscom = null;
  saveProfiles().catch(() => {});
}

export function addWin(userId, category) {
  const p = getProfile(userId);
  if (!p.wins) p.wins = {};
  p.wins[category] = (p.wins[category] || 0) + 1;
  saveProfiles().catch(() => {});
  return p;
}

export function removeWin(userId, category) {
  const p = getProfile(userId);
  if (!p.wins || !p.wins[category]) return p;

  p.wins[category]--;
  if (p.wins[category] <= 0) delete p.wins[category];

  saveProfiles().catch(() => {});
  return p;
}

export { loadProfiles as loadProfilesAsync };
