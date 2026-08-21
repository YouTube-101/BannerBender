function initializeAttemptsDiv() {
    const attemptsDiv = document.querySelector("#attemptsdiv");
    attemptsDiv.innerHTML = '<div><p>Session attempts:</p><div id="attemptscontainer"></div></div>';
}

function LoadPage(type) {
    const main = document.querySelector("main");
    main.setAttribute("page-type", type);
    if (type === "login") {
        let manualLoginSet = false;
        main.innerHTML = '<div id="attemptsdiv" style="display:none;"></div><h1>Sign in</h1><div class="form"><span id="loginerror"></span><label for="username">Username</label><input id="username" type="text" placeholder="Username"><label for="password">Password</label><input id="password" type="password" placeholder="Password"><div><input type="checkbox" id="rememberme"><label for="rememberme">Remember my name</label></div><div><input type="checkbox" id="rememberpass" disabled><label for="rememberpass">Remember my password</label></div><div><input type="checkbox" id="registrationmode"><label for="registrationmode">Brute force me in!</label></div><button class="btn banner" id="loginbutton">Login</button><div class="dash"><div></div><p>OR</p><div></div></div><button class="btn" id="guestbutton">Use without signing in</button></div>'
        main.querySelector("#username").addEventListener("input", () => {
            if (main.querySelector("#username").value.includes("@")) {
                main.querySelector("#username").value = main.querySelector("#username").value.split("@")[0];
            }
        });
        main.querySelector("#guestbutton").addEventListener("click", () => {
            console.log("starting as guest...");
            window.suDesktop.openAsGuest();
        })
        main.querySelector("#rememberme").addEventListener("change", (e) => {
            main.querySelector("#rememberpass").disabled = !e.target.checked;
            if (!e.target.checked) main.querySelector("#rememberpass").checked = false;
        });
        main.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                main.querySelector("#loginbutton").click();
            }
        });
        main.querySelector("#loginbutton").addEventListener("click", async () => {
            const username = main.querySelector("#username").value;
            const password = main.querySelector("#password").value;
            const rememberme = main.querySelector("#rememberme").checked;
            const rememberpass = main.querySelector("#rememberpass").checked;
            const rushing = main.querySelector("#registrationmode").checked;
            main.querySelector("#loginerror").style.display = "none";
            main.querySelector("#username").disabled = true;
            main.querySelector("#password").disabled = true;
            main.querySelector("#rememberme").disabled = true;
            main.querySelector("#rememberpass").disabled = true;
            main.querySelector("#registrationmode").disabled = true;
            main.querySelector("#loginbutton").disabled = true;
            main.querySelector("#guestbutton").disabled = true;
            main.querySelector("#loginbutton").innerText = "Hang on a moment...";
            const result = await window.suDesktop.signIn({ username, password, rememberme, rememberpass, rushing });
            if (!result.s) {
                if (!result.w) {
                    if (result.d === 503) {
                        if (!manualLoginSet) {
                            manualLoginSet = true;
                            result.d = "\"System is busy or out of registration hours.\"\nTry again now to brute force your way in.\nUncheck the \"Brute force!\" box to log in manually.";
                            main.querySelector("#registrationmode").checked = true;
                        } else {
                            result.d = "\"System is busy or out of registration hours.\"\nPlease try again later.\nSelect the \"Brute force!\" box to auto retry.";
                        }
                    }
                    main.querySelector("#loginbutton").innerText = "Login";
                    main.querySelector("#loginerror").innerText = result.d;
                    main.querySelector("#loginerror").style.display = "block";
                    main.querySelector("#username").disabled = false;
                    main.querySelector("#password").disabled = false;
                    main.querySelector("#rememberme").disabled = false;
                    if (main.querySelector("#rememberme").checked) main.querySelector("#rememberpass").disabled = false;
                    main.querySelector("#registrationmode").disabled = false;
                    main.querySelector("#loginbutton").disabled = false;
                    main.querySelector("#guestbutton").disabled = false;
                }
            }
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
    const attemptsDiv = document.querySelector("#attemptsdiv");
    attemptsDiv.style.display = "block";
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
["drop", "dragover"].forEach((t => {document.addEventListener(t, (e => {e.stopPropagation()}), !0)}));