const save = require("./save.js");

const bannerTimeout = 1800000;

async function initInterface() {
    const currentSession = await (async() => {
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




module.exports = { initInterface };