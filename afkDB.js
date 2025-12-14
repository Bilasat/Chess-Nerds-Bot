// afkDB.js
import fs from "fs";
import path from "path";

const AFK_FILE = path.join(process.cwd(), "afk.json");

// ------------------------
// LOAD
// ------------------------
function loadAFK() {
  try {
    if (!fs.existsSync(AFK_FILE)) {
      fs.writeFileSync(AFK_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    return JSON.parse(fs.readFileSync(AFK_FILE, "utf8"));
  } catch {
    return {};
  }
}

// ------------------------
// SAVE
// ------------------------
function saveAFK(data) {
  fs.writeFileSync(AFK_FILE, JSON.stringify(data, null, 2));
}

// ------------------------
let afkData = loadAFK();

// ------------------------
// API
// ------------------------
export function isAFK(userId) {
  return !!afkData[userId];
}

export function setAFK(userId, note, oldNick) {
  afkData[userId] = {
    note: note || null,
    oldNick,
    since: Date.now()
  };
  saveAFK(afkData);
}

export function removeAFK(userId) {
  const data = afkData[userId];
  delete afkData[userId];
  saveAFK(afkData);
  return data;
}

export function getAFK(userId) {
  return afkData[userId] || null;
}
