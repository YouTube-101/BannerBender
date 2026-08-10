const { safeStorage } = require("electron");
const electronStore = require("electron-store");
const storeConstructor = electronStore.default || electronStore;
const store = new storeConstructor();
function get(key, def) {
    return store.get(key, def);
}
function set(key,value) {
    store.set(key,value);
}
function del(key) {
    store.delete(key);
}
async function encrypt(raw) {
    if (!safeStorage.isAsyncEncryptionAvailable()) return {s:false,e:"UNSUPPORTED"};
    return await safeStorage.encryptStringAsync(raw).then(e => {return {s: true, d: e}}).catch(e => {return {s: false, e: e}});
}
async function decrypt(soup) {
    if (!safeStorage.isAsyncEncryptionAvailable()) return {s:false,e:"UNSUPPORTED"};
    if (soup.type !== "Buffer") return {s:false,e:"INVALIDTYPE"};
    return await safeStorage.decryptStringAsync(Buffer.from(soup.data)).then(e => {return {s: true, ...e}}).catch(e => {return {s: false, e: e}});
}
module.exports = {get,set,del,encrypt,decrypt};