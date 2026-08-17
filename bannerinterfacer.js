const save = require("./save.js");
const { app, ipcMain, BrowserWindow } = require("electron");
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
};

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

async function initInterface() {
    await initCookieJar();
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
        return { s: true, attempt: thisAttempt };
    }
    else {
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
        while (bannerSession.sessionExists === false) {
            getSession(force).then(session => printAllAttempts);
            await delay(bannerInterval);
        }
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
        await getUsersName();
        broadcastToAllWindows("login-information", { status: "wait", signedin: false, process: "Starting up...", user: { name: bannerSession.user.name } });
        return;
    }
    catch (error) {
        console.error("Error while getting user information:", error);
        await resetCookies();
        return;
    }
}

async function getUsersCourses() {
    const currentCourses = await requestToBanner("bwskfshd.P_CrseSchdDetl", "POST", "term_in="+thisterm);
    if (currentCourses.s !== 200) {
        throw new Error("Failed to get current courses: " + currentCourses.s);
        return;
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
    const CRNs = [];
    $("acronym[title='Course Reference Number']").each((index, element) => {
        CRNs.push($(element).parent().parent().children().eq(1).text().trim());
    });
    bannerSession.user.actualschedule = CRNs;
    bannerSession.user.key = usernamecomplex.id;
    bannerSession.user.name = usernamecomplex.name;
    bannerSession.user.realname = false;
}
async function getUsersName() {
    const tuitionInfoBase = await requestToBanner("SU_TUITION_PAYMENT_INFO.p_main");
    if (tuitionInfoBase.s !== 302) {
        throw new Error("Failed to get username info: " + tuitionInfoBase.s);
        return;
    }
    const tuitionInfo = await requestToBanner(tuitionInfoBase.redirect.substring(domain.length + 5 + (testenvironment ? 1 : 0)), "GET", undefined, { "Referer": tuitionInfoBase.redirect });
    if (tuitionInfo.s !== 200) {
        throw new Error("Failed to get username info: " + tuitionInfo.s);
        return;
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

async function signIn(form) {
    if (form.username === "" || form.password === "") {
        return { s: false, w: false, d: "Please fill in all fields." };
    }
    if (!bannerSession.sessionExists) {
        return { s: false, w: false, d: "[Internal issue] Session was not created before login attempt." };
    }
    broadcastToAllWindows("login-information", { status: "wait", signedin: false, process: "loggingin", attempts: [] });
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

module.exports = { initInterface, getBannerSession, signIn, getSessionDetails, resetCookies, getInformation, requestToPublicBanner, getCurrentTerm };