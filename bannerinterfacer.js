const save = require("./save.js");
const { ipcMain, BrowserWindow } = require("electron");

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const bannerTimeout = 1800000;
const bannerInterval = 1200;
const bannerSession = {}

function broadcastToAllWindows(channel, data) {
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach((window) => {
        if (!window.isDestroyed()) {
            window.webContents.send(channel, data);
        }
    });
}

async function initInterface() {
    const currentSession = await (async () => {
        const lastTimestamp = save.get("bannerSessionConfirmation");
        if (!lastTimestamp || isNaN(parseInt(lastTimestamp)) || new Date().getTime() - parseInt(lastTimestamp) >= bannerTimeout) return { signedIn: false, user: {} }
        const encryptedCookies = save.get("bannerCookies");
        if (encryptedCookies) {
            const cookies = await save.decrypt(encryptedCookies);
            if (!cookies.s) {
                save.del("bannerCookies");
                return { signedIn: false, user: {} }
            }
            else {
                return { signedIn: true, user: {} }
            }
        }
    })();
    return currentSession;
}

async function getSession() {
    bannerSession.attemptCount++;
    const thisAttempt = bannerSession.attemptCount;
    bannerSession.attempts[thisAttempt] = { status: "pending" };
    printAllAttempts();
    const acceptanceRate = 0.005;
    const delayMin = 500;
    const delayMax = 6000;
    const randomDelay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
    await new Promise(resolve => setTimeout(resolve, randomDelay));
    if (Math.random() < acceptanceRate) {
        bannerSession.attempts[thisAttempt].status = "accepted";
        bannerSession.signedIn = true;
        return { s: true, d: "example", attempt: thisAttempt };
    }
    else {
        bannerSession.attempts[thisAttempt].status = "busy";
        return { s: false, e: "SYSTEMBUSY", attempt: thisAttempt };
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

(async () => {
    bannerSession.attemptCount = 0;
    bannerSession.attempts = {};
    while (bannerSession.signedIn === undefined) {
        getSession().then(session => {
            printAllAttempts()
        });
        await delay(bannerInterval);
    }
})();


async function signIn({ username, password, rememberme, rememberpass }) {
    ipcMain.emit("login-information", { status: "wait", signedin: false, process: "session", attempts: [] });
}



module.exports = { initInterface };