function LoadPage(type) {
    const main = document.querySelector("main");
    main.setAttribute("page-type", type);
    if (type === "login") {
        main.innerHTML = '<h1>Sign in</h1><div class="form"><label for="username">Username</label><input id="username" type="text" placeholder="Username"><label for="password">Password</label><input id="password" type="password" placeholder="Password"><div><input type="checkbox" id="rememberme"><label for="rememberme">Remember my name</label></div><div><input type="checkbox" id="rememberpass" disabled><label for="rememberpass">Remember my password</label></div><button class="btn banner">Login</button><div class="dash"><div></div><p>OR</p><div></div></div><button class="btn" id="guestbutton">Use without signing in</button></div>'
        main.querySelector("#guestbutton").addEventListener("click", () => {
            console.log("starting as guest...");
            window.suDesktop.openAsGuest();
        })
    }
    else console.warn("Invalid choice");
}
if (localStorage.getItem("pagetype")) {
    LoadPage(localStorage.getItem("pagetype"));
    localStorage.removeItem("pagetype");
}