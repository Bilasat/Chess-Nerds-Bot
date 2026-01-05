import fs from "fs";
import path from "path";
import { Buffer } from "buffer";

// -------------------------------------------------------
// CONFIG
// -------------------------------------------------------
const LOCAL_DB = path.join(process.cwd(), "profiles.json");

function getGitHubConfig() {
  return {
    token: process.env.GH_TOKEN || null,
    owner: process.env.GH_USER || "Bilasat",
    repo: process.env.GH_REPO || "Chess-Nerds-Bot-Database",
    branch: process.env.GH_BRANCH || "main",
  };
}

const REMOTE_PATH = "profiles.json";

// -------------------------------------------------------
// Helper: GitHub Fetch
// -------------------------------------------------------
async function ghFetch(url, opts = {}) {
  const { token } = getGitHubConfig();

  const headers = {
    "User-Agent": "chess-nerds-bot",
    Accept: "application/vnd.github.v3+json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(url, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
  });
}


// -------------------------------------------------------
// GitHub GET
// -------------------------------------------------------
async function githubGetFile() {
  const { token, owner, repo, branch } = getGitHubConfig();
if (!token) return null;

const url =
  `https://api.github.com/repos/${owner}/${repo}` +
  `/contents/${REMOTE_PATH}?ref=${branch}`;


  try {
    const res = await ghFetch(url);

    if (res.status === 404) {
      console.warn("GitHub GET: profiles.json does not exist.");
      return null;
    }

    if (!res.ok) {
      console.error("GitHub GET error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const content = Buffer.from(data.content, "base64").toString("utf8");

    return { content, sha: data.sha };
  } catch (err) {
    console.error("githubGetFile error:", err);
    return null;
  }
}

// -------------------------------------------------------
// GitHub PUT (Requires SHA)
// -------------------------------------------------------
async function githubPutFile({ message, content, sha }) {
  const { token, owner, repo, branch } = getGitHubConfig();
if (!token) return false;


  const url =
  `https://api.github.com/repos/${owner}/${repo}` +
  `/contents/${REMOTE_PATH}`;


const body = {
  message,
  content: Buffer.from(content, "utf8").toString("base64"),
  branch,
  sha,
};


  try {
    const res = await ghFetch(url, {
      method: "PUT",
      body: JSON.stringify(body),
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
// LOAD
// -------------------------------------------------------
export async function loadProfiles() {
  if (Object.keys(profiles).length > 0) return profiles;

  const remote = await githubGetFile();

  if (remote && remote.content) {
    try {
      profiles = JSON.parse(remote.content);
      localWrite(profiles);
      return profiles;
    } catch (err) {
      console.error("Remote JSON parse error:", err);
    }
  }

  profiles = localRead();
  return profiles;
}

// -------------------------------------------------------
// SAVE (GitHub → Local)
// -------------------------------------------------------
export async function saveProfiles() {
  const content = JSON.stringify(profiles, null, 2);

  try {
    let remote = await githubGetFile();

    // File missing → create empty one first
    if (!remote) {
      console.warn("profiles.json missing. Creating new file on GitHub...");
      remote = { sha: null };
    }

    const ok = await githubPutFile({
      message: "Update profiles.json",
      content,
      sha: remote.sha,
    });

    if (ok) {
      localWrite(profiles);
      console.log("Profiles synced to GitHub.");
      return true;
    }
  } catch (err) {
    console.error("saveProfiles error:", err);
  }

  localWrite(profiles);
  return false;
}

// -------------------------------------------------------
// CORE FUNCTIONS
// -------------------------------------------------------
export function getProfile(userId) {
  if (Object.keys(profiles).length === 0) profiles = localRead();

  if (!profiles[userId]) {
    profiles[userId] = {
      aboutMe: "",
      lichess: null,
      chesscom: null,
      wins: {},
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
