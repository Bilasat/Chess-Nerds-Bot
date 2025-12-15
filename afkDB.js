import fs from "fs";
import path from "path";
import { Buffer } from "buffer";

// -------------------------------------------------------
// CONFIG
// -------------------------------------------------------
const LOCAL_DB = path.join(process.cwd(), "afk.json");

const GITHUB_TOKEN = process.env.GH_TOKEN || null;
const GITHUB_OWNER = process.env.GH_USER || "Bilasat";
const GITHUB_REPO = process.env.GH_REPO || "Chess-Nerds-Bot-Database";
const GITHUB_BRANCH = process.env.GH_BRANCH || "main";
const REMOTE_PATH = "afk.json";

// -------------------------------------------------------
// Helper: GitHub Fetch
// -------------------------------------------------------
async function ghFetch(url, opts = {}) {
  const headers = {
    "User-Agent": "chess-nerds-bot",
    Accept: "application/vnd.github.v3+json",
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

  return fetch(url, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
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

    if (res.status === 404) {
      console.warn("GitHub GET: afk.json does not exist.");
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
// GitHub PUT
// -------------------------------------------------------
async function githubPutFile({ message, content, sha }) {
  if (!GITHUB_TOKEN) return false;

  const url =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
    `/contents/${REMOTE_PATH}`;

  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: GITHUB_BRANCH,
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
let afkData = {};

// -------------------------------------------------------
// LOAD
// -------------------------------------------------------
export async function loadAfk() {
  if (Object.keys(afkData).length > 0) return afkData;

  const remote = await githubGetFile();

  if (remote && remote.content) {
    try {
      afkData = JSON.parse(remote.content);
      localWrite(afkData);
      return afkData;
    } catch (err) {
      console.error("Remote AFK JSON parse error:", err);
    }
  }

  afkData = localRead();
  return afkData;
}

// -------------------------------------------------------
// SAVE
// -------------------------------------------------------
export async function saveAfk() {
  const content = JSON.stringify(afkData, null, 2);

  try {
    let remote = await githubGetFile();

    if (!remote) {
      console.warn("afk.json missing. Creating new file on GitHub...");
      remote = { sha: null };
    }

    const ok = await githubPutFile({
      message: "Update afk.json",
      content,
      sha: remote.sha,
    });

    if (ok) {
      localWrite(afkData);
      console.log("AFK synced to GitHub.");
      return true;
    }
  } catch (err) {
    console.error("saveAfk error:", err);
  }

  localWrite(afkData);
  return false;
}

// -------------------------------------------------------
// CORE FUNCTIONS
// -------------------------------------------------------
export function getAfk(userId) {
  if (Object.keys(afkData).length === 0) afkData = localRead();
  return afkData[userId] || null;
}

export function setAfk(userId, data) {
  afkData[userId] = data;
  saveAfk().catch(() => {});
  return afkData[userId];
}

export function removeAfk(userId) {
  if (!afkData[userId]) return;
  delete afkData[userId];
  saveAfk().catch(() => {});
}

export { loadAfk as loadAfkAsync };
