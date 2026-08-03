function initializeAttemptsDiv() {
    const attemptsDiv = document.querySelector("#attemptsdiv");
    attemptsDiv.innerHTML = '<div><p>Session attempts:</p><div id="attemptscontainer"></div></div>';
}

function LoadPage(type) {
    const main = document.querySelector("main");
    main.setAttribute("page-type", type);
    if (type === "login") {
        main.innerHTML = '<div id="attemptsdiv"></div><h1>Sign in</h1><div class="form"><label for="username">Username</label><input id="username" type="text" placeholder="Username"><label for="password">Password</label><input id="password" type="password" placeholder="Password"><div><input type="checkbox" id="rememberme"><label for="rememberme">Remember my name</label></div><div><input type="checkbox" id="rememberpass" disabled><label for="rememberpass">Remember my password</label></div><button class="btn banner" id="loginbutton">Login</button><div class="dash"><div></div><p>OR</p><div></div></div><button class="btn" id="guestbutton">Use without signing in</button></div>'
        main.querySelector("#guestbutton").addEventListener("click", () => {
            console.log("starting as guest...");
            window.suDesktop.openAsGuest();
        })
        main.querySelector("#rememberme").addEventListener("change", (e) => {
            main.querySelector("#rememberpass").disabled = !e.target.checked;
            if (!e.target.checked) main.querySelector("#rememberpass").checked = false;
        });
        main.querySelector("#loginbutton").addEventListener("click", () => {
            const username = main.querySelector("#username").value;
            const password = main.querySelector("#password").value;
            const rememberme = main.querySelector("#rememberme").checked;
            const rememberpass = main.querySelector("#rememberpass").checked;
            window.suDesktop.signIn({ username, password, rememberme, rememberpass });
        });
        initializeAttemptsDiv();
    }
    else console.warn("Invalid choice");
}
if (localStorage.getItem("pagetype")) {
    LoadPage(localStorage.getItem("pagetype"));
    localStorage.removeItem("pagetype");
}
window.suDesktop.onMessageFromMain("session-attempts", (data) => {
    console.log(Object.keys(data.attempts).length);
    const attemptsDiv = document.querySelector("#attemptsdiv");
    if (attemptsDiv) {
        const container = attemptsDiv.querySelector("#attemptscontainer");
        if (container) {
            const elements = container.querySelectorAll("div");
            for (const el of elements) {
                if (!data.attempts[el.className.split("-")[1]] && !el.classList.contains("disappearing")) {
                    el.classList.add("disappearing");
                    el.style.animation = "attemptdisappear 0.3s cubic-bezier(1, 0, 1, 1) forwards";
                    setTimeout(() => {
                        container.removeChild(el);
                    }, 300);
                }
            }
            for (const attempt in data.attempts) {
                const status = data.attempts[attempt].status;
                let symbol = status == "pending" ? "⛶" : status == "accepted" ? "✔" : status == "busy" ? "⛝" : "?";
                let attemptDiv = container.querySelector(`.attempt-${attempt}`);
                if (!attemptDiv) {
                    attemptDiv = document.createElement("div");
                    attemptDiv.classList.add(`attempt-${attempt}`);
                    container.appendChild(attemptDiv);
                    attemptDiv.innerText = attempt;
                    if (attempt > 99) attemptDiv.style.fontSize = "12px";
                    if (status != "pending") {
                        attemptDiv.style.animation = "attemptappear 0.3s cubic-bezier(0, 1, 1, 1) forwards";
                    }
                }
                else if (status != "pending") {
                    attemptDiv.style.animation = "none";
                }
                attemptDiv.style.backgroundColor = status == "pending" ? "var(--brand)" : status == "accepted" ? "#00a000" : status == "busy" ? "#ff8100" : status == "error" ? "red" : "gray";
            }
        }
    }
});