const save = require("./save.js");
const path = require("path");
const { app, ipcMain, BrowserWindow, WebContentsView, session } = require("electron");
const { CookieJar } = require('tough-cookie'); // To save cookies in memory
const cheerio = require('cheerio'); // For parsing HTML
const domain = "https://suis.sabanciuniv.edu/";
const testenvironment = false;
const thisterm = "202601"; // Change this to the current term code as needed

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const bannerTimeout = 1800000;
const bannerInterval = 1200;
const bannerSession = { sessionExists: false, signedIn: false, sessionCreatedAt: null, lastSuccessfulContact: null, lastURL: undefined, user: { key: null, name: null, realname: false, pfp: null, actualschedule: [] } };
const rememberedDetails = {};
let cookieJar;

async function saveCookies() {
  const cookieJSON = cookieJar.toJSON();
  const encrypted = await save.encrypt(JSON.stringify(cookieJSON));
  if (!encrypted.s) {
    console.error("Failed to encrypt cookie jar:", encrypted.e);
    return;
  }
  save.set("bannerCookies", encrypted.d);
}

async function requestToBanner(URL, method = "GET", body = null, extraHeaders = {}, bypassCookieJar = false) {
  const headers = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": app.getLocale() + ",en;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "priority": "u=0, i",
    "sec-ch-ua": "\"Not=A?Brand\";v=\"99\", \"Google Chrome\";v=\"" + process.versions.chrome.split(".")[0] + "\", \"Chromium\";v=\"" + process.versions.chrome.split(".")[0] + "\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"" + ((process.platform === 'win32') ? "Windows" : process.platform === 'darwin' ? "macOS" : "Linux") + "\"",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-site",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
  }
  if (bannerSession.lastURL === undefined) {
    headers.referrer = bannerSession.lastURL;
  }
  if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
    headers["content-type"] = "application/x-www-form-urlencoded";
    headers["origin"] = domain.substring(0, domain.length - 1);
  }
  const cookieHeader = await cookieJar.getCookieString(domain + (testenvironment ? "dolly" : "prod") + "/");
  if (!bypassCookieJar) headers["cookie"] = cookieHeader;
  Object.keys(extraHeaders).forEach((key) => {
    headers[key] = extraHeaders[key];
  });
  let cookiesCleared = false;
  bannerSession.lastURL = domain + (testenvironment ? "dolly" : "prod") + "/" + URL;
  const fetchRes = await fetch(domain + (testenvironment ? "dolly" : "prod") + "/" + URL, {
    "headers": headers,
    "redirect": 'manual',
    "body": body,
    "method": method
  });
  const obj = { s: fetchRes.status, dom: null };
  let loaddom = true;
  if (URL === "twbkwbis.P_ValLogin" && obj.s === 200) {
    obj.s = 400; // Login successful but no redirect, likely due to an error
  }
  if (fetchRes.status >= 300 && fetchRes.status < 400) {
    obj.redirect = fetchRes.headers.get("location");
    if (URL === "twbkwbis.P_SabanciLogin") {
      obj.s = 503; // Service unavailable
    }
    else if (URL === "twbkwbis.P_ValLogin") {
      if (obj.redirect == domain + (testenvironment ? "dolly" : "prod") + "/twbkwbis.P_SabanciLogin") {
        obj.s = 401; // Session timeout
        bannerSession.sessionExists = false;
        bannerSession.signedIn = false;
        await cookieJar.removeAllCookies();
        await saveCookies();
        cookiesCleared = true;
      }
      else if (obj.redirect == domain + (testenvironment ? "dolly" : "prod") + "/twbkwbis.P_GenMenu?name=bmenu.P_MainMnu") {
        obj.s = 200; // Login successful
      }
    }
    else if (obj.redirect == domain + (testenvironment ? "dolly" : "prod") + "/twbkwbis.P_SabanciLogin") {
      obj.s = 401; // Session timeout;
    }
  }
  if (bypassCookieJar) {
    obj.cookie = [];
    for (const cookie of fetchRes.headers.getSetCookie()) {
      obj.cookie.push(cookie);
    }
  }
  else if (!cookiesCleared) {
    for (const cookie of fetchRes.headers.getSetCookie()) await cookieJar.setCookie(cookie, domain + (testenvironment ? "dolly" : "prod") + "/");
    await saveCookies();
  }
  const html = await fetchRes.text();
  const $ = cheerio.load(html);
  obj.dom = $;
  return obj;
}

async function requestToPublicBanner(URL, method = "GET", body = null) {
  const fetchRes = await fetch(domain + (testenvironment ? "dolly" : "prod") + "/" + URL, {
    "headers": method !== "GET" ? { "content-type": "application/x-www-form-urlencoded" } : {},
    "redirect": 'manual',
    "method": method,
    "body": body
  });
  const obj = { s: fetchRes.status, dom: null };
  const html = await fetchRes.text();
  obj.dom = cheerio.load(html);
  return obj;
}

function broadcastToAllWindows(channel, data) {
  const allWindows = BrowserWindow.getAllWindows();
  allWindows.forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, data);
    }
  });
}

async function initCookieJar() {
  const encryptedCookies = save.get("bannerCookies");
  if (encryptedCookies) {
    const cookies = await save.decrypt(encryptedCookies);
    if (cookies.s) {
      cookieJar = CookieJar.fromJSON(JSON.parse(cookies.result), null, { looseMode: true });
      return;
    }
    else save.del("bannerCookies");
  }
  cookieJar = new CookieJar();
  const encrypted = await save.encrypt(JSON.stringify(cookieJar.toJSON()));
  if (!encrypted.s) {
    console.error("Failed to encrypt cookie jar:", encrypted.e);
    return;
  }
  save.set("bannerCookies", encrypted.d);
}

function cookieExists(cookieName) {
  return new Promise((resolve, reject) => {
    cookieJar.getCookies(domain + (testenvironment ? "dolly" : "prod") + "/", (err, cookies) => {
      if (err) {
        reject(err);
      } else {
        const cookie = cookies.find(c => c.key === cookieName);
        resolve(cookie !== undefined);
      }
    });
  });
}

function deleteCookie(cookieName) {
  return new Promise((resolve, reject) => {
    cookieJar.getCookies(domain + (testenvironment ? "dolly" : "prod") + "/", (err, cookies) => {
      if (err) {
        reject(err);
      } else {
        const cookie = cookies.find(c => c.key === cookieName);
        if (cookie) {
          cookieJar.removeCookie(cookie.domain, cookie.path, cookie.key, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve(true);
            }
          });
        } else {
          resolve(cookie !== undefined);
        }
      }
    });
  });
}

function setSessionCookieEvent() {
  session.defaultSession.cookies.on('changed', async (event, cookie, cause, removed) => {
    if (!cookie.domain.includes('sabanciuniv.edu')) return;
    const domainUrl = `https://${cookie.domain.replace(/^\./, '')}`;
    if (removed) {
      console.log(`Cookie deleted in browser: ${cookie.name}`);
      await cookieJar.setCookie(`${cookie.name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`, domainUrl);
    } else {
      console.log(`Cookie updated/added in browser: ${cookie.name}`);
      let cookieStr = `${cookie.name}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}`;
      if (cookie.secure) cookieStr += '; Secure';
      if (cookie.httpOnly) cookieStr += '; HttpOnly';
      await cookieJar.setCookie(cookieStr, domainUrl);
    }
    await saveCookies();
  });
}

let sessionCookieEventSet = false;

async function initInterface() {
  await initCookieJar();
  // await resetCookies(); // Uncomment this line to clear cookies on every app start for testing purposes
  const sessionExists = await cookieExists("__gpi") && await cookieExists("__sli");
  const loginExists = await cookieExists("SESSID");
  console.log("Session exists:", sessionExists, "Login exists:", loginExists);
  const rememberDetails = await (async () => {
    const rememberEnc = save.get("rememberDetails");
    if (!rememberEnc) {
      const encrypted = await save.encrypt("{}");
      save.set("rememberDetails", encrypted.d);
      return {};
    }
    const decrypted = await save.decrypt(rememberEnc);
    if (!decrypted.s) {
      console.error("Failed to decrypt rememberDetails:", decrypted.e);
      const encrypted = await save.encrypt("{}");
      save.set("rememberDetails", encrypted.d);
      return {};
    }
    return JSON.parse(decrypted.result);
  })();
  Object.keys(rememberDetails).forEach((key) => {
    rememberedDetails[key] = rememberDetails[key];
  });
  if (rememberedDetails.key) {
    if (rememberedDetails.password) bannerSession.remembered = true;
    bannerSession.user.key = rememberedDetails.key;
    bannerSession.user.name = rememberedDetails.name;
    bannerSession.user.pfp = rememberedDetails.pfp;
  }
  if (!sessionCookieEventSet) {
    setSessionCookieEvent();
    sessionCookieEventSet = true;
  }
  const currentSession = await (async () => {
    if (sessionExists && loginExists) {
      await getInformation();
      if (bannerSession.signedIn) return { signedIn: true, user: {} };
      return { signedIn: false, user: {} };
    }
    else if (sessionExists) {
      console.log("Session exists but no login, user is not signed in.");
      bannerSession.sessionExists = true;
      return { signedIn: false, user: {} };
    }
    return { signedIn: false, user: {} }
  })();
  return currentSession;
}

async function getSession(force = false) {
  bannerSession.attemptCount++;
  const thisAttempt = bannerSession.attemptCount;
  bannerSession.attempts[thisAttempt] = { status: "pending" };
  if (force) printAllAttempts();

  const sessionResult = await requestToBanner("twbkwbis.P_SabanciLogin", "GET", undefined, undefined, true);
  if (sessionResult.s === 200) {
    for (const cookie of sessionResult.cookie) {
      await cookieJar.setCookie(cookie, domain + (testenvironment ? "dolly" : "prod") + "/");
    }
    await saveCookies();
    bannerSession.sessionExists = true;
    bannerSession.sessionCreatedAt = new Date().getTime();
    bannerSession.lastSuccessfulContact = bannerSession.sessionCreatedAt;
    bannerSession.attempts[thisAttempt] = { status: "accepted" };
    return { s: true, attempt: thisAttempt };
  }
  else {
    if (sessionResult.s === 503) {
      bannerSession.attempts[thisAttempt] = { status: "busy" };
    }
    else {
      bannerSession.attempts[thisAttempt] = { status: "error" };
    }
    return { s: false, e: sessionResult.s, attempt: thisAttempt };
  }
}

function printAllAttempts() {
  const maxAllDones = 3;
  const toSend = {};
  let alldone = true;
  let allDoneCount = 0;
  for (const attempt in bannerSession.attempts) {
    if (bannerSession.attempts[attempt].status === "pending" || bannerSession.attempts[attempt].status === "accepted") alldone = false;
    if (alldone) allDoneCount++;
    toSend[attempt] = { status: bannerSession.attempts[attempt].status, alldone: alldone };
  }
  for (const attempt in bannerSession.attempts) {
    if (allDoneCount > maxAllDones) {
      if (toSend[attempt].alldone && bannerSession.attempts[attempt].status !== "pending" && bannerSession.attempts[attempt].status !== "accepted") {
        delete bannerSession.attempts[attempt];
        delete toSend[attempt];
        allDoneCount--;
      }
    }
  }
  broadcastToAllWindows("session-attempts", { attempts: toSend });
}

async function getSessionDetails() {
  return bannerSession;
}

async function getBannerSession(force = false) {
  bannerSession.attemptCount = 0;
  bannerSession.attempts = {};
  if (force) {
    let lastRequest = new Date().getTime() - bannerInterval;
    while (bannerSession.sessionExists === false) {
      if (new Date().getTime() - lastRequest > bannerInterval) {
        getSession(force).then(session => printAllAttempts); // We don't await this because we want to keep trying even if one attempt is still waiting
        lastRequest = new Date().getTime();
      }
      if (bannerSession.sessionExists === true) break;
      await delay(1);
    }
    printAllAttempts();
    return { s: true, attempt: bannerSession.attemptCount };
  }
  else {
    if (bannerSession.sessionExists === false) {
      return await getSession(force).then(r => {
        return r;
      });
    }
  }
}

async function getInformation(displayStatus = false) {
  if (displayStatus) broadcastToAllWindows("login-information", { status: "wait", signedin: false, process: "Loading courses...", user: {} });
  try {
    await getUsersCourses();
    broadcastToAllWindows("login-information", { status: "wait", signedin: false, process: "Loading user data...", user: { name: bannerSession.user.name } });
    bannerSession.signedIn = true;
    await getUsersPFP();
    broadcastToAllWindows("login-information", { status: "wait", signedin: false, process: "Loading user data...", user: { name: bannerSession.user.name, image: bannerSession.user.pfp } });
    try {
      if (!bannerSession.user.realname) await getUsersName();
    }
    catch (error) {
      console.error("Error while getting user name:", error);
    }
    if (bannerSession.user.rememberDetails) {
      rememberedDetails.name = bannerSession.user.name;
      rememberedDetails.pfp = bannerSession.user.pfp;
      rememberedDetails.key = bannerSession.user.key;
      const encrypted = await save.encrypt(JSON.stringify(rememberedDetails));
      if (!encrypted.s) {
        console.error("Failed to encrypt remembered details:", encrypted.e);
      }
      else save.set("rememberDetails", encrypted.d);
    }
    broadcastToAllWindows("login-information", { status: "wait", signedin: false, process: "Starting up...", user: { name: bannerSession.user.name } });
    broadcastToAllWindows("login-details", { status: "active", signedin: true, process: null, user: { name: bannerSession.user.name, image: bannerSession.user.pfp, schedule: bannerSession.user.actualschedule } })
    //console.log("Your cookies are:", cookieJar.toJSON());
    return;
  }
  catch (error) {
    console.error("Error while getting user information:", error);
    await resetCookies();
    return;
  }
}

async function getUsersCourses() {
  let currentCourses = await requestToBanner("bwskfreg.P_AltPin", "POST", "term_in=" + thisterm, { "Referer": domain + (testenvironment ? "dolly" : "prod") + "/bwskfreg.P_AltPin" });
  let fallback = false;
  bannerSession.user.registrationHolded = false;
  if (currentCourses.s !== 200) {
    console.error("Failed to get current courses: " + currentCourses.s);
    fallback = true;
  }
  else if (!currentCourses.dom.html().includes("Add/Drop Classes:")) {
    fallback = true;
  }
  else if (currentCourses.dom.html().includes("holds on your record")) {
    bannerSession.user.registrationHolded = true;
    fallback = true;
  }
  if (fallback) {
    currentCourses = await requestToBanner("bwskfshd.P_CrseSchdDetl", "POST", "term_in=" + thisterm);
    if (currentCourses.s !== 200) {
      throw new Error("Failed to get current courses: " + currentCourses.s);
      return;
    }
  }
  bannerSession.lastSuccessfulContact = new Date().getTime();
  if (!bannerSession.sessionCreatedAt) bannerSession.sessionCreatedAt = bannerSession.lastSuccessfulContact;
  const $ = currentCourses.dom;
  const usernamecomplex = (() => {
    const complex = $(".staticheaders").eq(0).text().trim().split("\n")[0].trim();
    return {
      id: complex.substring(0, complex.indexOf(" ")).trim(),
      name: complex.substring(complex.indexOf(" ") + 1).trim()
    }
  })();
  bannerSession.user.key = usernamecomplex.id;
  bannerSession.user.name = usernamecomplex.name;
  bannerSession.user.realname = !usernamecomplex.name.includes(".");
  bannerSession.user.registrationActive = false;
  const CRNs = [];
  if (fallback) {
    $("acronym[title='Course Reference Number']").each((index, element) => {
      CRNs.push($(element).parent().parent().children().eq(1).text().trim());
    });
    bannerSession.user.actualschedule = CRNs;
  }
  else {
    console.log("Actual schedule table found, parsing CRNs...");
    $(".datadisplaytable").eq(0).children().eq(0).children().each((index, element) => {
      if (index > 0) {
        CRNs.push($(element).children().eq(2).text().trim());
      }
    });
    bannerSession.user.actualschedule = CRNs;
    bannerSession.user.registrationActive = true;
  }
}

async function getUsersName() {
  const tuitionInfoBase = await requestToBanner("SU_TUITION_PAYMENT_INFO.p_main");
  if (tuitionInfoBase.s !== 302) {
    throw new Error("Failed to get username info: " + tuitionInfoBase.s);
    return;
  }
  const tuitionInfo = await requestToBanner(tuitionInfoBase.redirect.substring(domain.length + 5), "GET", undefined, { "Referer": tuitionInfoBase.redirect });
  if (tuitionInfo.s !== 200) {
    throw new Error("Failed to get username info: " + tuitionInfo.s);
  }
  bannerSession.lastSuccessfulContact = new Date().getTime();
  const $ = tuitionInfo.dom;
  '<tr><td><b>Student ID No :</b></td><td>00000000</td></tr><tr><td><b>Student Name Surname :</b></td><td>heres the name</td></tr>'
  const tableelements = $(".pagebodydiv").eq(0).find("table[cellspacing='0'][cellpadding='2'][border='1']").eq(0).find("tr");
  const fullname = (() => {
    for (let i = 0; i < tableelements.length; i++) {
      const row = tableelements.eq(i);
      const label = row.find("td").eq(0).text().trim();
      if (label === "Student Name Surname :") {
        return row.find("td").eq(1).text().trim();
      }
    }
  })();
  bannerSession.user.realname = true;
  bannerSession.user.name = fullname;
}

async function getUsersPFP() {
  const pfpBase = await requestToBanner("sabanciw4f.p_view_my_photo");
  if (pfpBase.s !== 200) {
    throw new Error("Failed to get user profile picture: " + pfpBase.s);
    return;
  }
  bannerSession.lastSuccessfulContact = new Date().getTime();
  const $ = pfpBase.dom;
  const pfpURL = $("img[src*='photo']").eq(0).attr("src");
  bannerSession.user.pfp = domain + pfpURL.substring(1);
}

async function resetRememberedDetails() {
    rememberedDetails.username = null;
    rememberedDetails.password = null;
    rememberedDetails.name = null;
    rememberedDetails.pfp = null;
    rememberedDetails.key = null;
    save.set("rememberDetails", await save.encrypt(JSON.stringify(rememberedDetails)).d);
}

async function signIn(form) {
  if (rememberedDetails.username && rememberedDetails.username === "") {
    form.username = rememberedDetails.username;
  }
  else if (rememberedDetails.username && rememberedDetails.username !== "") {
    bannerSession.user.username = null;
    bannerSession.user.name = null;
    bannerSession.user.pfp = null;
    bannerSession.user.key = null;
    bannerSession.user.actualschedule = [];
    await resetRememberedDetails();
  }
  if (form.username === "" || form.password === "") {
    return { s: false, w: false, d: "Please fill in all fields." };
  }
  if (!bannerSession.sessionExists) {
    return { s: false, w: false, d: "[Internal issue] Session was not created before login attempt." };
  }
  broadcastToAllWindows("login-information", { status: "wait", signedin: false, process: "Entering Banner", attempts: [] });
  const result = await requestToBanner("twbkwbis.P_ValLogin", "POST", "sid=" + form.username + "&PIN=" + form.password, { "Referer": domain + (testenvironment ? "dolly" : "prod") + "/twbkwbis.P_SabanciLogin" });
  const $ = result.dom;
  const table = $('table[summary="This layout table holds message information"]');
  if (result.s === 400) {
    let message = "";
    if (table.length > 0) {
      table.eq(0).find('td.pldefault').each((index, element) => {
        message += $(element).text().replaceAll(/\s+/g, ' ').trim() + " ";
      });
      message = message.trim();
    }
    else message = "Unknown error occurred during login.";
    return { s: false, w: false, d: message };
  }
  else if (result.s === 401) {
    // Session timeout, so we try again with another one!
    const sessionResult = await getBannerSession();
    if (!sessionResult.s) {
      sessionResult.w = false;
      return sessionResult;
    }
    return await signIn(form);
  }
  else if (result.s === 200) {
    bannerSession.signedIn = true;
    if (form.rememberme) {
      bannerSession.user.rememberDetails = true;
      rememberedDetails.username = form.username;
      if (form.rememberpass) {
        rememberedDetails.password = form.password;
      }
    }
    return { s: true, w: true, d: "LOGINSUCCESS" };
  }
}

async function resetCookies() {
  await cookieJar.removeAllCookies();
  await saveCookies();
  bannerSession.sessionExists = false;
  bannerSession.signedIn = false;
}

function getCurrentTerm() {
  return thisterm;
}

async function getPopulation(subject, course, crns) {
  let fallback = false;
  if (bannerSession.user.registrationActive) {
    const response = await requestToBanner("bwckgens.P_RegsGetCrse", "POST", "term_in=" + thisterm + "&sel_subj=dummy&sel_subj=" + subject + "&SEL_CRSE=" + course + "&SEL_TITLE=&BEGIN_HH=0&BEGIN_MI=0&BEGIN_AP=a&SEL_DAY=dummy&SEL_PTRM=dummy&END_HH=0&END_MI=0&END_AP=a&SEL_CAMP=dummy&SEL_SCHD=dummy&SEL_SESS=dummy&SEL_INSTR=dummy&SEL_INSTR=%25&SEL_ATTR=dummy&SEL_ATTR=%25&SEL_LEVL=dummy&SEL_LEVL=%25&SEL_INSM=dummy&sel_dunt_code=&sel_dunt_unit=&call_value_in=&rsts=dummy&assoc_term_in=dummy&crn=dummy&start_date_in=dummy&end_date_in=dummy&subj=dummy&crse=dummy&sec=dummy&levl=dummy&gmod=dummy&cred=dummy&title=dummy&mesg=dummy&regs_row=0&add_row=0&wait_row=0&path=2&SUB_BTN=View+Sections", { "Referer": domain + (testenvironment ? "dolly" : "prod") + "/bwskfreg.P_AltPin" });
    if (response.s !== 200) {
      console.error("Failed to get population data: " + response.s);
      fallback = true;
    }
    else if (!response.dom.html().includes("Sections Found")) {
      console.error("No sections found for the given criteria.");
      fallback = true;
    }
    else {
      const results = [];
      response.dom(".datadisplaytable").eq(0).children().eq(1).children().each((index, element) => {
        if (index > 1) {
          if (!["&nbsp;", ""].includes(response.dom(element).children().eq(1).text().trim())) results.push({ crn: response.dom(element).children().eq(1).children().eq(0).text().trim(), cap: parseInt(response.dom(element).children().eq(10).text().trim()), taken: parseInt(response.dom(element).children().eq(11).text().trim()) });
        }
      });
      return results;
    }
  }
  else fallback = true;
  if (fallback) {
    console.log("Falling back to public Banner for population data...");
    const results = [];
    const maxConcurrentRequests = 7;
    let activeRequests = 0;
    for (const crn of crns) {
      while (activeRequests >= maxConcurrentRequests) {
        await delay(100);
      }
      activeRequests++;
      requestToPublicBanner("bwckschd.p_disp_detail_sched?term_in=" + thisterm + "&crn_in=" + crn, "GET").then(response => {
        const el = response.dom("table.datadisplaytable[summary='This layout table is used to present the seating numbers.']").eq(0).children().eq(1).children().eq(1);
        const result = {
          cap: parseInt(el.children().eq(1).text().trim()),
          taken: parseInt(el.children().eq(2).text().trim()),
        };
        results.push({ crn: crn, cap: result.cap, taken: result.taken });
      }).catch(error => {
        console.error("Error while requesting population for CRN:", crn, error);
        results.push({ crn: crn, error: error.message });
      }).finally(() => {
        activeRequests--;
      });
    }
    while (results.length < crns.length) {
      await delay(100);
    }
    return results;
  }
}

function GetForm(adds, drops) {
  let formurl = "term_in=" + thisterm + "&RSTS_IN=DUMMY&assoc_term_in=DUMMY&CRN_IN=DUMMY&start_date_in=DUMMY&end_date_in=DUMMY&SUBJ=DUMMY&CRSE=DUMMY&SEC=DUMMY&LEVL=DUMMY&CRED=DUMMY&GMOD=DUMMY&TITLE=DUMMY&MESG=DUMMY&REG_BTN=DUMMY&MESG=DUMMY";
  drops.forEach(e => {
    formurl += "&RSTS_IN=DW&assoc_term_in=&CRN_IN=" + e + "&start_date_in=&end_date_in=&SUBJ=&CRSE=&SEC=&LEVL=&CRED=&GMOD=&TITLE=&MESG=DUMMY";
  });
  adds.forEach(e => {
    formurl += "&RSTS_IN=RW&CRN_IN=" + e + "&assoc_term_in=&start_date_in=&end_date_in=";
  });
  formurl += "&regs_row=" + drops.length + "&wait_row=0&add_row=" + adds.length + "&REG_BTN=Submit+Changes";
  return formurl;
}

async function submitRegistration(adds, drops) {
  const formurl = GetForm(adds, drops);
  const errors = [];
  if (true) { // For testing purposes, we can simulate a successful registration without actually sending the request
    const response = await requestToBanner("su_registration.p_su_register", "POST", formurl, { "Referer": domain + (testenvironment ? "dolly" : "prod") + "/bwskfreg.P_AltPin" });
    if (response.s === 200) {
      const $ = response.dom;
      let errorelement = 1;
      if ($(".datadisplaytable").length == 1 && $.html().includes("Registration Add Errors")) {
        console.warn("No courses were found. All tables are errors!");
        errorelement = 0;
      }
      else {
        try {
          const currentcourses = [];
          ($(".datadisplaytable").eq(0).html())
          $(".datadisplaytable").eq(0).children().eq(0).children().each((index, element) => {
            if (index > 0) {
              currentcourses.push($(element).children().eq(2).text().trim());
            }
          });
          bannerSession.user.actualschedule = currentcourses;
        }
        catch (error) {
          console.error("Error while parsing current courses:", error);
          errors.push({ title: "Internal: Schedule Fetching Failed", desc: "An internal error occurred while trying to grab your updated schedule." });
        }
      }
      try {
        if ($(".datadisplaytable").length > errorelement) {
          $(".datadisplaytable").eq(errorelement).children().eq(0).children().each((index, element) => {
            if (index > 0) {
              errors.push({ desc: $(element).children().eq(0).text().trim().replaceAll("click for details", ""), crn: $(element).children().eq(1).text().trim() })
            }
          });
        }
      }
      catch (error) {
        console.error("Error while parsing registration errors:", error);
        errors.push({ title: "Internal: Error Fetching Errors", desc: "An internal error occurred while trying to grab your registration errors. This may not mean the registration failed." });
      }
      try {
        let mincount = ($(".datadisplaytable").length == 0) ? 0 : 1;
        if ($(".infotextdiv").length > mincount) {
          $(".infotextdiv").each((index, element) => {
            if (index < $(".infotextdiv").length - mincount) {
              const err = $(element).children().eq(0).children().eq(0).children().eq(0).children().eq(1).children().eq(0).text().trim();
              let item = { title: err, desc: err };
              if (err.includes("Term not available for Registration processing.")) item.title = "Registration is not open right now.";
              if (err.includes("You have made too many attempts to register this term.")) item.title = "You are banned from registering. Please send a ticket to IT to resolve this.";
              if (!err.startsWith("Use this interface to add or drop classes for the selected term.")) errors.push(item);
            }
          });
        }
      }
      catch (error) {
        errors.push({ title: "Failed to extract general errors", desc: "Please read the console for more details." });
        console.error("Failed to extract top info messages:", error, dom.getElementsByClassName("infotextdiv"));
      }
    }
    else if (response.s === 401) {
      errors.push({ title: "Session Expired", desc: "Your session has expired. Please log in again." });
    }
    else if (response.s === 503) {
      errors.push({ title: "System Busy", desc: "The registration system is busy. Please try again later." });
    }
    else if (response.s === 500) {
      errors.push({ title: "Internal Server Error", desc: "The registration system encountered an internal error. Please try again later." });
    }
    else {
      errors.push({ title: "Unknown Error", desc: "An unknown error occurred. Status code: " + response.s });
    }
  }
  else {
    await delay(2000); // Simulate a delay for testing purposes
    errors.push({ title: "Registration is not open right now.", desc: "Term not available for Registration processing." });
    errors.push({ desc: "this is a demo error", crn: "10111" })
  }
  return { newschedule: bannerSession.user.actualschedule, errors: errors };
}

async function signOut() {
  await requestToBanner("twbkwbis.P_Logout", "GET");
  bannerSession.signedIn = false;
  bannerSession.user = { key: null, name: null, realname: false, pfp: null, actualschedule: [], registrationActive: false };
  broadcastToAllWindows("login-details", { status: "inactive", signedin: false, process: null, user: { name: null, image: null, schedule: [] } });
}

async function launchBanner(url = "twbkwbis.P_GenMenu?name=bmenu.P_MainMnu") {
  const cookies = await cookieJar.getCookies(domain + (testenvironment ? "dolly" : "prod") + "/");

  for (const cookie of cookies) {
    const electronCookie = {
      url: 'https://suis.sabanciuniv.edu',
      name: cookie.key,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      expirationDate: cookie.expires === 'Infinity' || !cookie.expires
        ? undefined
        : new Date(cookie.expires).getTime() / 1000
    };
    try {
      await session.defaultSession.cookies.set(electronCookie);
    } catch (error) {
      console.error(`Failed to set cookie ${cookie.key}:`, error);
    }
  }


  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'bannerpreload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.loadFile('banner.html');
  const view = new WebContentsView();
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 35, width: 1000, height: 750 });
  win.setMenuBarVisibility(false)
  win.on('resize', () => {
    const bounds = win.getBounds();
    view.setBounds({ x: 0, y: 35, width: bounds.width, height: bounds.height - 35 });
  });
  view.webContents.on('did-navigate', (event, url) => {
    if (win.isDestroyed()) return;
    win.webContents.send('url-changed', url);
    win.title = view.webContents.getTitle();
    if (url.includes('twbkwbis.P_Logout')) {
      console.log("Detected logout, resetting cookies and session...");
      bannerSession.signedIn = false;
      bannerSession.user = { key: null, name: null, realname: false, pfp: null, actualschedule: [], registrationActive: false };
      broadcastToAllWindows("login-details", { status: "inactive", signedin: false, process: null, user: { name: null, image: null, schedule: [] } });
      win.close();
    }
  });
  view.webContents.on('did-navigate-in-page', (event, url) => {
    if (win.isDestroyed()) return;
    win.webContents.send('url-changed', url);
    win.title = view.webContents.getTitle();
  });
  view.webContents.on('page-title-updated', (event, title) => {
    if (win.isDestroyed()) return;
    win.title = title;
  });
  ipcMain.on('navigate-to', (event, url) => {
    const finalUrl = url.startsWith('http') ? url : `https://${url}`;
    if (!finalUrl.startsWith('https://suis.sabanciuniv.edu/')) {
      console.warn(`Blocked navigation to external URL: ${finalUrl}`);
      win.webContents.send('url-changed', view.webContents.getURL());
      return;
    }
    view.webContents.loadURL(finalUrl);
  });
  view.webContents.loadURL('https://suis.sabanciuniv.edu/' + (testenvironment ? 'dolly' : 'prod') + '/' + url);
}
module.exports = { initInterface, getBannerSession, signIn, getSessionDetails, resetCookies, getInformation, requestToPublicBanner, getCurrentTerm, printAllAttempts, getPopulation, submitRegistration, signOut, launchBanner };