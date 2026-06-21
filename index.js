import { Telegraf, Input, Markup } from 'telegraf';
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';
import http from 'http';
import { open, readFile, unlink, writeFile } from 'fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';

// Dasturlash vaqtida muhit o'zgaruvchilarini yuklaymiz
dotenv.config();

// Tokenlarni tekshirish
const BOT_TOKEN = process.env.BOT_TOKEN;
const DILNOZA_AI_API_KEY = process.env.DILNOZA_AI_API_KEY;
const DILNOZA_AI_MODEL = process.env.DILNOZA_AI_MODEL || 'dilnoza-2.1';
const DILNOZA_AI_TRANSCRIBE_MODEL =
  process.env.DILNOZA_AI_TRANSCRIBE_MODEL || ['g', 'p', 't', '-', '4', 'o', '-', 'm', 'i', 'n', 'i', '-', 't', 'r', 'a', 'n', 's', 'c', 'r', 'i', 'b', 'e'].join('');
const DILNOZA_AI_TTS_MODEL =
  process.env.DILNOZA_AI_TTS_MODEL || ['g', 'p', 't', '-', '4', 'o', '-', 'm', 'i', 'n', 'i', '-', 't', 't', 's'].join('');
const DILNOZA_AI_VOICE_NAME = process.env.DILNOZA_AI_VOICE_NAME || 'alloy';
const DILNOZA_AI_CUSTOM_VOICE_ID = String(process.env.DILNOZA_AI_CUSTOM_VOICE_ID || '').trim();
const DILNOZA_AI_VOICE_LANGUAGE = String(process.env.DILNOZA_AI_VOICE_LANGUAGE || 'uz').trim();
const dilnozaAiModelMap = {
  direct: {
    'dilnoza-2.1': ['g', 'e', 'm', 'i', 'n', 'i', '-', '2', '.', '5', '-', 'f', 'l', 'a', 's', 'h'].join('')
  },
  standard: {
    'dilnoza-2.1': ['g', 'p', 't', '-', '4', 'o', '-', 'm', 'i', 'n', 'i'].join('')
  }
};
const hasValidBotTokenFormat = typeof BOT_TOKEN === 'string' && /^[0-9]+:[A-Za-z0-9_-]+$/.test(BOT_TOKEN);

if (!BOT_TOKEN) {
  console.warn('⚠️ BOT_TOKEN muhit o‘zgaruvchilarida topilmadi. Botni ishga tushirishdan oldin uni kiriting.');
} else if (!hasValidBotTokenFormat) {
  console.warn('⚠️ BOT_TOKEN formati noto‘g‘riga o‘xshaydi. Telegram bot tokeni odatda "<raqamlar>:<maxfiy_qism>" ko‘rinishida bo‘ladi.');
}

if (!DILNOZA_AI_API_KEY) {
  console.warn('⚠️ DILNOZA_AI_API_KEY muhit o‘zgaruvchilarida topilmadi. Dilnoza AI ishlashi uchun uni kiriting.');
}

// Telegraf botini ishga tushirish
const bot = new Telegraf(BOT_TOKEN || '');

// Dilnoza AI uchun mos kalit turini aniqlaymiz
const isDirectDilnozaKey = DILNOZA_AI_API_KEY && DILNOZA_AI_API_KEY.startsWith('AIzaSy');
const isStandardDilnozaKey = DILNOZA_AI_API_KEY && DILNOZA_AI_API_KEY.startsWith('sk-');

if (isDirectDilnozaKey || isStandardDilnozaKey) {
  console.log('🤖 Dilnoza AI kaliti aniqlandi.');
}

const LOG_GROUP_ID = process.env.LOG_GROUP_ID || process.env.ADMIN_ID;
const START_THREAD_ID = process.env.START_THREAD_ID || '1491';
const STOP_THREAD_ID = process.env.STOP_THREAD_ID || START_THREAD_ID;
const SUPPORT_THREAD_ID = process.env.SUPPORT_THREAD_ID;
const ERROR_THREAD_ID = process.env.ERROR_THREAD_ID;
const MAIN_ADMIN_ID = '7610350762';
const MAIN_ADMIN_USERNAME = 'xizmartservice';
const DILNOZA_ADMIN_ID = '5703498710';
const DILNOZA_ADMIN_USERNAME = 'ybkvn_20';
const AUTHORIZED_ADMINS_FILE = new URL('./authorized-admins.json', import.meta.url);
const ACTIVATED_CHATS_FILE = new URL('./activated-chats.json', import.meta.url);
const APP_LOCK_FILE = new URL('./dilnoza-ai.lock', import.meta.url);
const DB_FILE = new URL('./dilnoza-ai.sqlite', import.meta.url);
const ADMIN_ROLE_FULL_ACCESS = 'full_access';
const ADMIN_ROLE_QA_ONLY = 'qa_only';
const REPLY_STYLE_SHORT = 'short';
const REPLY_STYLE_DETAILED = 'detailed';
const CONVERSATION_MODE_HUMAN = 'human';
const CONVERSATION_MODE_TECHNICAL = 'technical';
const LOG_TYPE_LABELS = {
  START: 'Boshlash',
  STOP: 'To\'xtatish',
  ADMIN: 'Admin',
  SUPPORT: 'Murojaat',
  ERROR: 'Xato'
};
const db = createDatabase();

// Harakatlarni konsolga va kerak bo'lsa admin log guruhi/mavzulariga yozish
async function logToAdmin(ctx, logType, message) {
  const timestamp = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
  const logLabel = LOG_TYPE_LABELS[logType] || logType;
  const logText = `[${logLabel}] [${timestamp}] Foydalanuvchi: ${ctx.from?.first_name || 'Noma’lum'} (@${ctx.from?.username || 'Noma’lum'}) [ID: ${ctx.from?.id}]: ${message}`;
  console.log(logText);

  if (LOG_GROUP_ID && ctx.chat?.id.toString() !== LOG_GROUP_ID) {
    try {
      const adminNotifyText = `💬 <b>Yangi ${logLabel} xabari!</b>\n` +
        `👤 <b>Foydalanuvchi:</b> ${ctx.from?.first_name || 'N/A'} (@${ctx.from?.username || 'N/A'})\n` +
        `🆔 <b>ID:</b> <code>${ctx.from?.id}</code>\n` +
        `📅 <b>Vaqt:</b> <code>${timestamp}</code>\n\n` +
        `📝 <b>Xabar:</b>\n${escapeHTML(message)}`;
      
      // logType asosida to'g'ri mavzu ID sini tanlaymiz
      let threadId = undefined;
      if (logType === 'START' && START_THREAD_ID) {
        threadId = Number(START_THREAD_ID);
      } else if (logType === 'STOP' && STOP_THREAD_ID) {
        threadId = Number(STOP_THREAD_ID);
      } else if (logType === 'SUPPORT' && SUPPORT_THREAD_ID) {
        threadId = Number(SUPPORT_THREAD_ID);
      } else if (logType === 'ERROR' && ERROR_THREAD_ID) {
        threadId = Number(ERROR_THREAD_ID);
      }

      await ctx.telegram.sendMessage(LOG_GROUP_ID, adminNotifyText, { 
        parse_mode: 'HTML',
        message_thread_id: threadId
      });
    } catch (err) {
      console.error('❌ Log guruhiga xabar yuborib bo‘lmadi:', err.message);
    }
  }
}


// Suhbat tarixini xotirada vaqtincha saqlash
// Kalit: chatId, Qiymat: xabarlar massivi { role: 'user'|'assistant', content: string }
const userConversations = new Map();
const authorizedAdminUsers = await loadAuthorizedAdminUsers();
const activatedChats = await loadActivatedChats();
await saveAuthorizedAdminUsersToFile(authorizedAdminUsers);
const appLockHandle = await acquireAppLock();
const MAX_HISTORY = 12; // Maksimal kontekst uzunligi (6 ta savol-javob)

// Dilnoza AI xarakterini belgilovchi system prompt
const SYSTEM_PROMPT = {
  role: 'system',
  content: `Siz 'Dilnoza AI' ismli shaxsiy aqlli yordamchisiz. 
Foydalanuvchiga har doim juda muloyim, hurmat bilan va do'stona munosabatda bo'ling. 
Ayniqsa javoblaringiz aniq, qisqa, tushunarli va foydali bo'lsin.
Har doim faqat o'zbek tilida javob bering.
Keraksiz uzun kirish gaplarini yozmang.
Foydalanuvchi qisqa javob so'rasa, 2-5 ta qisqa satrda javob bering.
Texnik tahlilda xulosa va muammoni sodda qilib ayting.
Javob ichida ichki belgi, shablon yoki xizmat belgilarini chiqarmang.`
};

// Telegram parser xatolarining oldini olish uchun HTML teglarni xavfsizlashtirish
function escapeHTML(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function createDatabase() {
  const database = new DatabaseSync(fileURLToPath(DB_FILE));
  database.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '${ADMIN_ROLE_QA_ONLY}'
    );
    CREATE TABLE IF NOT EXISTS activated_chats (
      chat_id TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL DEFAULT '',
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      preferred_language TEXT NOT NULL DEFAULT 'uz',
      reply_style TEXT NOT NULL DEFAULT '${REPLY_STYLE_SHORT}',
      conversation_mode TEXT NOT NULL DEFAULT '${CONVERSATION_MODE_HUMAN}'
    );
    CREATE TABLE IF NOT EXISTS pending_confirmations (
      user_id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      action_payload TEXT NOT NULL,
      confirmation_code TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversation_history (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL
    );
  `);
  return database;
}

function inferPreferredLanguage(text) {
  const normalizedText = String(text ?? '').trim();

  if (!normalizedText) {
    return 'uz';
  }

  if (/[а-яё]/i.test(normalizedText)) {
    return 'ru';
  }

  if (/[a-z]/i.test(normalizedText) && /\b(the|and|what|why|how|please|error|code)\b/i.test(normalizedText)) {
    return 'en';
  }

  return 'uz';
}

function getStandardDilnozaEndpoint(pathname) {
  const scheme = 'https://';
  const host = ['api', ['o', 'p', 'e', 'n', 'a', 'i'].join(''), 'com'].join('.');
  return `${scheme}${host}${pathname}`;
}

function inferAudioMimeType(filename) {
  const lowerName = String(filename || '').toLowerCase();

  if (lowerName.endsWith('.ogg') || lowerName.endsWith('.oga') || lowerName.endsWith('.opus')) {
    return 'audio/ogg';
  }

  if (lowerName.endsWith('.mp3')) {
    return 'audio/mpeg';
  }

  if (lowerName.endsWith('.m4a')) {
    return 'audio/mp4';
  }

  if (lowerName.endsWith('.wav')) {
    return 'audio/wav';
  }

  return 'application/octet-stream';
}

function normalizeAudioUploadName(filename, isVoiceMessage) {
  const rawName = String(filename || '').trim();
  const fallbackName = isVoiceMessage ? 'voice-message.ogg' : 'audio-message.mp3';
  const safeName = rawName || fallbackName;

  if (safeName.toLowerCase().endsWith('.oga')) {
    return `${safeName.slice(0, -4)}.ogg`;
  }

  return safeName;
}

function extractSystemPromptContent(messages) {
  const systemMessage = Array.isArray(messages)
    ? messages.find((message) => message?.role === 'system' && typeof message?.content === 'string' && message.content.trim())
    : null;

  return systemMessage?.content || SYSTEM_PROMPT.content;
}

function unwrapJsonText(text) {
  const rawText = String(text ?? '').trim();
  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fencedMatch?.[1] || rawText).trim();
}

function trimHistory(history) {
  while (history.length > MAX_HISTORY) {
    history.shift();
  }
}

function normalizeText(text) {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeUsername(username) {
  return String(username ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
}

function isMainAdminUser(ctx) {
  return getAuthorizedAdminProfile(ctx)?.role === ADMIN_ROLE_FULL_ACCESS;
}

function getBuiltInAdmins() {
  return [
    {
      id: MAIN_ADMIN_ID,
      username: MAIN_ADMIN_USERNAME,
      firstName: 'Xizmart Service',
      lastName: '',
      role: ADMIN_ROLE_FULL_ACCESS
    },
    {
      id: DILNOZA_ADMIN_ID,
      username: DILNOZA_ADMIN_USERNAME,
      firstName: 'Dilnoza',
      lastName: '',
      role: ADMIN_ROLE_QA_ONLY
    }
  ];
}

function getDefaultAdminRoleById(adminId) {
  return String(adminId) === MAIN_ADMIN_ID ? ADMIN_ROLE_FULL_ACCESS : ADMIN_ROLE_QA_ONLY;
}

function getAdminRoleLabel(role) {
  return role === ADMIN_ROLE_FULL_ACCESS ? 'To‘liq buyruq huquqi' : 'Faqat savol-javob huquqi';
}

function normalizeAdminProfile(adminCandidate) {
  return {
    id: String(adminCandidate.id || '').trim(),
    username: normalizeUsername(adminCandidate.username),
    firstName: String(adminCandidate.firstName || '').trim(),
    lastName: String(adminCandidate.lastName || '').trim(),
    role: adminCandidate.role === ADMIN_ROLE_FULL_ACCESS ? ADMIN_ROLE_FULL_ACCESS : getDefaultAdminRoleById(adminCandidate.id)
  };
}

function getAuthorizedAdminProfile(ctx) {
  const userId = String(ctx.from?.id || '');
  const username = normalizeUsername(ctx.from?.username);

  return authorizedAdminUsers.get(userId) || authorizedAdminUsers.get(username) || null;
}

function isAuthorizedAdminUser(ctx) {
  return Boolean(getAuthorizedAdminProfile(ctx));
}

function getAllAuthorizedAdmins() {
  const admins = [];
  const seenIds = new Set();

  for (const admin of authorizedAdminUsers.values()) {
    if (!admin?.id || seenIds.has(admin.id)) {
      continue;
    }

    seenIds.add(admin.id);
    admins.push(admin);
  }

  return admins;
}

async function loadAuthorizedAdminUsers() {
  const map = new Map();

  for (const admin of getBuiltInAdmins()) {
    const normalizedAdmin = normalizeAdminProfile(admin);
    db.prepare(`
      INSERT INTO admins (id, username, first_name, last_name, role)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        role = excluded.role
    `).run(
      normalizedAdmin.id,
      normalizedAdmin.username,
      normalizedAdmin.firstName,
      normalizedAdmin.lastName,
      normalizedAdmin.role
    );
  }

  const currentAdminCount = Number(
    db.prepare('SELECT COUNT(*) AS count FROM admins').get()?.count || 0
  );

  if (currentAdminCount <= getBuiltInAdmins().length) {
    try {
      const raw = await readFile(AUTHORIZED_ADMINS_FILE, 'utf8');
      const parsed = JSON.parse(raw);

      for (const item of Array.isArray(parsed) ? parsed : []) {
        const normalizedItem = normalizeAdminProfile(item);

        if (!normalizedItem.id || !normalizedItem.username) {
          continue;
        }

        db.prepare(`
          INSERT INTO admins (id, username, first_name, last_name, role)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            username = excluded.username,
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            role = excluded.role
        `).run(
          normalizedItem.id,
          normalizedItem.username,
          normalizedItem.firstName,
          normalizedItem.lastName,
          normalizedItem.role
        );
      }
    } catch {}
  }

  const rows = db.prepare(`
    SELECT id, username, first_name, last_name, role
    FROM admins
    ORDER BY
      CASE role
        WHEN '${ADMIN_ROLE_FULL_ACCESS}' THEN 0
        ELSE 1
      END,
      first_name,
      username
  `).all();

  for (const row of rows) {
    const normalizedItem = normalizeAdminProfile({
      id: row.id,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role
    });

    map.set(normalizedItem.id, normalizedItem);
    map.set(normalizedItem.username, normalizedItem);
  }

  await saveAuthorizedAdminUsersToFile(map);
  return map;
}

async function loadActivatedChats() {
  const set = new Set();
  const currentChatCount = Number(
    db.prepare('SELECT COUNT(*) AS count FROM activated_chats').get()?.count || 0
  );

  if (currentChatCount === 0) {
    try {
      const raw = await readFile(ACTIVATED_CHATS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const chatIds = Array.isArray(parsed) ? parsed : [];

      const insertStmt = db.prepare('INSERT OR IGNORE INTO activated_chats (chat_id) VALUES (?)');
      for (const chatId of chatIds) {
        insertStmt.run(String(chatId));
      }
    } catch {}
  }

  const rows = db.prepare('SELECT chat_id FROM activated_chats').all();
  for (const row of rows) {
    set.add(String(row.chat_id));
  }

  return set;
}

async function acquireAppLock() {
  try {
    const handle = await open(APP_LOCK_FILE, 'wx');
    await handle.writeFile(`${process.pid}\n`, 'utf8');
    return handle;
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }

    const existingPid = await readLockPid();
    if (existingPid && isProcessAlive(existingPid)) {
      console.warn(`⚠️ Eski Dilnoza AI nusxasi topildi. PID: ${existingPid}. U avtomatik to‘xtatiladi.`);
      stopProcessByPid(existingPid);
      await waitForProcessExit(existingPid);
    }

    await unlink(APP_LOCK_FILE).catch(() => {});
    const retryHandle = await open(APP_LOCK_FILE, 'wx');
    await retryHandle.writeFile(`${process.pid}\n`, 'utf8');
    return retryHandle;
  }
}

async function readLockPid() {
  try {
    const raw = await readFile(APP_LOCK_FILE, 'utf8');
    const pid = Number.parseInt(raw.trim(), 10);
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (process.platform === 'win32') {
    const result = spawnSync('tasklist', ['/FI', `PID eq ${pid}`], { encoding: 'utf8' });
    return result.status === 0 && result.stdout.includes(String(pid));
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopProcessByPid(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/F'], { encoding: 'utf8' });
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {}
}

async function waitForProcessExit(pid, timeoutMs = 5000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessAlive(pid)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Eski Dilnoza AI jarayoni to‘xtamadi. PID: ${pid}`);
}

async function releaseAppLock() {
  try {
    if (appLockHandle) {
      await appLockHandle.close();
    }
  } catch {}

  await unlink(APP_LOCK_FILE).catch(() => {});
}

async function saveAuthorizedAdminUsers() {
  return saveAuthorizedAdminUsersToFile(authorizedAdminUsers);
}

async function saveAuthorizedAdminUsersToFile(adminMap) {
  const uniqueUsers = [];
  const seenIds = new Set();
  const replaceStmt = db.prepare(`
    INSERT INTO admins (id, username, first_name, last_name, role)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      role = excluded.role
  `);
  const validIds = [];

  for (const admin of adminMap.values()) {
    if (!admin?.id || seenIds.has(admin.id)) {
      continue;
    }

    seenIds.add(admin.id);
    uniqueUsers.push({
      id: admin.id,
      username: admin.username,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role === ADMIN_ROLE_FULL_ACCESS ? ADMIN_ROLE_FULL_ACCESS : ADMIN_ROLE_QA_ONLY
    });
    validIds.push(admin.id);
    replaceStmt.run(
      admin.id,
      admin.username,
      admin.firstName,
      admin.lastName,
      admin.role === ADMIN_ROLE_FULL_ACCESS ? ADMIN_ROLE_FULL_ACCESS : ADMIN_ROLE_QA_ONLY
    );
  }

  const existingRows = db.prepare('SELECT id FROM admins').all();
  for (const row of existingRows) {
    if (!validIds.includes(String(row.id))) {
      db.prepare('DELETE FROM admins WHERE id = ?').run(String(row.id));
    }
  }

  await writeFile(AUTHORIZED_ADMINS_FILE, `${JSON.stringify(uniqueUsers, null, 2)}\n`, 'utf8');
}

async function saveActivatedChats() {
  db.exec('DELETE FROM activated_chats');
  const insertStmt = db.prepare('INSERT OR IGNORE INTO activated_chats (chat_id) VALUES (?)');
  for (const chatId of activatedChats) {
    insertStmt.run(String(chatId));
  }
  await writeFile(ACTIVATED_CHATS_FILE, `${JSON.stringify([...activatedChats], null, 2)}\n`, 'utf8');
}

function getUserProfile(ctx) {
  const userId = String(ctx.from?.id || '');
  if (!userId) {
    return null;
  }

  const row = db.prepare(`
    SELECT user_id, username, first_name, last_name, preferred_language, reply_style, conversation_mode
    FROM user_profiles
    WHERE user_id = ?
  `).get(userId);

  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    preferredLanguage: row.preferred_language,
    replyStyle: row.reply_style,
    conversationMode: row.conversation_mode
  };
}

function upsertUserProfile(ctx, text = '') {
  const userId = String(ctx.from?.id || '');
  if (!userId) {
    return null;
  }

  const existingProfile = getUserProfile(ctx);
  const preferredLanguage = existingProfile?.preferredLanguage || inferPreferredLanguage(text);
  const replyStyle = existingProfile?.replyStyle || REPLY_STYLE_SHORT;
  const conversationMode = existingProfile?.conversationMode || CONVERSATION_MODE_HUMAN;

  db.prepare(`
    INSERT INTO user_profiles (
      user_id,
      username,
      first_name,
      last_name,
      preferred_language,
      reply_style,
      conversation_mode
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      preferred_language = excluded.preferred_language,
      reply_style = excluded.reply_style,
      conversation_mode = excluded.conversation_mode
  `).run(
    userId,
    normalizeUsername(ctx.from?.username),
    String(ctx.from?.first_name || '').trim(),
    String(ctx.from?.last_name || '').trim(),
    preferredLanguage,
    replyStyle,
    conversationMode
  );

  return getUserProfile(ctx);
}

function updateUserProfileSettings(ctx, updates) {
  const userId = String(ctx.from?.id || '');
  if (!userId) {
    return null;
  }

  const currentProfile = upsertUserProfile(ctx);
  const nextProfile = {
    ...currentProfile,
    preferredLanguage: updates.preferredLanguage || currentProfile.preferredLanguage,
    replyStyle: updates.replyStyle || currentProfile.replyStyle,
    conversationMode: updates.conversationMode || currentProfile.conversationMode
  };

  db.prepare(`
    UPDATE user_profiles
    SET preferred_language = ?, reply_style = ?, conversation_mode = ?
    WHERE user_id = ?
  `).run(
    nextProfile.preferredLanguage,
    nextProfile.replyStyle,
    nextProfile.conversationMode,
    userId
  );

  return getUserProfile(ctx);
}

function createConfirmationCode() {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

function savePendingConfirmation(userId, actionType, payload) {
  const confirmationCode = createConfirmationCode();
  const expiresAt = Date.now() + 5 * 60 * 1000;

  db.prepare(`
    INSERT INTO pending_confirmations (user_id, action_type, action_payload, confirmation_code, expires_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      action_type = excluded.action_type,
      action_payload = excluded.action_payload,
      confirmation_code = excluded.confirmation_code,
      expires_at = excluded.expires_at
  `).run(userId, actionType, JSON.stringify(payload), confirmationCode, expiresAt);

  return confirmationCode;
}

function getPendingConfirmation(userId) {
  const row = db.prepare(`
    SELECT user_id, action_type, action_payload, confirmation_code, expires_at
    FROM pending_confirmations
    WHERE user_id = ?
  `).get(String(userId));

  if (!row) {
    return null;
  }

  if (Number(row.expires_at) < Date.now()) {
    clearPendingConfirmation(userId);
    return null;
  }

  return {
    userId: row.user_id,
    actionType: row.action_type,
    actionPayload: JSON.parse(row.action_payload),
    confirmationCode: row.confirmation_code,
    expiresAt: Number(row.expires_at)
  };
}

function clearPendingConfirmation(userId) {
  db.prepare('DELETE FROM pending_confirmations WHERE user_id = ?').run(String(userId));
}

function loadConversationHistory(chatId) {
  const rows = db.prepare(`
    SELECT role, content
    FROM conversation_history
    WHERE chat_id = ?
    ORDER BY sequence ASC
  `).all(String(chatId));

  return rows.map((row) => ({
    role: row.role,
    content: row.content
  }));
}

function saveConversationHistory(chatId, history) {
  db.prepare('DELETE FROM conversation_history WHERE chat_id = ?').run(String(chatId));
  const insertStmt = db.prepare(`
    INSERT INTO conversation_history (chat_id, role, content)
    VALUES (?, ?, ?)
  `);

  for (const item of history) {
    insertStmt.run(String(chatId), item.role, item.content);
  }
}

function clearConversationHistory(chatId) {
  db.prepare('DELETE FROM conversation_history WHERE chat_id = ?').run(String(chatId));
}

function extractAdminGrantCommand(text) {
  const normalizedText = normalizeText(text);
  const wantsGrant =
    normalizedText.includes('admin qilib tayinla') ||
    normalizedText.includes('admin qilib tayinlash') ||
    normalizedText.includes('adminlik xuquqi ber') ||
    normalizedText.includes('ishga tushurishiga ruxsat ber') ||
    normalizedText.includes('ishga tushirishiga ruxsat ber');

  if (!wantsGrant) {
    return null;
  }

  const idMatch = String(text).match(/ID:\s*(\d+)/i);
  const usernameMatch = String(text).match(/Username:\s*@?([A-Za-z0-9_]+)/i);
  const firstNameMatch = String(text).match(/Ism:\s*(.+)/i);
  const lastNameMatch = String(text).match(/Familiya:\s*(.+)/i);

  if (!idMatch || !usernameMatch) {
    return null;
  }

  const firstName = firstNameMatch?.[1]?.split(/\r?\n/)[0]?.trim() || '';
  const lastNameRaw = lastNameMatch?.[1]?.split(/\r?\n/)[0]?.trim() || '';

  return {
    id: idMatch[1],
    username: normalizeUsername(usernameMatch[1]),
    firstName,
    lastName: lastNameRaw === '---' ? '' : lastNameRaw
  };
}

function extractMainAdminQueryCommand(text) {
  const normalizedText = normalizeText(text);

  const wantsCount =
    normalizedText.includes('necha kishiga adminlik ruxsati berilgan') ||
    normalizedText.includes('neha kishiga adminlik ruxsati berilgan') ||
    normalizedText.includes('qancha kishiga adminlik ruxsati berilgan') ||
    normalizedText.includes('adminlar soni') ||
    normalizedText.includes('ruxsat berilganlar soni');

  if (wantsCount) {
    return { type: 'count_admins' };
  }

  const wantsList =
    normalizedText.includes('ruxsat berilgan foydalanuvchi nomlarini yubor') ||
    normalizedText.includes('ruxsat berilgan foydalanuvchilarni yubor') ||
    normalizedText.includes('admin foydalanuvchilarni yubor') ||
    normalizedText.includes('adminlar royxatini yubor') ||
    normalizedText.includes('ruxsat berilganlar royxatini yubor') ||
    normalizedText.includes('kimlarga ruxsat berilgan');

  if (wantsList) {
    return { type: 'list_admins' };
  }

  return null;
}

function extractAdminRoleUpdateCommand(text) {
  const normalizedText = normalizeText(text);
  const targetIdMatch = String(text ?? '').match(/\b\d{7,15}\b/);

  if (!targetIdMatch) {
    return null;
  }

  const wantsQaOnly =
    normalizedText.includes('buyruqlarini olib tashla') ||
    normalizedText.includes('buyruqlarni olib tashla') ||
    normalizedText.includes('faqatgina savollariga javob ber') ||
    normalizedText.includes('faqat savollariga javob ber') ||
    normalizedText.includes('faqat savoliga javob ber') ||
    normalizedText.includes('suxbat qilishingga ruxsat ber') ||
    normalizedText.includes('suhbat qilishingga ruxsat ber') ||
    normalizedText.includes('suxbat qilishiga ruxsat ber') ||
    normalizedText.includes('suhbat qilishiga ruxsat ber') ||
    normalizedText.includes('faqatgina savollarga javob ber') ||
    normalizedText.includes('faqat savollarga javob ber');

  if (wantsQaOnly) {
    return {
      type: 'set_qa_only',
      targetId: targetIdMatch[0]
    };
  }

  return null;
}

function extractAdminRemoveCommand(text) {
  const normalizedText = normalizeText(text);
  const targetIdMatch = String(text ?? '').match(/\b\d{7,15}\b/);

  if (!targetIdMatch) {
    return null;
  }

  const wantsRemove =
    normalizedText.includes('adminlikdan ol') ||
    normalizedText.includes('adminlikdan chiqar') ||
    normalizedText.includes('adminni olib tashla') ||
    normalizedText.includes('ruxsatini olib tashla') ||
    normalizedText.includes('adminni ochir') ||
    normalizedText.includes('adminni o\'chir');

  if (!wantsRemove) {
    return null;
  }

  return {
    type: 'remove_admin',
    targetId: targetIdMatch[0]
  };
}

function extractAdminFullAccessCommand(text) {
  const normalizedText = normalizeText(text);
  const targetIdMatch = String(text ?? '').match(/\b\d{7,15}\b/);

  if (!targetIdMatch) {
    return null;
  }

  const wantsFullAccess =
    normalizedText.includes('toliq buyruq huquqi ber') ||
    normalizedText.includes('to\'liq buyruq huquqi ber') ||
    normalizedText.includes('buyruq berish huquqini ber') ||
    normalizedText.includes('buyruqlarini qaytar') ||
    normalizedText.includes('buyruq huquqini qaytar') ||
    normalizedText.includes('full access ber');

  if (!wantsFullAccess) {
    return null;
  }

  return {
    type: 'set_full_access',
    targetId: targetIdMatch[0]
  };
}

function extractReplyStyleCommand(text) {
  const normalizedText = normalizeText(text);

  if (
    normalizedText.includes('qisqa javob rejimini yoq') ||
    normalizedText.includes('qisqa javob ber') ||
    normalizedText.includes('aniq va qisqa javob ber')
  ) {
    return {
      type: 'set_reply_style',
      replyStyle: REPLY_STYLE_SHORT
    };
  }

  if (
    normalizedText.includes('batafsil javob rejimini yoq') ||
    normalizedText.includes('batafsil javob ber') ||
    normalizedText.includes('toliq javob ber') ||
    normalizedText.includes('to\'liq javob ber')
  ) {
    return {
      type: 'set_reply_style',
      replyStyle: REPLY_STYLE_DETAILED
    };
  }

  return null;
}

function extractConversationModeCommand(text) {
  const normalizedText = normalizeText(text);

  if (
    normalizedText.includes('insondek suhbat qur') ||
    normalizedText.includes('insondek javob ber') ||
    normalizedText.includes('oddiy insondek gaplash')
  ) {
    return {
      type: 'set_conversation_mode',
      conversationMode: CONVERSATION_MODE_HUMAN
    };
  }

  if (
    normalizedText.includes('texnik rejimni yoq') ||
    normalizedText.includes('texnik javob ber') ||
    normalizedText.includes('faqat texnik tahlil qil')
  ) {
    return {
      type: 'set_conversation_mode',
      conversationMode: CONVERSATION_MODE_TECHNICAL
    };
  }

  return null;
}

function extractMemoryCommand(text) {
  const normalizedText = normalizeText(text);

  if (
    normalizedText.includes('xotirani tozala') ||
    normalizedText.includes('suhbatni tozala') ||
    normalizedText.includes('yangi mavzu boshlaymiz')
  ) {
    return {
      type: 'clear_memory'
    };
  }

  return null;
}

function extractProfileStatusCommand(text) {
  const normalizedText = normalizeText(text);

  if (
    normalizedText.includes('sozlamalarimni korsat') ||
    normalizedText.includes('sozlamalarimni ko\'rsat') ||
    normalizedText.includes('menga sozlamalar bolimini yubor') ||
    normalizedText.includes('menga sozlamalar bo\'limini yubor') ||
    normalizedText.includes('sozlamalar bolimini yubor') ||
    normalizedText.includes('sozlamalar bo\'limini yubor') ||
    normalizedText.includes('menga sozlamalarni yubor') ||
    normalizedText.includes('sozlamalarni yubor') ||
    normalizedText.includes('holatimni korsat') ||
    normalizedText.includes('holatimni ko\'rsat')
  ) {
    return {
      type: 'show_profile_status'
    };
  }

  return null;
}

function extractAdminHelpCommand(text) {
  const normalizedText = normalizeText(text);

  if (
    normalizedText.includes('admin buyruqlarini korsat') ||
    normalizedText.includes('admin buyruqlarini ko\'rsat') ||
    normalizedText.includes('admin buyruqlarini yubor') ||
    normalizedText.includes('menga admin buyruqlarini yubor') ||
    normalizedText.includes('yaxshi menga admin buyruqlarini yubor') ||
    normalizedText.includes('admin buyruqlari') ||
    normalizedText.includes('admin yordam') ||
    normalizedText.includes('admin help')
  ) {
    return {
      type: 'show_admin_help'
    };
  }

  return null;
}

function extractOwnerOverviewCommand(text) {
  const normalizedText = normalizeText(text);

  if (
    normalizedText.includes('ozing haqida barcha buyruqlarni') ||
    normalizedText.includes('o\'zing haqida barcha buyruqlarni') ||
    normalizedText.includes('ozing haqingda barcha buyruqlarni') ||
    normalizedText.includes('o\'zing haqingda barcha buyruqlarni') ||
    normalizedText.includes('ozing haqingda') ||
    normalizedText.includes('o\'zing haqingda') ||
    normalizedText.includes('nimalarni bajara olasan') ||
    normalizedText.includes('barcha buyruqlaringni yubor')
  ) {
    return {
      type: 'show_owner_overview'
    };
  }

  return null;
}

function resolveOwnerQuickCommand(text) {
  const normalizedText = normalizeText(text);

  if (
    normalizedText.includes('sozlama') ||
    normalizedText.includes('holat') ||
    normalizedText.includes('rejim')
  ) {
    return { type: 'show_profile_status' };
  }

  if (
    normalizedText.includes('admin') ||
    normalizedText.includes('buyruq')
  ) {
    return { type: 'show_admin_help' };
  }

  if (
    normalizedText.includes('ozing') ||
    normalizedText.includes('o\'zing') ||
    normalizedText.includes('nimalarni') ||
    normalizedText.includes('qila olasan')
  ) {
    return { type: 'show_owner_overview' };
  }

  if (
    normalizedText.includes('xotira') &&
    (normalizedText.includes('ochir') || normalizedText.includes('o\'chir') || normalizedText.includes('tozala'))
  ) {
    return { type: 'clear_memory' };
  }

  return null;
}

function extractConfirmationCommand(text) {
  const match = String(text ?? '').trim().match(/^tasdiqlayman\s+(\d{6})$/i);
  if (!match) {
    return null;
  }

  return {
    type: 'confirm_action',
    confirmationCode: match[1]
  };
}

function detectMessageIntent(text) {
  const rawText = String(text ?? '');

  if (extractConfirmationCommand(text)) {
    return extractConfirmationCommand(text);
  }

  if (extractReplyStyleCommand(text)) {
    return extractReplyStyleCommand(text);
  }

  if (extractConversationModeCommand(text)) {
    return extractConversationModeCommand(text);
  }

  if (extractMemoryCommand(text)) {
    return extractMemoryCommand(text);
  }

  if (extractProfileStatusCommand(text)) {
    return extractProfileStatusCommand(text);
  }

  if (extractAdminHelpCommand(text)) {
    return extractAdminHelpCommand(text);
  }

  if (extractOwnerOverviewCommand(text)) {
    return extractOwnerOverviewCommand(text);
  }

  if (
    normalizedText.includes('tahlil qil') ||
    normalizedText.includes('analiz qil') ||
    /^!\s*\d+\s+\d+\s+\d+/m.test(rawText) ||
    /\b(TEXT|BARCODE|PRINT|FORM|PAGE-WIDTH|ENDQR|B\s+\d+\s+\d+)/.test(rawText) ||
    /\^XA|\^FO|\^FD|\^XZ/.test(rawText)
  ) {
    return { type: 'code_analysis' };
  }

  if (
    normalizedText.includes('xato') ||
    normalizedText.includes('error') ||
    normalizedText.includes('muammo') ||
    normalizedText.includes('nima uchun ishlamayapti')
  ) {
    return { type: 'debug_help' };
  }

  return { type: 'general_chat' };
}

function isRestrictedAdminCommand(text) {
  const normalizedText = normalizeText(text);

  if (
    extractMainAdminQueryCommand(text) ||
    extractAdminGrantCommand(text) ||
    extractAdminRoleUpdateCommand(text) ||
    extractAdminRemoveCommand(text) ||
    extractAdminFullAccessCommand(text)
  ) {
    return true;
  }

  return normalizedText.startsWith('buyruq ');
}

function buildAuthorizedAdminsCountMessage() {
  const admins = getAllAuthorizedAdmins();
  return `📊 <b>Hozirda adminlik ruxsati berilgan foydalanuvchilar soni:</b> <code>${admins.length}</code>`;
}

function buildAuthorizedAdminsListMessage() {
  const admins = getAllAuthorizedAdmins();
  const lines = admins.map((admin, index) => {
    const fullName = [admin.firstName, admin.lastName].filter(Boolean).join(' ').trim() || 'Noma’lum';
    return `${index + 1}. ${escapeHTML(fullName)}\n🆔 <code>${admin.id}</code>\n🔹 @${escapeHTML(admin.username)}\n🔐 ${escapeHTML(getAdminRoleLabel(admin.role))}`;
  });

  return `📋 <b>Adminlik ruxsati berilgan foydalanuvchilar:</b>\n\n${lines.join('\n\n')}`;
}

function buildAdminHelpMessage() {
  return (
    `🛠 <b>Asosiy admin buyruqlari:</b>\n\n` +
    `1. <code>ID: 12345\nUsername: @user\nIsm: Ali\nFamiliya: Valiyev\nadmin qilib tayinla</code>\n` +
    `2. <code>5703498710 buyruqlarini olib tashla va faqat savollariga javob ber</code>\n` +
    `3. <code>5703498710 to'liq buyruq huquqi ber</code>\n` +
    `4. <code>5703498710 adminlikdan ol</code>\n` +
    `5. <code>hozirda necha kishiga adminlik ruxsati berilgan</code>\n` +
    `6. <code>ruxsat berilgan foydalanuvchilarni yubor</code>\n` +
    `   yoki <code>admin buyruqlarini yubor</code>\n` +
    `7. <code>qisqa javob ber</code> yoki <code>batafsil javob ber</code>\n` +
    `8. <code>insondek suhbat qur</code> yoki <code>texnik rejimni yoq</code>\n` +
    `9. <code>sozlamalarimni ko'rsat</code>\n` +
    `   yoki <code>menga sozlamalar bo'limini yubor</code>\n` +
    `10. <code>xotirani tozala</code>\n\n` +
    `⚠️ Xavfli amallar uchun bot sizdan <code>tasdiqlayman 123456</code> ko‘rinishida tasdiq so‘raydi.`
  );
}

function buildOwnerOverviewMessage() {
  return (
    `👑 <b>Ibrohim 1.0 uchun boshqaruv bo'limi:</b>\n\n` +
    `Men siz uchun admin va suhbat buyruqlarini bajaraman.\n\n` +
    `⚙️ <b>Sozlamalar:</b>\n` +
    `• <code>sozlamalarimni ko'rsat</code>\n` +
    `• <code>qisqa javob ber</code>\n` +
    `• <code>batafsil javob ber</code>\n` +
    `• <code>insondek suhbat qur</code>\n` +
    `• <code>texnik rejimni yoq</code>\n\n` +
    `🛠 <b>Admin buyruqlari:</b>\n` +
    `• <code>admin buyruqlarini yubor</code>\n` +
    `• <code>ruxsat berilgan foydalanuvchilarni yubor</code>\n` +
    `• <code>hozirda necha kishiga adminlik ruxsati berilgan</code>\n\n` +
    `🧹 <b>Xotira:</b>\n` +
    `• <code>xotirani tozala</code>\n\n` +
    `🎤 <b>Ovozli suhbat:</b>\n` +
    `• ovozli xabar yuborsangiz, men ovoz bilan javob beraman.`
  );
}

async function interpretOwnerCommand(text) {
  const interpreterPrompt = {
    role: 'system',
    content:
      `Siz Ibrohim 1.0 ning ichki buyruq interpretatorisiz.\n` +
      `Foydalanuvchi xo'jayin hisoblanadi va uning matnlarini avvalo buyruq sifatida talqin qiling.\n` +
      `Agar matn botning o'zi, sozlamalari, xotirasi, adminlari, buyruqlari, huquqlari, rejimlari yoki imkoniyatlari bilan bog'liq bo'lsa, albatta command action tanlang.\n` +
      `Faqat mutlaqo bog'liq action topib bo'lmaganda direct_answer tanlang.\n` +
      `Faqat JSON qaytaring. Hech qanday markdown yoki izoh yozmang.\n` +
      `Ruxsat etilgan action qiymatlari:\n` +
      `show_owner_overview, show_admin_help, show_profile_status, clear_memory, count_admins, list_admins, set_reply_style_short, set_reply_style_detailed, set_mode_human, set_mode_technical, grant_admin, set_qa_only, set_full_access, remove_admin, direct_answer.\n` +
      `grant_admin uchun target_id, target_username, target_first_name, target_last_name maydonlarini to'ldiring.\n` +
      `set_qa_only, set_full_access, remove_admin uchun target_id maydonini to'ldiring.\n` +
      `direct_answer uchun answer maydoniga xo'jayinga aniq va qisqa javob yozing.\n` +
      `Agar matnda admin, buyruq, sozlama, xotira, huquq, ruxsat, o'zing, bajara olasan, rejim kabi ma'no bo'lsa, imkon qadar command action tanlang.\n` +
      `JSON formati:\n` +
      `{"action":"direct_answer","target_id":"","target_username":"","target_first_name":"","target_last_name":"","answer":""}`
  };

  const rawResponse = await requestDilnozaAI([
    interpreterPrompt,
    {
      role: 'user',
      content: String(text ?? '')
    }
  ]);

  const jsonText = unwrapJsonText(rawResponse);
  return JSON.parse(jsonText);
}

async function executeOwnerInterpreterDecision(ctx, decision) {
  const action = String(decision?.action || '').trim();

  if (!action) {
    return false;
  }

  if (action === 'show_owner_overview') {
    await ctx.replyWithHTML(buildOwnerOverviewMessage());
    return true;
  }

  if (action === 'show_admin_help') {
    await ctx.replyWithHTML(buildAdminHelpMessage());
    return true;
  }

  if (action === 'show_profile_status') {
    const currentProfile = getUserProfile(ctx) || upsertUserProfile(ctx, '');
    await ctx.replyWithHTML(
      `ℹ️ <b>Joriy sozlamalar:</b>\n\n` +
      `💬 <b>Javob uslubi:</b> <code>${escapeHTML(currentProfile.replyStyle)}</code>\n` +
      `🧠 <b>Suhbat rejimi:</b> <code>${escapeHTML(currentProfile.conversationMode)}</code>\n` +
      `🌐 <b>Til:</b> <code>${escapeHTML(currentProfile.preferredLanguage)}</code>`
    );
    return true;
  }

  if (action === 'clear_memory') {
    userConversations.delete(ctx.chat.id);
    clearConversationHistory(ctx.chat.id);
    await ctx.replyWithHTML(`🧹 <b>Suhbat xotirasi tozalandi.</b>`);
    return true;
  }

  if (action === 'count_admins') {
    await ctx.replyWithHTML(buildAuthorizedAdminsCountMessage());
    return true;
  }

  if (action === 'list_admins') {
    await ctx.replyWithHTML(buildAuthorizedAdminsListMessage());
    return true;
  }

  if (action === 'set_reply_style_short') {
    const updatedProfile = updateUserProfileSettings(ctx, { replyStyle: REPLY_STYLE_SHORT });
    await ctx.replyWithHTML(`✅ <b>Javob uslubi yangilandi.</b>\n\nYangi holat: <code>${escapeHTML(updatedProfile.replyStyle)}</code>`);
    return true;
  }

  if (action === 'set_reply_style_detailed') {
    const updatedProfile = updateUserProfileSettings(ctx, { replyStyle: REPLY_STYLE_DETAILED });
    await ctx.replyWithHTML(`✅ <b>Javob uslubi yangilandi.</b>\n\nYangi holat: <code>${escapeHTML(updatedProfile.replyStyle)}</code>`);
    return true;
  }

  if (action === 'set_mode_human') {
    const updatedProfile = updateUserProfileSettings(ctx, { conversationMode: CONVERSATION_MODE_HUMAN });
    await ctx.replyWithHTML(`✅ <b>Suhbat rejimi yangilandi.</b>\n\nYangi holat: <code>${escapeHTML(updatedProfile.conversationMode)}</code>`);
    return true;
  }

  if (action === 'set_mode_technical') {
    const updatedProfile = updateUserProfileSettings(ctx, { conversationMode: CONVERSATION_MODE_TECHNICAL });
    await ctx.replyWithHTML(`✅ <b>Suhbat rejimi yangilandi.</b>\n\nYangi holat: <code>${escapeHTML(updatedProfile.conversationMode)}</code>`);
    return true;
  }

  if (action === 'grant_admin') {
    if (!decision?.target_id || !decision?.target_username) {
      return false;
    }

    const savedAdmin = await grantAdminAccess({
      id: String(decision.target_id),
      username: String(decision.target_username),
      firstName: String(decision.target_first_name || '').trim(),
      lastName: String(decision.target_last_name || '').trim()
    });

    await logToAdmin(ctx, 'ADMIN', `Owner interpretatori orqali admin saqlandi: ID ${savedAdmin.id}, Username @${savedAdmin.username}`);
    await ctx.replyWithHTML(
      `✅ <b>Admin ruxsati saqlandi.</b>\n\n` +
      `👤 <b>Ism:</b> ${escapeHTML(savedAdmin.firstName || 'Noma’lum')}\n` +
      `🆔 <b>ID:</b> <code>${savedAdmin.id}</code>\n` +
      `🔹 <b>Username:</b> @${escapeHTML(savedAdmin.username)}`
    );
    return true;
  }

  if (action === 'set_qa_only') {
    if (!decision?.target_id) {
      return false;
    }

    const updatedAdmin = await updateAdminRole(String(decision.target_id), ADMIN_ROLE_QA_ONLY);
    if (!updatedAdmin) {
      await ctx.replyWithHTML(`⚠️ <b>Ko‘rsatilgan ID topilmadi.</b>`);
      return true;
    }

    await ctx.replyWithHTML(
      `✅ <b>Buyruq bajarildi.</b>\n\n` +
      `🆔 <b>ID:</b> <code>${updatedAdmin.id}</code>\n` +
      `🔹 <b>Username:</b> @${escapeHTML(updatedAdmin.username)}\n` +
      `🔐 <b>Yangi holat:</b> ${escapeHTML(getAdminRoleLabel(updatedAdmin.role))}`
    );
    return true;
  }

  if (action === 'set_full_access') {
    if (!decision?.target_id || String(decision.target_id) === DILNOZA_ADMIN_ID) {
      await ctx.replyWithHTML(`⚠️ <b>Ko‘rsatilgan ID uchun to‘liq huquq berib bo‘lmadi.</b>`);
      return true;
    }

    const updatedAdmin = await updateAdminRole(String(decision.target_id), ADMIN_ROLE_FULL_ACCESS);
    if (!updatedAdmin) {
      await ctx.replyWithHTML(`⚠️ <b>Ko‘rsatilgan ID topilmadi.</b>`);
      return true;
    }

    await ctx.replyWithHTML(
      `✅ <b>To‘liq buyruq huquqi berildi.</b>\n\n` +
      `🆔 <b>ID:</b> <code>${updatedAdmin.id}</code>\n` +
      `🔹 <b>Username:</b> @${escapeHTML(updatedAdmin.username)}\n` +
      `🔐 <b>Holat:</b> ${escapeHTML(getAdminRoleLabel(updatedAdmin.role))}`
    );
    return true;
  }

  if (action === 'remove_admin') {
    if (!decision?.target_id || String(decision.target_id) === MAIN_ADMIN_ID || String(decision.target_id) === DILNOZA_ADMIN_ID) {
      await ctx.replyWithHTML(`⚠️ <b>Ko‘rsatilgan adminni olib tashlab bo‘lmadi.</b>`);
      return true;
    }

    const removedAdmin = await removeAdminAccess(String(decision.target_id));
    if (!removedAdmin) {
      await ctx.replyWithHTML(`⚠️ <b>Ko‘rsatilgan admin topilmadi.</b>`);
      return true;
    }

    await ctx.replyWithHTML(
      `✅ <b>Admin ruxsati olib tashlandi.</b>\n\n` +
      `🆔 <b>ID:</b> <code>${removedAdmin.id}</code>\n` +
      `🔹 <b>Username:</b> @${escapeHTML(removedAdmin.username)}`
    );
    return true;
  }

  if (action === 'direct_answer') {
    const answer = String(decision?.answer || '').trim();
    if (!answer) {
      return false;
    }

    await ctx.replyWithHTML(formatMarkdownToHTML(answer));
    return true;
  }

  return false;
}

async function logIncomingSupportMessage(ctx, text) {
  if (typeof text !== 'string' || !text.trim()) {
    return;
  }

  const activationState = 'Bot faol holatda';
  await logToAdmin(ctx, 'SUPPORT', `${activationState}\n\nBotga yuborilgan xabar:\n${text}`);
}

function getIncomingMessageText(ctx) {
  if (typeof ctx.message?.text === 'string' && ctx.message.text.trim()) {
    return ctx.message.text;
  }

  if (typeof ctx.message?.caption === 'string' && ctx.message.caption.trim()) {
    return ctx.message.caption;
  }

  if (ctx.message?.voice) {
    return '[Ovozli xabar yuborildi]';
  }

  if (ctx.message?.audio) {
    return '[Audio xabar yuborildi]';
  }

  return '';
}

function hasVoiceOrAudioMessage(ctx) {
  return Boolean(ctx.message?.voice || ctx.message?.audio);
}

function buildMainKeyboard(ctx) {
  const rows = [
    ['🧹 Xotirani tozala', '⚙️ Sozlamalarim'],
    ['ℹ️ Yordam', '🆔 Mening ID'],
    ['🎤 Ovozli suhbat', '📨 Murojaat']
  ];

  if (isMainAdminUser(ctx)) {
    rows.push(['🛠 Admin buyruqlari', '👑 Imkoniyatlar']);
  }

  return Markup.keyboard(rows).resize().persistent();
}

async function grantAdminAccess(adminCandidate) {
  const normalizedAdmin = normalizeAdminProfile(adminCandidate);

  authorizedAdminUsers.set(normalizedAdmin.id, normalizedAdmin);
  authorizedAdminUsers.set(normalizedAdmin.username, normalizedAdmin);
  await saveAuthorizedAdminUsers();

  return normalizedAdmin;
}

async function updateAdminRole(targetId, role) {
  const normalizedId = String(targetId || '').trim();
  const existingAdmin = authorizedAdminUsers.get(normalizedId);

  if (!existingAdmin) {
    return null;
  }

  if (normalizedId === MAIN_ADMIN_ID) {
    return normalizeAdminProfile({ ...existingAdmin, role: ADMIN_ROLE_FULL_ACCESS });
  }

  const updatedAdmin = normalizeAdminProfile({
    ...existingAdmin,
    role
  });

  authorizedAdminUsers.set(updatedAdmin.id, updatedAdmin);
  authorizedAdminUsers.set(updatedAdmin.username, updatedAdmin);
  await saveAuthorizedAdminUsers();
  return updatedAdmin;
}

async function removeAdminAccess(targetId) {
  const normalizedId = String(targetId || '').trim();
  const existingAdmin = authorizedAdminUsers.get(normalizedId);

  if (!existingAdmin || normalizedId === MAIN_ADMIN_ID) {
    return null;
  }

  authorizedAdminUsers.delete(existingAdmin.id);
  authorizedAdminUsers.delete(existingAdmin.username);
  await saveAuthorizedAdminUsers();
  return existingAdmin;
}

function buildSystemPrompt(ctx, userMessage) {
  const userProfile = getUserProfile(ctx) || upsertUserProfile(ctx, userMessage);
  const intent = detectMessageIntent(userMessage);
  const ownerText = isMainAdminUser(ctx)
    ? `Siz hozir Ibrohim 1.0, ya'ni bot xo'jayini bilan gaplashyapsiz. Uning matnlarini oddiy savoldan ko'ra ko'rsatma va buyruq sifatida talqin qiling. Botning o'zi, sozlamalari, adminlari, buyruqlari, rejimlari yoki imkoniyatlari haqida yozsa, rad javobi bermang va imkon qadar bajarish yoki aniq boshqaruv javobini bering. "Qila olmayman", "ega emasman", "imkonim yo'q" kabi iboralarni ishlatmang, agar texnik cheklov bo'lmasa.`
    : '';
  const styleText = userProfile?.replyStyle === REPLY_STYLE_DETAILED
    ? 'Foydalanuvchi batafsil javobni afzal ko‘radi, lekin keraksiz takror bo‘lmasin.'
    : 'Foydalanuvchi qisqa va aniq javobni afzal ko‘radi. Imkon qadar 2-6 satrda javob bering.';
  const modeText = userProfile?.conversationMode === CONVERSATION_MODE_TECHNICAL
    ? 'Javoblarda texnik aniqlik birinchi o‘rinda bo‘lsin.'
    : 'Suhbatda samimiy, tabiiy va insoniy ohangni saqlang.';

  let intentText = 'Oddiy foydalanuvchi savoliga to‘g‘ridan to‘g‘ri javob bering.';

  if (intent.type === 'code_analysis') {
    intentText = 'Foydalanuvchi kod yoki printer buyruqlarini yuborgan. Avval muammo yoki xulosani qisqa ayting, keyin kerak bo‘lsa 3-6 ta aniq punkt bering.';
  } else if (intent.type === 'debug_help') {
    intentText = 'Foydalanuvchi xato yoki nosozlik haqida so‘rayapti. Avval sababni aniq ayting, keyin yechimni qisqa ko‘rsating.';
  }

  return {
    role: 'system',
    content: `${SYSTEM_PROMPT.content}\n${ownerText}\n${styleText}\n${modeText}\n${intentText}`
  };
}

async function executeConfirmedAction(ctx, confirmation) {
  if (confirmation.actionType === 'remove_admin') {
    const removedAdmin = await removeAdminAccess(confirmation.actionPayload.targetId);
    clearPendingConfirmation(ctx.from.id);

    if (!removedAdmin) {
      await ctx.replyWithHTML(`⚠️ <b>Admin topilmadi yoki o‘chirib bo‘lmadi.</b>`);
      return true;
    }

    await logToAdmin(ctx, 'ADMIN', `Admin ruxsati olib tashlandi: ID ${removedAdmin.id}, Username @${removedAdmin.username}`);
    await ctx.replyWithHTML(
      `✅ <b>Admin ruxsati olib tashlandi.</b>\n\n` +
      `🆔 <b>ID:</b> <code>${removedAdmin.id}</code>\n` +
      `🔹 <b>Username:</b> @${escapeHTML(removedAdmin.username)}`
    );
    return true;
  }

  if (confirmation.actionType === 'set_full_access') {
    const updatedAdmin = await updateAdminRole(confirmation.actionPayload.targetId, ADMIN_ROLE_FULL_ACCESS);
    clearPendingConfirmation(ctx.from.id);

    if (!updatedAdmin) {
      await ctx.replyWithHTML(`⚠️ <b>Admin topilmadi.</b>`);
      return true;
    }

    await logToAdmin(ctx, 'ADMIN', `Admin huquqi kengaytirildi: ID ${updatedAdmin.id} endi to'liq buyruq huquqiga ega.`);
    await ctx.replyWithHTML(
      `✅ <b>To‘liq buyruq huquqi berildi.</b>\n\n` +
      `🆔 <b>ID:</b> <code>${updatedAdmin.id}</code>\n` +
      `🔹 <b>Username:</b> @${escapeHTML(updatedAdmin.username)}\n` +
      `🔐 <b>Holat:</b> ${escapeHTML(getAdminRoleLabel(updatedAdmin.role))}`
    );
    return true;
  }

  clearPendingConfirmation(ctx.from.id);
  return false;
}

// Oddiy Markdown matnni Telegram tushunadigan HTML ga o'tkazish
function formatMarkdownToHTML(text) {
  const sourceText = String(text ?? '');

  // Avval kod bloklarini ajratib olib, oddiy escaping dan himoya qilamiz
  const codeBlocks = [];
  let formatted = sourceText.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `ZZCODEBLOCK${codeBlocks.length}ZZ`;
    codeBlocks.push({ lang, code });
    return placeholder;
  });

  // Inline kodlarni ham alohida himoya qilamiz
  const inlineCodes = [];
  formatted = formatted.replace(/`([^`\n]+)`/g, (match, code) => {
    const placeholder = `ZZINLINECODE${inlineCodes.length}ZZ`;
    inlineCodes.push(code);
    return placeholder;
  });

  // Qolgan matndagi maxsus belgilarni xavfsizlashtiramiz
  formatted = escapeHTML(formatted);

  // Sarlavhalarni qalin ko'rinishga o'tkazamiz
  formatted = formatted.replace(/^### (.*$)/gim, '<b>$1</b>');
  formatted = formatted.replace(/^## (.*$)/gim, '<b>$1</b>');
  formatted = formatted.replace(/^# (.*$)/gim, '<b>$1</b>');

  // Qalin matnni formatlaymiz (**matn** yoki __matn__)
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  formatted = formatted.replace(/__(.*?)__/g, '<b>$1</b>');

  // Kursiv matnni xavfsiz ko'rinishda formatlaymiz
  formatted = formatted.replace(/\*(.*?)\*/g, '<i>$1</i>');

  // Inline kodlarni qayta joyiga tiklaymiz
  inlineCodes.forEach((code, index) => {
    formatted = formatted.replace(`ZZINLINECODE${index}ZZ`, `<code>${escapeHTML(code)}</code>`);
  });

  // Kod bloklarini qayta joyiga tiklaymiz
  codeBlocks.forEach((block, index) => {
    const escapedCode = escapeHTML(block.code.trim());
    const langHeader = block.lang ? `<b>[${block.lang.toUpperCase()}]</b>\n` : '';
    formatted = formatted.replace(`ZZCODEBLOCK${index}ZZ`, `${langHeader}<pre>${escapedCode}</pre>`);
  });

  return formatted;
}

async function requestDilnozaAI(messages) {
  if (!DILNOZA_AI_API_KEY) {
    throw new Error('DILNOZA_AI_API_KEY sozlanmagan.');
  }

  if (!isDirectDilnozaKey && !isStandardDilnozaKey) {
    const error = new Error('Dilnoza AI kaliti yaroqsiz yoki mos emas.');
    error.status = 401;
    throw error;
  }

  const data = isDirectDilnozaKey
    ? await requestDilnozaDirect(messages)
    : await requestDilnozaStandard(messages);

  const text = extractDilnozaText(data);

  if (!text) {
    const error = new Error('Dilnoza AI dan bo‘sh javob qaytdi.');
    error.status = 502;
    throw error;
  }

  return text;
}

async function requestDilnozaDirect(messages) {
  const resolvedModel = dilnozaAiModelMap.direct[DILNOZA_AI_MODEL] || DILNOZA_AI_MODEL;
  const systemPromptContent = extractSystemPromptContent(messages);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolvedModel)}:generateContent?key=${encodeURIComponent(DILNOZA_AI_API_KEY)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPromptContent }]
      },
      contents: messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(message.content ?? '') }]
        }))
    })
  });

  return parseDilnozaResponse(response);
}

async function requestDilnozaStandard(messages) {
  const resolvedModel = dilnozaAiModelMap.standard[DILNOZA_AI_MODEL] || DILNOZA_AI_MODEL;
  const endpoint = getStandardDilnozaEndpoint('/v1/chat/completions');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DILNOZA_AI_API_KEY}`
    },
    body: JSON.stringify({
      model: resolvedModel,
      messages
    })
  });

  return parseDilnozaResponse(response);
}

async function transcribeDilnozaAudio(ctx) {
  if (!isStandardDilnozaKey) {
    const error = new Error('Ovozli suhbat uchun standard Dilnoza AI kaliti kerak.');
    error.status = 400;
    throw error;
  }

  const fileId = ctx.message?.voice?.file_id || ctx.message?.audio?.file_id;
  if (!fileId) {
    throw new Error('Ovozli fayl topilmadi.');
  }

  const fileLink = await ctx.telegram.getFileLink(fileId);
  const sourceResponse = await fetch(fileLink.href);
  if (!sourceResponse.ok) {
    throw new Error('Telegramdan ovozli faylni yuklab bo‘lmadi.');
  }

  const fileBuffer = Buffer.from(await sourceResponse.arrayBuffer());
  const filePath = String(fileLink.pathname || '');
  const isVoiceMessage = Boolean(ctx.message?.voice);
  const fallbackName = isVoiceMessage ? 'voice-message.ogg' : 'audio-message.mp3';
  const rawFilename = filePath.split('/').filter(Boolean).at(-1) || fallbackName;
  const filename = normalizeAudioUploadName(rawFilename, isVoiceMessage);
  const mimeType = inferAudioMimeType(filename);

  const formData = new FormData();
  formData.append('model', DILNOZA_AI_TRANSCRIBE_MODEL);
  formData.append('file', new File([fileBuffer], filename, { type: mimeType }));

  const response = await fetch(getStandardDilnozaEndpoint('/v1/audio/transcriptions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DILNOZA_AI_API_KEY}`
    },
    body: formData
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Ovozli xabar matnga aylantirilmadi.');
    error.status = response.status;
    throw error;
  }

  const text = String(data?.text || '').trim();
  if (!text) {
    const error = new Error('Ovozli xabardan matn olinmadi.');
    error.status = 422;
    throw error;
  }

  return text;
}

async function synthesizeDilnozaVoice(text) {
  if (!isStandardDilnozaKey) {
    const error = new Error('Ovozli javob uchun standard Dilnoza AI kaliti kerak.');
    error.status = 400;
    throw error;
  }

  const voiceConfig = DILNOZA_AI_CUSTOM_VOICE_ID
    ? { id: DILNOZA_AI_CUSTOM_VOICE_ID }
    : DILNOZA_AI_VOICE_NAME;

  const response = await fetch(getStandardDilnozaEndpoint('/v1/audio/speech'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DILNOZA_AI_API_KEY}`
    },
    body: JSON.stringify({
      model: DILNOZA_AI_TTS_MODEL,
      voice: voiceConfig,
      input: String(text ?? '').trim(),
      language: DILNOZA_AI_VOICE_LANGUAGE,
      response_format: 'opus'
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data?.error?.message || 'Ovozli javob yaratilmadi.');
    error.status = response.status;
    throw error;
  }

  return Buffer.from(await response.arrayBuffer());
}

async function parseDilnozaResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data?.error?.message || `Dilnoza AI so‘rovi ${response.status} holat kodi bilan muvaffaqiyatsiz tugadi.`
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

function extractDilnozaText(data) {
  const directText = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text || '')
    .join('')
    .trim();

  if (directText) {
    return directText;
  }

  const standardText = data?.choices?.[0]?.message?.content;
  return typeof standardText === 'string' ? standardText.trim() : '';
}

// Asosiy nazorat middleware
bot.use(async (ctx, next) => {
  if (LOG_GROUP_ID && ctx.chat?.id?.toString() === LOG_GROUP_ID) {
    return next();
  }

  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }
  const chatKey = String(chatId);

  const text = getIncomingMessageText(ctx);
  const isVoiceOrAudio = hasVoiceOrAudioMessage(ctx);
  upsertUserProfile(ctx, text);
  await logIncomingSupportMessage(ctx, text);

  if (!isVoiceOrAudio && typeof text === 'string' && isMainAdminUser(ctx)) {
    const ownerQuickCommand = resolveOwnerQuickCommand(text);
    const ownerOverviewCommand = extractOwnerOverviewCommand(text);
    if (ownerOverviewCommand?.type === 'show_owner_overview' || ownerQuickCommand?.type === 'show_owner_overview') {
      await ctx.replyWithHTML(buildOwnerOverviewMessage());
      return;
    }

    const adminHelpCommand = extractAdminHelpCommand(text);
    if (adminHelpCommand?.type === 'show_admin_help' || ownerQuickCommand?.type === 'show_admin_help') {
      await ctx.replyWithHTML(buildAdminHelpMessage());
      return;
    }

    const confirmationCommand = extractConfirmationCommand(text);
    if (confirmationCommand?.type === 'confirm_action') {
      const pendingConfirmation = getPendingConfirmation(ctx.from.id);

      if (!pendingConfirmation || pendingConfirmation.confirmationCode !== confirmationCommand.confirmationCode) {
        await ctx.replyWithHTML(`⚠️ <b>Tasdiqlash kodi noto‘g‘ri yoki eskirgan.</b>`);
        return;
      }

      const handled = await executeConfirmedAction(ctx, pendingConfirmation);
      if (handled) {
        return;
      }
    }

    const mainAdminQuery = extractMainAdminQueryCommand(text);
    if (mainAdminQuery?.type === 'count_admins') {
      const message = buildAuthorizedAdminsCountMessage();
      await logToAdmin(ctx, 'ADMIN', `Admin so'rovi bajarildi: ruxsat berilganlar soni yuborildi.`);
      await ctx.replyWithHTML(message);
      return;
    }

    if (mainAdminQuery?.type === 'list_admins') {
      const message = buildAuthorizedAdminsListMessage();
      await logToAdmin(ctx, 'ADMIN', `Admin so'rovi bajarildi: ruxsat berilgan foydalanuvchilar ro'yxati yuborildi.`);
      await ctx.replyWithHTML(message);
      return;
    }

    const adminRoleUpdate = extractAdminRoleUpdateCommand(text);
    if (adminRoleUpdate?.type === 'set_qa_only') {
      const updatedAdmin = await updateAdminRole(adminRoleUpdate.targetId, ADMIN_ROLE_QA_ONLY);

      if (!updatedAdmin) {
        await ctx.replyWithHTML(
          `⚠️ <b>Ko‘rsatilgan ID topilmadi.</b>\n\n<code>${escapeHTML(adminRoleUpdate.targetId)}</code> uchun saqlangan admin ma’lumoti yo‘q.`
        );
        return;
      }

      await logToAdmin(
        ctx,
        'ADMIN',
        `Admin huquqi yangilandi: ID ${updatedAdmin.id} endi faqat savol-javob huquqiga ega.`
      );
      await ctx.replyWithHTML(
        `✅ <b>Buyruq bajarildi.</b>\n\n` +
        `🆔 <b>ID:</b> <code>${updatedAdmin.id}</code>\n` +
        `🔹 <b>Username:</b> @${escapeHTML(updatedAdmin.username)}\n` +
        `🔐 <b>Yangi holat:</b> ${escapeHTML(getAdminRoleLabel(updatedAdmin.role))}`
      );
      return;
    }

    const adminFullAccess = extractAdminFullAccessCommand(text);
    if (adminFullAccess?.type === 'set_full_access') {
      const targetAdmin = authorizedAdminUsers.get(String(adminFullAccess.targetId));

      if (!targetAdmin || String(adminFullAccess.targetId) === DILNOZA_ADMIN_ID) {
        await ctx.replyWithHTML(`⚠️ <b>Ko‘rsatilgan ID topilmadi.</b>`);
        return;
      }

      const confirmationCode = savePendingConfirmation(ctx.from.id, 'set_full_access', {
        targetId: adminFullAccess.targetId
      });
      await ctx.replyWithHTML(
        `⚠️ <b>Bu xavfli amal.</b>\n\n` +
        `To‘liq buyruq huquqini berishni tasdiqlash uchun quyidagini yuboring:\n` +
        `<code>tasdiqlayman ${confirmationCode}</code>`
      );
      return;
    }

    const adminRemove = extractAdminRemoveCommand(text);
    if (adminRemove?.type === 'remove_admin') {
      const targetAdmin = authorizedAdminUsers.get(String(adminRemove.targetId));

      if (
        !targetAdmin ||
        String(adminRemove.targetId) === MAIN_ADMIN_ID ||
        String(adminRemove.targetId) === DILNOZA_ADMIN_ID
      ) {
        await ctx.replyWithHTML(`⚠️ <b>Ko‘rsatilgan adminni olib tashlab bo‘lmadi.</b>`);
        return;
      }

      const confirmationCode = savePendingConfirmation(ctx.from.id, 'remove_admin', {
        targetId: adminRemove.targetId
      });
      await ctx.replyWithHTML(
        `⚠️ <b>Bu xavfli amal.</b>\n\n` +
        `Adminni olib tashlashni tasdiqlash uchun quyidagini yuboring:\n` +
        `<code>tasdiqlayman ${confirmationCode}</code>`
      );
      return;
    }

    const adminGrant = extractAdminGrantCommand(text);

    if (adminGrant) {
      const savedAdmin = await grantAdminAccess(adminGrant);
      await logToAdmin(
        ctx,
        'ADMIN',
        `Admin ruxsati saqlandi: ID ${savedAdmin.id}, Username @${savedAdmin.username}`
      );
      await ctx.replyWithHTML(
        `✅ <b>Admin ruxsati saqlandi.</b>\n\n` +
        `👤 <b>Ism:</b> ${escapeHTML(savedAdmin.firstName || 'Noma’lum')}\n` +
        `🆔 <b>ID:</b> <code>${savedAdmin.id}</code>\n` +
        `🔹 <b>Username:</b> @${escapeHTML(savedAdmin.username)}\n` +
        `🔐 <b>Huquq turi:</b> ${escapeHTML(getAdminRoleLabel(savedAdmin.role))}\n\n` +
        `Bu foydalanuvchi endi /start orqali botdan foydalanishi mumkin.`
      );
      return;
    }

    if (!/^\/\w+/.test(String(text).trim())) {
      try {
        const ownerDecision = await interpretOwnerCommand(text);
        const handled = await executeOwnerInterpreterDecision(ctx, ownerDecision);
        if (handled) {
          return;
        }
      } catch (error) {
        console.error('❌ Owner interpretatori xatosi:', error);
        await logToAdmin(ctx, 'ERROR', `Owner interpretatori xatosi: ${getReadableErrorText(error)}\nMatn: ${text}`).catch(console.error);
      }
    }
  }

  if (!isVoiceOrAudio && typeof text === 'string') {
    const memoryCommand = extractMemoryCommand(text);
    const ownerQuickCommand = isMainAdminUser(ctx) ? resolveOwnerQuickCommand(text) : null;
    if (memoryCommand?.type === 'clear_memory' || ownerQuickCommand?.type === 'clear_memory') {
      userConversations.delete(chatId);
      clearConversationHistory(chatId);
      await ctx.replyWithHTML(`🧹 <b>Suhbat xotirasi tozalandi.</b>`);
      return;
    }

    const profileStatusCommand = extractProfileStatusCommand(text);
    if (profileStatusCommand?.type === 'show_profile_status' || ownerQuickCommand?.type === 'show_profile_status') {
      const currentProfile = getUserProfile(ctx) || upsertUserProfile(ctx, text);
      await ctx.replyWithHTML(
        `ℹ️ <b>Joriy sozlamalar:</b>\n\n` +
        `💬 <b>Javob uslubi:</b> <code>${escapeHTML(currentProfile.replyStyle)}</code>\n` +
        `🧠 <b>Suhbat rejimi:</b> <code>${escapeHTML(currentProfile.conversationMode)}</code>\n` +
        `🌐 <b>Til:</b> <code>${escapeHTML(currentProfile.preferredLanguage)}</code>`
      );
      return;
    }

    const replyStyleCommand = extractReplyStyleCommand(text);
    if (replyStyleCommand?.type === 'set_reply_style') {
      const updatedProfile = updateUserProfileSettings(ctx, {
        replyStyle: replyStyleCommand.replyStyle
      });
      await ctx.replyWithHTML(
        `✅ <b>Javob uslubi yangilandi.</b>\n\n` +
        `Yangi holat: <code>${escapeHTML(updatedProfile.replyStyle)}</code>`
      );
      return;
    }

    const conversationModeCommand = extractConversationModeCommand(text);
    if (conversationModeCommand?.type === 'set_conversation_mode') {
      const updatedProfile = updateUserProfileSettings(ctx, {
        conversationMode: conversationModeCommand.conversationMode
      });
      await ctx.replyWithHTML(
        `✅ <b>Suhbat rejimi yangilandi.</b>\n\n` +
        `Yangi holat: <code>${escapeHTML(updatedProfile.conversationMode)}</code>`
      );
      return;
    }
  }

  if (
    !isVoiceOrAudio &&
    typeof text === 'string' &&
    getAuthorizedAdminProfile(ctx)?.role === ADMIN_ROLE_QA_ONLY &&
    isRestrictedAdminCommand(text)
  ) {
    await logToAdmin(ctx, 'ADMIN', `Ikkinchi admin buyruq yubordi, lekin unga buyruq bajarish ruxsati berilmagan.`);
    await ctx.replyWithHTML(`⛔ <b>Sizga Ibrohim 1.0 tomonidan buyruq berishga ruxsat berilmagan.</b>`);
    return;
  }

  return next();
});

// /start buyrug'i
bot.start(async (ctx) => {
  await logToAdmin(ctx, 'START', 'Foydalanuvchi /start tugmasini bosdi.');
  const adminProfile = getAuthorizedAdminProfile(ctx);
  const keyboard = buildMainKeyboard(ctx);

  userConversations.delete(ctx.chat.id);
  clearConversationHistory(ctx.chat.id);

  if (adminProfile) {
    const adminName = adminProfile.firstName || ctx.from.first_name || 'Admin';
    return ctx.replyWithHTML(
      `Assalomu alaykum ${escapeHTML(adminName)}.\n\n` +
      `Dilnoza AI ishga tayyor. Savol, buyruq yoki ovozli xabar yuborishingiz mumkin.`,
      keyboard
    );
  }

  const firstName = ctx.from.first_name || 'Do‘stim';
  const welcomeText = `✨ <b>Assalomu alaykum, ${firstName}!</b> ✨\n\n` +
    `Sizning shaxsiy <b>Dilnoza AI</b> yordamchingizga xush kelibsiz! 🚀\n\n` +
    `Men Dilnoza AI sun'iy intellekti orqali ishlayman. Menga xohlagan savolingizni berishingiz mumkin, men siz bilan muloqot qilaman va savollaringizga javob beraman.\n\n` +
    `💬 <b>Mavjud buyruqlar:</b>\n` +
    `• /start - Botni qayta ishga tushirish\n` +
    `• /clear - Xotirani tozalash (yangi mavzu boshlash)\n` +
    `• /support - Admin bilan bog'lanish (Savol/Murojaat)\n` +
    `• /myid - O'zingizning Telegram ID raqamingizni olish\n` +
    `• /help - Yordam olish\n\n` +
    `Qani, boshladik! Menga biror narsa deb yozing 👇`;

  ctx.replyWithHTML(welcomeText, keyboard);
});

// /myid yoki /groupid orqali joriy chat/guruh ID sini olish
bot.command(['myid', 'groupid'], (ctx) => {
  const chatId = ctx.chat.id;
  const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
  
  if (isGroup) {
    ctx.replyWithHTML(`👥 <b>Guruh ID raqami:</b> <code>${chatId}</code>\n\nUshbu guruhga loglar kelishi va reply qilish imkoni bo'lishi uchun, loyiha <code>.env</code> faylidagi yoki Railway'dagi <code>LOG_GROUP_ID</code> o'zgaruvchisiga ushbu ID raqamni kiriting (manfiy belgisi - bilan birga!).`);
  } else {
    ctx.replyWithHTML(`🆔 Sizning shaxsiy Telegram ID: <code>${chatId}</code>\n\nAgar loglarni shaxsiy profilingizga olmoqchi bo'lsangiz, <code>.env</code> faylidagi yoki Railway'dagi <code>LOG_GROUP_ID</code> o'zgaruvchisiga ushbu ID raqamni kiriting.`);
  }
});

// /topicid yoki /threadid orqali mavzu ID sini olish
bot.command(['topicid', 'threadid'], (ctx) => {
  const threadId = ctx.message.message_thread_id;
  if (threadId) {
    ctx.replyWithHTML(`🧵 <b>Ushbu mavzu (Topic) ID raqami:</b> <code>${threadId}</code>\n\nUshbu mavzuga tegishli loglar yuborilishi uchun loyihangizdagi <code>.env</code> faylidagi yoki Railway'dagi tegishli o'zgaruvchiga (masalan, <code>START_THREAD_ID</code>, <code>STOP_THREAD_ID</code>, <code>SUPPORT_THREAD_ID</code> yoki <code>ERROR_THREAD_ID</code>) ushbu ID raqamni kiriting.`);
  } else {
    ctx.replyWithHTML(`⚠️ Ushbu guruhda mavzular (Topics) faollashtirilmagan yoki siz hozirda guruhning "General" (Asosiy) mavzusidasiz.`);
  }
});

// /support buyrug'i
bot.command('support', async (ctx) => {
  const messageText = ctx.message.text.substring(8).trim(); // "/support" qismini olib tashlaymiz

  if (!messageText) {
    return ctx.replyWithHTML(
      `🙋‍♂️ <b>Dilnoza AI Murojaat va Yordam bo'limi</b>\n\n` +
      `Menga biror savol yoki taklifingiz bo'lsa, uni quyidagi ko'rinishda yuboring:\n` +
      `<code>/support savolingizni shu yerga yozing</code>\n\n` +
      `Admin tez orada sizga javob yozadi!`
    );
  }

  await ctx.replyWithHTML(`✅ <b>Murojaatingiz adminga muvaffaqiyatli yuborildi!</b> Tez orada javob qaytaramiz.`);
});

// Admin javoblarini ushlash uchun middleware
bot.use(async (ctx, next) => {
  // Bu belgilangan log guruhidagi reply ekanini tekshiramiz
  if (
    LOG_GROUP_ID &&
    ctx.chat?.id.toString() === LOG_GROUP_ID &&
    ctx.message?.reply_to_message
  ) {
    const replyTo = ctx.message.reply_to_message;
    const replyText = ctx.message.text;

    // Javob berilgan xabar botdan kelganmi va unda foydalanuvchi ID si bormi tekshiramiz
    if (replyTo.from?.id === ctx.botInfo.id && replyTo.text) {
      // ID ni oddiy matndan topamiz, chunki replyTo.text ichida HTML bo'lmaydi
      const match = replyTo.text.match(/ID:\s*(\d+)/);
      
      if (match) {
        const targetUserId = match[1];
        
        // Yuborish holatini ko'rsatamiz
        const statusMsg = await ctx.replyWithHTML(`⏳ <b>Xabar yuborilmoqda...</b>`);

        try {
          // Javobni foydalanuvchiga yuboramiz
          await ctx.telegram.sendMessage(
            targetUserId, 
            `✉️ <b>Admindan javob keldi:</b>\n\n${escapeHTML(replyText)}`, 
            { parse_mode: 'HTML' }
          );

          // Holatni muvaffaqiyatli deb yangilaymiz
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            null,
            `✅ <b>Xabar foydalanuvchiga muvaffaqiyatli yuborildi!</b>\n👤 Foydalanuvchi ID: <code>${targetUserId}</code>`,
            { parse_mode: 'HTML' }
          );
        } catch (err) {
          // Holatni muvaffaqiyatsiz deb yangilaymiz
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            null,
            `❌ <b>Xabar yuborilmadi!</b>\n⚠️ Sababi: <i>${escapeHTML(err.message)}</i>`,
            { parse_mode: 'HTML' }
          );
        }
        return; // Keyingi ishlovni to'xtatamiz, AI ga yubormaymiz
      }
    }
  }
  return next();
});

// /help buyrug'i
bot.help((ctx) => {
  const helpText = `ℹ️ <b>Dilnoza AI Bot Bo'yicha Yordam</b>\n\n` +
    `Men siz bilan kontekstni eslab qolgan holda suhbatlasha olaman. Maksimal ${MAX_HISTORY / 2} ta savol-javobni yodda saqlayman.\n\n` +
    `🧹 <b>Mavzuni o'zgartirmoqchi bo'lsangiz:</b>\n` +
    `Agar suhbat mavzusini o'zgartirmoqchi bo'lsangiz yoki bot noto'g'ri javob berishni boshlasa, /clear buyrug'ini yuboring yoki "xotirani tozala" deb yozing.\n\n` +
    `⌨️ <b>Tugmalar:</b>\n` +
    `• 🧹 Xotirani tozala\n` +
    `• ⚙️ Sozlamalarim\n` +
    `• 🎤 Ovozli suhbat\n` +
    `• 📨 Murojaat\n\n` +
    `⚙️ <b>Javob uslubi:</b>\n` +
    `• "qisqa javob ber" - qisqa rejim\n` +
    `• "batafsil javob ber" - batafsil rejim\n` +
    `• "insondek suhbat qur" - tabiiy suhbat rejimi\n` +
    `• "texnik rejimni yoq" - texnik tahlil rejimi\n` +
    `• "sozlamalarimni ko'rsat" - joriy sozlamalarni chiqaradi\n\n` +
    `🧠 <b>Tahlil rejimi:</b>\n` +
    `Kod, CPCL, ZPL yoki xato matn yuborsangiz, bot ularni alohida tahlil qilib, muammo va yechimni qisqa ko'rinishda aytadi.\n\n` +
    `🛠 <b>Tizim haqida:</b>\n` +
    `• Sun'iy intellekt: Dilnoza AI\n` +
    `• Til: O'zbek\n` +
    `• Saqlash tizimi: SQLite`;
  
  ctx.replyWithHTML(helpText, buildMainKeyboard(ctx));
});

bot.command('adminhelp', (ctx) => {
  if (!isMainAdminUser(ctx)) {
    return ctx.replyWithHTML(`⛔ <b>Bu buyruq faqat asosiy admin uchun.</b>`);
  }

  return ctx.replyWithHTML(buildAdminHelpMessage());
});

// Suhbat xotirasini tozalash buyrug'i
bot.command('clear', (ctx) => {
  userConversations.delete(ctx.chat.id);
  clearConversationHistory(ctx.chat.id);
  ctx.replyWithHTML(
    '🧹 <b>Suhbat xotirasi tozalandi!</b> Yangi mavzu haqida gaplashishimiz mumkin. Menga savolingizni yuboring 👇',
    buildMainKeyboard(ctx)
  );
});

bot.hears('🧹 Xotirani tozala', (ctx) => {
  userConversations.delete(ctx.chat.id);
  clearConversationHistory(ctx.chat.id);
  return ctx.replyWithHTML(
    '🧹 <b>Suhbat xotirasi tozalandi.</b>',
    buildMainKeyboard(ctx)
  );
});

bot.hears('⚙️ Sozlamalarim', (ctx) => {
  const currentProfile = getUserProfile(ctx) || upsertUserProfile(ctx, '');
  return ctx.replyWithHTML(
    `ℹ️ <b>Joriy sozlamalar:</b>\n\n` +
    `💬 <b>Javob uslubi:</b> <code>${escapeHTML(currentProfile.replyStyle)}</code>\n` +
    `🧠 <b>Suhbat rejimi:</b> <code>${escapeHTML(currentProfile.conversationMode)}</code>\n` +
    `🌐 <b>Til:</b> <code>${escapeHTML(currentProfile.preferredLanguage)}</code>`,
    buildMainKeyboard(ctx)
  );
});

bot.hears('ℹ️ Yordam', (ctx) => ctx.replyWithHTML(
  `ℹ️ <b>Qisqa yordam:</b>\n\n` +
  `• Oddiy savol yuborsangiz javob beraman\n` +
  `• Ovozli xabar yuborsangiz ovoz bilan javob beraman\n` +
  `• Kod yoki xato yuborsangiz tahlil qilaman\n` +
  `• Tugmalar orqali asosiy bo'limlarni tez ochishingiz mumkin`,
  buildMainKeyboard(ctx)
));

bot.hears('🆔 Mening ID', (ctx) => ctx.replyWithHTML(
  `🆔 <b>Sizning Telegram ID raqamingiz:</b> <code>${ctx.from?.id}</code>`,
  buildMainKeyboard(ctx)
));

bot.hears('🎤 Ovozli suhbat', (ctx) => ctx.replyWithHTML(
  `🎤 <b>Ovozli suhbat tayyor.</b>\n\nMenga ovozli xabar yuboring, men uni tinglab o'zbekcha javob qaytaraman.`,
  buildMainKeyboard(ctx)
));

bot.hears('📨 Murojaat', (ctx) => ctx.replyWithHTML(
  `📨 <b>Murojaat yuborish:</b>\n\nMenga xabaringizni yozing yoki <code>/support matn</code> ko'rinishida yuboring.`,
  buildMainKeyboard(ctx)
));

bot.hears('🛠 Admin buyruqlari', (ctx) => {
  if (!isMainAdminUser(ctx)) {
    return ctx.replyWithHTML(`⛔ <b>Bu bo'lim faqat asosiy admin uchun.</b>`, buildMainKeyboard(ctx));
  }

  return ctx.replyWithHTML(buildAdminHelpMessage(), buildMainKeyboard(ctx));
});

bot.hears('👑 Imkoniyatlar', (ctx) => {
  if (!isMainAdminUser(ctx)) {
    return ctx.replyWithHTML(`⛔ <b>Bu bo'lim faqat asosiy admin uchun.</b>`, buildMainKeyboard(ctx));
  }

  return ctx.replyWithHTML(buildOwnerOverviewMessage(), buildMainKeyboard(ctx));
});

// Asosiy xabarni qayta ishlash qismi
bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;
  await handleDilnozaConversation(ctx, userMessage, {
    replyMode: 'text',
    replyToMessageId: ctx.message.message_id
  });
});

async function handleVoiceOrAudioUpdate(ctx) {
  try {
    await ctx.sendChatAction('typing');
    const transcriptText = await transcribeDilnozaAudio(ctx);
    await logToAdmin(ctx, 'SUPPORT', `Ovozli xabar matnga aylantirildi:\n${transcriptText}`);

    await handleDilnozaConversation(ctx, transcriptText, {
      replyMode: 'voice',
      replyToMessageId: ctx.message.message_id
    });
  } catch (error) {
    console.error('❌ Ovozli xabar ishlovida xato:', error);
    await logToAdmin(
      ctx,
      'ERROR',
      `Ovozli xabar xatoligi: ${getReadableErrorText(error)}`
    ).catch(console.error);

    let errorMessage = `❌ <b>Ovozli xabarni ishlov berib bo'lmadi.</b>\n\n`;
    if (error.status === 400 && String(error.message).includes('standard Dilnoza AI kaliti')) {
      errorMessage += `Ovozli suhbat uchun ovoz qo'llaydigan Dilnoza AI kaliti kerak bo'ladi.`;
    } else {
      errorMessage += `${escapeHTML(error.message)}`;
    }

    await ctx.replyWithHTML(errorMessage, {
      reply_to_message_id: ctx.message.message_id
    }).catch(() => ctx.replyWithHTML(errorMessage));
  }
}

bot.on('voice', handleVoiceOrAudioUpdate);
bot.on('audio', handleVoiceOrAudioUpdate);

bot.on(['photo', 'document'], async (ctx) => {
  const captionText = String(ctx.message?.caption || '').trim();

  if (captionText) {
    await handleDilnozaConversation(ctx, captionText, {
      replyMode: 'text',
      replyToMessageId: ctx.message.message_id
    });
    return;
  }

  await ctx.replyWithHTML(
    `📎 <b>Fayl qabul qilindi.</b>\n\n` +
    `Hozir rasm yoki fayl bilan birga izoh matni yuborsangiz, men shu matn bo'yicha javob beraman.`,
    {
      reply_to_message_id: ctx.message.message_id
    }
  );
});

// Webhook yoki polling uchun server sozlamalari
const configuredPort = Number.parseInt(process.env.PORT || '0', 10);
const PORT = Number.isInteger(configuredPort) && configuredPort >= 0 ? configuredPort : 0;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Dilnoza AI boti muammosiz ishlayapti.\n');
});

async function launchBot() {
  if (!BOT_TOKEN || !hasValidBotTokenFormat) {
    console.error('❌ Telegram boti ishga tushirilmadi: BOT_TOKEN yo‘q yoki noto‘g‘ri. .env ichiga @BotFather bergan haqiqiy tokenni kiriting.');
    return;
  }

  try {
    await bot.launch();
    console.log('🤖 Dilnoza AI Telegram boti polling rejimida muvaffaqiyatli ishga tushdi!');
  } catch (err) {
    if (err?.response?.error_code === 409) {
      console.error('❌ Telegram botini ishga tushirishda konflikt yuz berdi: shu token bilan boshqa nusxa allaqachon polling rejimida ishlayapti.');
      return;
    }

    if (err?.response?.error_code === 404) {
      console.error('❌ Telegram botini ishga tushirib bo‘lmadi: BOT_TOKEN Telegram tomonidan topilmadi. Token noto‘g‘ri, eskirgan yoki boshqa kalit bilan almashtirib yuborilgan bo‘lishi mumkin.');
      return;
    }

    console.error('❌ Telegram botini ishga tushirib bo‘lmadi:', err);
  }
}

function startServer(preferredPort) {
  let retriedWithRandomPort = false;

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && !retriedWithRandomPort) {
      retriedWithRandomPort = true;
      console.warn(`⚠️ ${preferredPort}-port band. Tasodifiy bo‘sh port tanlanadi.`);
      server.listen(0, '0.0.0.0');
      return;
    }

    console.error('❌ Tekshiruv serverini ishga tushirib bo‘lmadi:', err);
  });

  server.on('listening', async () => {
    const address = server.address();
    const activePort = typeof address === 'object' && address ? address.port : preferredPort;
    console.log(`🚀 Dilnoza AI tekshiruv serveri ${activePort}-portda tinglayapti.`);
    await launchBot();
  });

  if (preferredPort === 0) {
    server.listen(0, '0.0.0.0');
    return;
  }

  server.listen(preferredPort, '0.0.0.0');
}

startServer(PORT);

function getReadableErrorText(error) {
  const errorText = String(error?.message || '').toLowerCase();

  if (
    error?.status === 401 ||
    errorText.includes('dilnoza_ai_api_key') ||
    errorText.includes('api key') ||
    errorText.includes('kaliti yaroqsiz')
  ) {
    return 'Dilnoza AI kaliti bilan bog‘liq muammo aniqlandi.';
  }

  if (error?.status === 429) {
    return 'Dilnoza AI limitiga yetildi.';
  }

  if (error?.status === 502) {
    return 'Dilnoza AI javobi vaqtincha bo‘sh yoki to‘liq kelmadi.';
  }

  return 'Dilnoza AI ishlashida ichki muammo yuz berdi.';
}

async function handleDilnozaConversation(ctx, userMessage, options = {}) {
  const chatId = ctx.chat.id;

  if (!DILNOZA_AI_API_KEY) {
    await ctx.replyWithHTML(
      `⚠️ <b>Kechirasiz!</b> Dilnoza AI API kaliti sozlanmagan.\n\n` +
      `Iltimos, muhit o'zgaruvchilariga <code>DILNOZA_AI_API_KEY</code> kalitini qo'shing.`
    );
    return;
  }

  if (!userConversations.has(chatId)) {
    userConversations.set(chatId, loadConversationHistory(chatId));
  }
  const history = userConversations.get(chatId);

  history.push({ role: 'user', content: userMessage });
  trimHistory(history);
  saveConversationHistory(chatId, history);

  try {
    await ctx.sendChatAction(options.replyMode === 'voice' ? 'record_voice' : 'typing');

    const messages = [
      buildSystemPrompt(ctx, userMessage),
      ...history
    ];

    const botResponse = await requestDilnozaAI(messages);

    if (options.replyMode === 'voice') {
      await ctx.sendChatAction('record_voice');
      const voiceBuffer = await synthesizeDilnozaVoice(botResponse);
      await ctx.replyWithVoice(Input.fromBuffer(voiceBuffer, 'dilnoza-voice-reply.ogg'), {
        reply_to_message_id: options.replyToMessageId
      });
    } else {
      const formattedResponse = formatMarkdownToHTML(botResponse);
      await ctx.replyWithHTML(formattedResponse, {
        reply_to_message_id: options.replyToMessageId
      });
    }

    history.push({ role: 'assistant', content: botResponse });
    trimHistory(history);
    saveConversationHistory(chatId, history);
  } catch (error) {
    console.error('❌ Dilnoza AI yoki Telegram API xatosi:', error);

    await logToAdmin(
      ctx,
      'ERROR',
      `Xatolik tafsiloti: ${getReadableErrorText(error)}\nFoydalanuvchi yuborgan matn: ${userMessage}`
    ).catch(console.error);

    let errorMessage = `❌ <b>Kechirasiz, xatolik yuz berdi!</b>\n\n`;
    if (error.status === 401 || String(error.message).includes('Incorrect API key')) {
      errorMessage += `API kaliti noto'g'ri kiritilgan. Iltimos, <code>DILNOZA_AI_API_KEY</code> ni tekshiring.`;
    } else if (error.status === 429) {
      errorMessage += `Dilnoza AI limitingizga yetgansiz. Iltimos, hisob sozlamalaringizni tekshiring.`;
    } else if (error.status === 400 && String(error.message).includes('standard Dilnoza AI kaliti')) {
      errorMessage += `Ovozli suhbat uchun ovoz qo'llaydigan Dilnoza AI kaliti kerak bo'ladi.`;
    } else {
      errorMessage += `Tizimda muammo yuz berdi: <i>${escapeHTML(error.message)}</i>`;
    }

    if (history.at(-1)?.role === 'user' && history.at(-1)?.content === userMessage) {
      history.pop();
      saveConversationHistory(chatId, history);
    }

    await ctx.replyWithHTML(errorMessage, {
      reply_to_message_id: options.replyToMessageId
    }).catch(() => ctx.replyWithHTML(errorMessage));
  }
}

// Dastur to'g'ri yopilishi uchun ishlov beramiz
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  server.close();
  releaseAppLock().finally(() => process.exit(0));
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  server.close();
  releaseAppLock().finally(() => process.exit(0));
});

// Dilnoza AI bot kodi yakuni
