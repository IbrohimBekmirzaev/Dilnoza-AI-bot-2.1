import { Telegraf } from 'telegraf';
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';
import http from 'http';
import { open, readFile, unlink, writeFile } from 'fs/promises';

// Dasturlash vaqtida muhit o'zgaruvchilarini yuklaymiz
dotenv.config();

// Tokenlarni tekshirish
const BOT_TOKEN = process.env.BOT_TOKEN;
const DILNOZA_AI_API_KEY = process.env.DILNOZA_AI_API_KEY;
const DILNOZA_AI_MODEL = process.env.DILNOZA_AI_MODEL || 'dilnoza-2.1';
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
const ACTIVATION_PHRASE = process.env.ACTIVATION_PHRASE || 'Dilnoza 2.1 men Ibrohim 1.0 man ishga tush';
const DEACTIVATION_PHRASE = process.env.DEACTIVATION_PHRASE || 'Dilnoza ishdan toxta';
const MAIN_ADMIN_ID = '7610350762';
const MAIN_ADMIN_USERNAME = 'xizmartservice';
const DILNOZA_ADMIN_ID = '5703498710';
const DILNOZA_ADMIN_USERNAME = 'ybkvn_20';
const AUTHORIZED_ADMINS_FILE = new URL('./authorized-admins.json', import.meta.url);
const ACTIVATED_CHATS_FILE = new URL('./activated-chats.json', import.meta.url);
const APP_LOCK_FILE = new URL('./dilnoza-ai.lock', import.meta.url);
const ADMIN_ROLE_FULL_ACCESS = 'full_access';
const ADMIN_ROLE_QA_ONLY = 'qa_only';
const LOG_TYPE_LABELS = {
  START: 'Boshlash',
  STOP: 'To\'xtatish',
  ADMIN: 'Admin',
  SUPPORT: 'Murojaat',
  ERROR: 'Xato'
};

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
Javoblaringiz aniq, mazmunli va foydali bo'lsin.
Agar foydalanuvchi o'zbek tilida yozsa, o'zbek tilida, rus tilida yozsa rus tilida, ingliz tilida yozsa ingliz tilida javob bering.
Matnni chiroyli va tushunarli formatlang.`
};

// Telegram parser xatolarining oldini olish uchun HTML teglarni xavfsizlashtirish
function escapeHTML(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

function isActivationMessage(text) {
  return normalizeText(text) === normalizeText(ACTIVATION_PHRASE);
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
    map.set(admin.id, admin);
    map.set(admin.username, admin);
  }

  try {
    const raw = await readFile(AUTHORIZED_ADMINS_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    for (const item of Array.isArray(parsed) ? parsed : []) {
      const normalizedItem = normalizeAdminProfile(item);

      if (!normalizedItem.id || !normalizedItem.username) {
        continue;
      }

      map.set(normalizedItem.id, normalizedItem);
      map.set(normalizedItem.username, normalizedItem);
    }

    return map;
  } catch {
    await saveAuthorizedAdminUsersToFile(map);
    return map;
  }
}

async function loadActivatedChats() {
  try {
    const raw = await readFile(ACTIVATED_CHATS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const chatIds = Array.isArray(parsed) ? parsed : [];
    return new Set(chatIds.map((chatId) => String(chatId)));
  } catch {
    return new Set();
  }
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
  }

  await writeFile(AUTHORIZED_ADMINS_FILE, `${JSON.stringify(uniqueUsers, null, 2)}\n`, 'utf8');
}

async function saveActivatedChats() {
  await writeFile(ACTIVATED_CHATS_FILE, `${JSON.stringify([...activatedChats], null, 2)}\n`, 'utf8');
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

function isRestrictedAdminCommand(text) {
  const normalizedText = normalizeText(text);

  if (extractMainAdminQueryCommand(text) || extractAdminGrantCommand(text) || extractAdminRoleUpdateCommand(text)) {
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

async function logIncomingSupportMessage(ctx, text) {
  if (typeof text !== 'string' || !text.trim()) {
    return;
  }

  const activationState = activatedChats.has(String(ctx.chat?.id ?? '')) ? 'Bot faol holatda' : 'Bot hali faollashmagan';
  await logToAdmin(ctx, 'SUPPORT', `${activationState}\n\nBotga yuborilgan xabar:\n${text}`);
}

function getIncomingMessageText(ctx) {
  if (typeof ctx.message?.text === 'string' && ctx.message.text.trim()) {
    return ctx.message.text;
  }

  if (typeof ctx.message?.caption === 'string' && ctx.message.caption.trim()) {
    return ctx.message.caption;
  }

  return '';
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

// Oddiy Markdown matnni Telegram tushunadigan HTML ga o'tkazish
function formatMarkdownToHTML(text) {
  const sourceText = String(text ?? '');

  // Avval kod bloklarini ajratib olib, oddiy escaping dan himoya qilamiz
  const codeBlocks = [];
  let formatted = sourceText.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `@@CODE_BLOCK_${codeBlocks.length}@@`;
    codeBlocks.push({ lang, code });
    return placeholder;
  });

  // Inline kodlarni ham alohida himoya qilamiz
  const inlineCodes = [];
  formatted = formatted.replace(/`([^`\n]+)`/g, (match, code) => {
    const placeholder = `@@INLINE_CODE_${inlineCodes.length}@@`;
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

  // Kursiv matnni formatlaymiz (*matn* yoki _matn_)
  formatted = formatted.replace(/\*(.*?)\*/g, '<i>$1</i>');
  formatted = formatted.replace(/_(.*?)_/g, '<i>$1</i>');

  // Inline kodlarni qayta joyiga tiklaymiz
  inlineCodes.forEach((code, index) => {
    formatted = formatted.replace(`@@INLINE_CODE_${index}@@`, `<code>${escapeHTML(code)}</code>`);
  });

  // Kod bloklarini qayta joyiga tiklaymiz
  codeBlocks.forEach((block, index) => {
    const escapedCode = escapeHTML(block.code.trim());
    const langHeader = block.lang ? `<b>[${block.lang.toUpperCase()}]</b>\n` : '';
    formatted = formatted.replace(`@@CODE_BLOCK_${index}@@`, `${langHeader}<pre>${escapedCode}</pre>`);
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
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolvedModel)}:generateContent?key=${encodeURIComponent(DILNOZA_AI_API_KEY)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT.content }]
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
  const scheme = 'https://';
  const host = ['api', ['o', 'p', 'e', 'n', 'a', 'i'].join(''), 'com'].join('.');
  const endpoint = `${scheme}${host}/v1/chat/completions`;
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

// Joriy chatda aktivatsiya iborasi kelmaguncha botni yopiq holatda ushlab turamiz
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
  await logIncomingSupportMessage(ctx, text);

  if (typeof text === 'string' && isMainAdminUser(ctx)) {
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
        `Bu foydalanuvchi endi /start orqali admin xabarini oladi va aktivatsiya kalit so'zi bilan botni ishga tushira oladi.`
      );
      return;
    }
  }

  if (
    typeof text === 'string' &&
    getAuthorizedAdminProfile(ctx)?.role === ADMIN_ROLE_QA_ONLY &&
    !isActivationMessage(text) &&
    normalizeText(text) !== normalizeText(DEACTIVATION_PHRASE) &&
    isRestrictedAdminCommand(text)
  ) {
    await logToAdmin(ctx, 'ADMIN', `Ikkinchi admin buyruq yubordi, lekin unga buyruq bajarish ruxsati berilmagan.`);
    await ctx.replyWithHTML(`⛔ <b>Sizga Ibrohim 1.0 tomonidan buyruq berishga ruxsat berilmagan.</b>`);
    return;
  }

  if (typeof text === 'string' && /^\/start(?:@\w+)?$/.test(text.trim())) {
    await logToAdmin(ctx, 'START', 'Foydalanuvchi /start tugmasini bosdi.');

    if (!activatedChats.has(chatKey) && !isAuthorizedAdminUser(ctx)) {
      await ctx.replyWithHTML(
        `⏸ <b>Dilnoza AI hali faollashmagan.</b>\n\nAdmin tomonidan ruxsat berilgandan keyin kerakli kalit so'z bilan ishga tushiriladi.`
      );
      return;
    }
  }

  if (activatedChats.has(chatKey)) {
    if (typeof text === 'string' && normalizeText(text) === normalizeText(DEACTIVATION_PHRASE)) {
      activatedChats.delete(chatKey);
      userConversations.delete(chatId);
      await saveActivatedChats();

      await logToAdmin(ctx, 'STOP', `Bot to'xtatildi: "${DEACTIVATION_PHRASE}"`);
      await ctx.replyWithHTML(
        `⛔ <b>Dilnoza AI to'xtatildi.</b>\n\nQayta ishga tushirish uchun aktivatsiya iborasini yuboring.`
      );
      return;
    }

    return next();
  }

  if (typeof text === 'string' && isActivationMessage(text)) {
    if (!isAuthorizedAdminUser(ctx)) {
      await ctx.replyWithHTML(
        `⛔ <b>Bu botni ishga tushirish uchun sizga ruxsat berilmagan.</b>`
      );
      return;
    }

    activatedChats.add(chatKey);
    userConversations.delete(chatId);
    await saveActivatedChats();

    await logToAdmin(ctx, 'START', `Aktivatsiya bajarildi: "${ACTIVATION_PHRASE}"`);
    await ctx.replyWithHTML(
      `✅ <b>Dilnoza AI ishga tushdi.</b>\n\nEndi savollaringizni yuborishingiz mumkin.`
    );
    return;
  }

  if (!activatedChats.has(chatKey)) {
    await ctx.replyWithHTML(
      `⏸ <b>Dilnoza AI hali faollashmagan.</b>\n\nAdmin tomonidan ruxsat berilgandan keyin kerakli kalit so'z bilan ishga tushiriladi.`
    );
    return;
  }

  return;
});

// /start buyrug'i
bot.start(async (ctx) => {
  const adminProfile = getAuthorizedAdminProfile(ctx);
  if (adminProfile) {
    const adminName = adminProfile.firstName || ctx.from.first_name || 'Admin';
    return ctx.replyWithHTML(
      `Assalomu Alaykum ${escapeHTML(adminName)} sizga Ibrohim 1.0 tomonidan adminlik xuquqi berildi va\n\n` +
      `<code>${escapeHTML(ACTIVATION_PHRASE)}</code> kalit sozini botga yuborish orqali botni ishga tushurishingiz mumkin.\n\n` +
      `agarda botni ishdan toxtatmoqchi bolsangiz\n` +
      `<code>${escapeHTML(DEACTIVATION_PHRASE)}</code> buyrug'i orqali ishdan toxtatishimgiz mumkin`
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

  // /start bosilganda xotirani tozalaymiz
  userConversations.delete(ctx.chat.id);
  
  ctx.replyWithHTML(welcomeText);
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
    `Men siz bilan kontekstni (avvalgi yozganlaringizni) eslab qolgan holda suhbatlasha olaman. Maksimal ${MAX_HISTORY / 2} ta savol-javobni yodda saqlayman.\n\n` +
    `🧹 <b>Mavzuni o'zgartirmoqchi bo'lsangiz:</b>\n` +
    `Agar suhbat mavzusini o'zgartirmoqchi bo'lsangiz yoki bot noto'g'ri javob berishni boshlasa, /clear buyrug'ini yuboring. Bu bot xotirasini tozalaydi va yangi suhbat boshlaydi.\n\n` +
    `🛠 <b>Tizim haqida:</b>\n` +
    `• Sun'iy intellekt: Dilnoza AI\n` +
    `• Til: O'zbek, Rus, Ingliz va boshqalar\n` +
    `• Ishlab chiquvchi: Dilnoza`;
  
  ctx.replyWithHTML(helpText);
});

// Suhbat xotirasini tozalash buyrug'i
bot.command('clear', (ctx) => {
  userConversations.delete(ctx.chat.id);
  ctx.replyWithHTML('🧹 <b>Suhbat xotirasi tozalandi!</b> Yangi mavzu haqida gaplashishimiz mumkin. Menga savolingizni yuboring 👇');
});

// Asosiy xabarni qayta ishlash qismi
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const userMessage = ctx.message.text;

  // Dilnoza AI kaliti kiritilganini tekshiramiz
  if (!DILNOZA_AI_API_KEY) {
    return ctx.replyWithHTML(
      `⚠️ <b>Kechirasiz!</b> Dilnoza AI API kaliti sozlanmagan.\n\n` +
      `Iltimos, muhit o'zgaruvchilariga <code>DILNOZA_AI_API_KEY</code> kalitini qo'shing.`
    );
  }

  // Suhbat tarixini olamiz yoki yangidan yaratamiz
  if (!userConversations.has(chatId)) {
    userConversations.set(chatId, []);
  }
  const history = userConversations.get(chatId);

  // Foydalanuvchi xabarini tarixga qo'shamiz
  history.push({ role: 'user', content: userMessage });
  trimHistory(history);

  try {
    // Foydalanuvchiga bot yozayotgandek ko'rsatamiz
    await ctx.sendChatAction('typing');

    // Dilnoza AI uchun xabarlar massivini tayyorlaymiz
    const messages = [
      SYSTEM_PROMPT,
      ...history
    ];

    // Dilnoza AI dan javob so'raymiz
    const botResponse = await requestDilnozaAI(messages);

    // Javobni HTML formatiga o'tkazamiz
    const formattedResponse = formatMarkdownToHTML(botResponse);

    // Javobni foydalanuvchiga qaytaramiz
    await ctx.replyWithHTML(formattedResponse, {
      reply_to_message_id: ctx.message.message_id
    });

    // Bot javobini faqat muvaffaqiyatli yuborilgandan keyin tarixga qo'shamiz
    history.push({ role: 'assistant', content: botResponse });
    trimHistory(history);

  } catch (error) {
    console.error('❌ Dilnoza AI yoki Telegram API xatosi:', error);
    
    // Xatoni admin log guruhidagi xato mavzusiga yuboramiz
    await logToAdmin(ctx, 'ERROR', `Xatolik tafsiloti: ${getReadableErrorText(error)}\nFoydalanuvchi yuborgan matn: ${userMessage}`).catch(console.error);
    
    // Foydalanuvchiga tushunarli xato xabarini tayyorlaymiz
    let errorMessage = `❌ <b>Kechirasiz, xatolik yuz berdi!</b>\n\n`;
    if (error.status === 401 || error.message.includes('Incorrect API key')) {
      errorMessage += `API kaliti noto'g'ri kiritilgan. Iltimos, <code>DILNOZA_AI_API_KEY</code> ni tekshiring.`;
    } else if (error.status === 429) {
      errorMessage += `Dilnoza AI limitingizga yetgansiz. Iltimos, hisob sozlamalaringizni tekshiring.`;
    } else {
      errorMessage += `Tizimda muammo yuz berdi: <i>${escapeHTML(error.message)}</i>`;
    }
    
    // Keyingi so'rov toza boshlanishi uchun oxirgi kutilayotgan user xabarini olib tashlaymiz
    if (history.at(-1)?.role === 'user' && history.at(-1)?.content === userMessage) {
      history.pop();
    }
    
    await ctx.replyWithHTML(errorMessage);
  }
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
