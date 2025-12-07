// profileDB.js
import fs from "fs";

const DB_FILE = "./profiles.json";

// ---------------------------------------------
// VERİTABANINI YÜKLER
// ---------------------------------------------
export function loadProfiles() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    const raw = fs.readFileSync(DB_FILE);
    return JSON.parse(raw);
  } catch (err) {
    console.error("Profiles yüklenirken hata:", err);
    return {};
  }
}

// ---------------------------------------------
// VERİTABANI KAYDET
// ---------------------------------------------
export function saveProfiles() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(profiles, null, 2));
  } catch (err) {
    console.error("Profiles kaydedilirken hata:", err);
  }
}

// RAM üzerinde aktif profil verisi
let profiles = loadProfiles();

// ---------------------------------------------
// PROFİL GETİR / OLUŞTUR
// ---------------------------------------------
export function getProfile(userId) {
  if (!profiles[userId]) {
    profiles[userId] = {
      aboutMe: "",
      lichess: null,
      chesscom: null,
      wins: {}
    };
    saveProfiles();
  }
  return profiles[userId];
}

// ---------------------------------------------
// ABOUT ME
// ---------------------------------------------
export function setAboutMe(userId, text) {
  const profile = getProfile(userId);
  profile.aboutMe = text;
  saveProfiles();
  return profile;
}

// ---------------------------------------------
// LICHESS BAĞLAMA
// (index.js set etmeyi direkt kendi içinde yapıyor,
// ama istersen bu fonksiyonu kullanabilirsin)
// ---------------------------------------------
export function setLichess(userId, data) {
  const profile = getProfile(userId);
  profile.lichess = data;
  saveProfiles();
  return profile;
}

// ---------------------------------------------
// CHESS.COM BAĞLAMA
// ---------------------------------------------
export function setChessCom(userId, data) {
  const profile = getProfile(userId);
  profile.chesscom = data;
  saveProfiles();
  return profile;
}

// ---------------------------------------------
// LICHESS KALDIR
// ---------------------------------------------
export function removeLichess(userId) {
  const profile = getProfile(userId);
  profile.lichess = null;
  saveProfiles();
}

// ---------------------------------------------
// CHESS.COM KALDIR
// ---------------------------------------------
export function removeChessCom(userId) {
  const profile = getProfile(userId);
  profile.chesscom = null;
  saveProfiles();
}

// ---------------------------------------------
// WIN EKLE
// ---------------------------------------------
export function addWin(userId, category) {
  const profile = getProfile(userId);
  if (!profile.wins) profile.wins = {};

  profile.wins[category] = (profile.wins[category] || 0) + 1;
  saveProfiles();
  return profile;
}

// ---------------------------------------------
// WIN KALDIR
// ---------------------------------------------
export function removeWin(userId, category) {
  const profile = getProfile(userId);

  if (!profile.wins || !profile.wins[category]) return;

  profile.wins[category]--;

  if (profile.wins[category] <= 0) delete profile.wins[category];

  saveProfiles();
  return profile;
}
