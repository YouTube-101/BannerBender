(() => {
  "use strict";

  const CSV_URL = "./scrapeResults/courses.csv";
  const SAVE_SLOTS_KEY = "suScheduleNamedSlotsV2";
  const PREVIOUS_SAVE_SLOTS_KEY = "suScheduleSaveSlotsV1";
  const LEGACY_SAVE_KEY = "suScheduleSelectionV2";
  const START_MIN = 8 * 60 + 40;
  const END_MIN = 21 * 60 + 30;
  const SLOT_HEIGHT = 64;
  const DAYS = [
    { name: "Monday", code: "M" },
    { name: "Tuesday", code: "T" },
    { name: "Wednesday", code: "W" },
    { name: "Thursday", code: "R" },
    { name: "Friday", code: "F" }
  ];

  const state = {
    term: null,
    sections: [],
    courses: [],
    completedCourses: new Set(),
    selected: new Set(),
    filteredCourses: [],
    expandedCourses: new Set()
  };

  const $ = id => document.getElementById(id);
  const fileInput = $("fileInput");
  const dropZone = $("dropZone");
  const reloadCsvBtn = $("reloadCsvBtn");
  const csvStatus = $("csvStatus");
  const csvSourceLabel = $("csvSourceLabel");
  const controls = $("controls");
  const courseList = $("courseList");
  const signinbutton = $("signinbutton");
  const usermenubutton = $("usermenubutton");
  const settingsbutton = $("settingsbutton");
  const scheduleWrap = $("scheduleWrap");
  const searchFieldFilter = $("searchFieldFilter");
  const creditFilter = $("creditFilter");
  const fitFilter = $("fitFilter");
  const search = $("search");
  const conflictNote = $("conflictNote");
  const stats = $("stats");
  const selectedSummaryWrap = $("selectedSummaryWrap");
  const selectedSummaryLabel = $("selectedSummaryLabel");
  const selectedSummaryList = $("selectedSummaryList");
  const saveSlotSelect = $("saveSlotSelect");
  const renameSlotInput = $("renameSlotInput");
  const addSaveSlotBtn = $("addSaveSlotBtn");
  const renameSaveSlotBtn = $("renameSaveSlotBtn");
  const deleteSaveBtn = $("deleteSaveBtn");
  const saveStatus = $("saveStatus");
  let registeredSchedule = [];
  let pendingBannerUrl = "";
  const registeredMajors = {
    level: null,
    major: null,
    double: null,
    minors: [],
    admits: {}
  };

  dropZone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", event => loadFile(event.target.files[0]));

  ["dragenter", "dragover"].forEach(type => {
    dropZone.addEventListener(type, event => {
      event.preventDefault();
      dropZone.classList.add("drag");
    });
  });

  ["dragleave", "drop"].forEach(type => {
    dropZone.addEventListener(type, event => {
      event.preventDefault();
      dropZone.classList.remove("drag");
    });
  });

  dropZone.addEventListener("drop", event => loadFile(event.dataTransfer.files[0]));
  reloadCsvBtn.addEventListener("click", loadCSVFromGitHub);

  search.addEventListener("input", renderCourseList);
  searchFieldFilter.addEventListener("change", () => {
    const placeholders = {
      coursecode: "Search course code, e.g. CS 204...",
      instructor: "Search instructor name..."
    };

    search.placeholder =
      placeholders[searchFieldFilter.value] || "Search...";
    renderCourseList();
  });
  creditFilter.addEventListener("change", renderCourseList);
  fitFilter.addEventListener("change", renderCourseList);

  signinbutton.addEventListener("click", () => {
    window.suDesktop.requestSignIn();
  });

  const majorRequirements = {};

  function parseMajor(csvRows, admit) {
    // get the last key of the object here

    const result = {};
    const requirements = {};
    csvRows.forEach(row => {
      const firstCol = row[Object.keys(row)[Object.keys(row).length - 1]];
      delete row[Object.keys(row)[Object.keys(row).length - 1]];
      if (row[admit] === undefined) return;
      else row = row[admit];
      if (firstCol.includes(":")) {
        if (row === "") return;
        else row = parseInt(row);
        requirements[firstCol.split(":")[1].trim()] = row;
      }
      else result[firstCol] = row;

    });
    return { result, requirements };
  }

  async function loadMajorData() {
    Object.keys(majorRequirements).forEach(key => delete majorRequirements[key]);
    const majorDataText = await (async () => {
      if (window.suDesktop) return await window.suDesktop.getMajor(registeredMajors.level, registeredMajors.major);
      else {
        const filePath = registeredMajors.level === "MN" ? `scrapeResults/Minors/${registeredMajors.major}.csv` : `scrapeResults/${registeredMajors.level}Majors/${registeredMajors.major}.csv`;
        const raw = await fetch(filePath, { cache: "no-store", method: "GET" });
        return await raw.text();
      }
    })();
    if (!majorDataText) return null;
    const primaryAdmit = registeredMajors.admits[registeredMajors.major] || state.term;
    majorRequirements[registeredMajors.major] = parseMajor(parseCSV(majorDataText), primaryAdmit);
    if (registeredMajors.double && registeredMajors.double !== "none") {
      const doubleAdmit = registeredMajors.admits[registeredMajors.double] || state.term;
      const double = await window.suDesktop.getMajor("DM", registeredMajors.double);
      majorRequirements[registeredMajors.double] = parseMajor(parseCSV(double), doubleAdmit);
    }
    for (const minor of registeredMajors.minors) {
      const minorAdmit = registeredMajors.admits[minor] || state.term;
      majorRequirements[minor] = parseMajor(parseCSV(await window.suDesktop.getMajor("MN", minor)), minorAdmit);
    }
    console.log("Loaded major data:", majorRequirements);
  }

  const privacySettings = [
    {
      type: "header",
      head: "Required Access",
      label: "These settings are required for the app to function properly."
    },
    {
      type: "checkbox",
      forced: true,
      id: "Courses",
      head: "Registered Course Read Access",
      label: "Permit this app to read your registered courses from Banner.",
      why: "To show your registered courses on the schedule view and to prevent any duplicate entries during registration.",
      how: "During registration times, the app goes to the registration form page and reads the registered course numbers from that page. During non-registration times, the app goes to the detailed schedule page and reads the registered course numbers from that page."
    },
    {
      type: "checkbox",
      forced: true,
      id: "BaseName",
      head: "Basic Name Access",
      label: "Permit this app to read your name from the registration page on Banner.",
      why: "Just to make sure the app is being used by you and not someone else. This is a security measure to prevent accidental use by someone else.",
      how: "On registration page and detailed schedule page, Banner shows the user's name on the top right corner of the page. The app effortlessly reads the name from that location. Please note that Banner returns the name with initials for middle names."
    },
    {
      type: "header",
      head: "Visual Access",
      label: "These settings are optional and only benefits your user experience. Does not affect the app's core functionality."
    },
    {
      type: "checkbox",
      default: true,
      id: "Image",
      head: "Image Access",
      label: "Permit this app to access your profile image from Banner.",
      why: "Just to show your profile image on the top right corner of the window. This is purely cosmetic and does not affect the app's core functionality.",
      how: "The app goes to the view my photo page under Personal Information section on Banner and gets the image from that page."
    },
    {
      type: "checkbox",
      default: true,
      id: "FullName",
      head: "Full Name Access",
      label: "Permit this app to access your full name from Banner.\nThis permission is not necessary and this access won't be needed if your full name is only 2 words. This only matters to you if you have multiple words in your name.",
      why: "Unlike basic name access, this permission is needed to display your full name without abbreviations on the top right corner of the window. This is purely cosmetic and does not affect the app's core functionality.",
      how: "Banner does not provide your full name on most pages other than some personal information pages. The app goes to Student > Financial Aid > My Award Information > Payment Information page and reads the full name from that page. Yes, it does load your tuition information in order to get your full name. However, the app does not read any tuition information and only reads your full name from that page."
    },
    {
      type: "header",
      head: "Advanced Access",
      label: "This app also features quality of life improvements that require additional access to your Banner account. These are optional and you are in control with what you would grant access to."
    },
    {
      type: "checkbox",
      id: "MajorsMinors",
      head: "Program Access",
      label: "Permit this app to access your majors and minors along with admit term from Banner.",
      why: "To display whether a course you are looking at is required or a certain type of elective for your program. This is purely for giving you more information regarding your progress in your program and does not affect the app's core functionality.",
      how: "The app goes to Student > Student Records > General Student Information page and reads your majors and minors along with admit term from that page."
    },
    {
      type: "checkbox",
      id: "FinalGrades",
      head: "Final Grades Access",
      label: "Permit this app to access your final grades of all terms from Banner.",
      why: "To display whether a course you are looking can be registered to or not due to pre-requisites and other requirements.",
      how: "The app goes to Student > Student Records > Final Grades page and loads the final grades of each term and reads the final grades from that page."
    },
    {
      type: "header",
      head: "Dangerous Access",
      label: "These settings are for essential quality of life features that require write access. These settings WILL make changes on your behalf and WILL submit forms on your behalf. Regardless of given access, this app will always request your explicit consent before submitting any forms."
    },
    {
      type: "checkbox",
      id: "Registration",
      head: "Registration Editing Access",
      label: "Permit this app to submit registration changes on your behalf.",
      why: "To allow you to submit registration forms directly from this app without having to go to Banner and typing all of your course numbers on a form. This is purely for your convenience.",
      how: "The app creates a registration/add-drop form request that's specifically made for your courses and submits that form on your behalf. The app then reads the response from Banner and shows you the result of your registration request. The form submission will not be made without your explicit consent and you will always be shown the form summary before submission. You can choose how efficient/replicative you want the form submission to be. For that, please refer to Network settings."
    },
    {
      type: "checkbox",
      id: "DegreeEvaluation",
      head: "Degree Evaluation Access",
      label: "Permit this app to submit degree evaluation requests on your behalf.",
      why: "A combinational alternative to program access and final grades access. For displaying pre-requisites and program requirement information on the course you are looking at. This permission is not necessary if you have already granted program access and final grades access. However, you can achieve a similar result by granting those two permissions instead of this one.",
      how: "The app checks for previous degree evaluation requests during the last semester and if there are any, it reads the results from those requests. If there are no previous requests, the app can submit a new degree evaluation request on your behalf and reads the results from that request. If an evaluation form submission is required, the app will request your explicit consent and you will always be shown the form summary before submission."
    },
  ]
  const networkSettings = [
    {
      type: "header",
      head: "Banner Contact Settings",
      label: "These settings are for how the app contacts Banner.",
    },
    {
      type: "checkbox",
      default: true,
      id: "AutoSessionRetry",
      head: "Brute Force Session Allocation",
      label: "Permit this app to send a login request every 1 second and use the session keys from a successful retry. In basic terms, it repeatedly tries to get to the login screen during \"System is busy or out of registration hours\" moments.",
    },
    {
      type: "checkbox",
      default: false,
      id: "RequestDelay",
      head: "Wait Before Request",
      label: "Wait for a short time before sending a request to Banner. This is to prevent Banner from thinking that the app is a bot.",
    },
    {
      type: "checkbox",
      default: false,
      id: "RequestNavigate",
      head: "Navigate Before Request",
      label: "Simulate user navigation before sending the final request to Banner. This is to prevent Banner from thinking that the app is a bot.",
    },
    {
      type: "checkbox",
      default: true,
      id: "EfficientForms",
      head: "Omit Unnecessary Fields in Forms",
      label: "In registration submission forms, Banner usually fills out unnecessary fields with default values. This setting allows the app to omit those unnecessary fields and only fill out the required fields. This is slightly faster and more efficient. However, turning this off tries to prevent Banner from thinking that the app is a bot by simulating user behavior.",
    }
  ]

  $("settings").loadSetting = async (index) => {
    Array.from($("settings").querySelector(".sidebar").children).forEach(button => {
      button.classList.remove("active");
    });
    $("settings").querySelector(".sidebar").children[index].classList.add("active");
    $("settings").querySelector(".settings").innerHTML = '';
    console.log("Loading settings for index:", index);
    if (index === 0 || index === 1) {
      (index === 0 ? privacySettings : networkSettings).forEach(setting => {
        if (setting.type === "header") {
          const header = document.createElement("div");
          header.innerHTML = `<h3>${setting.head}</h3><p>${setting.label}</p>`;
          $("settings").querySelector(".settings").appendChild(header);
        }
        else {
          const switchLabel = document.createElement("label");
          switchLabel.innerHTML = `
          <div>
            <span></span>
            <span></span>
            ${setting.why || setting.how ? `<div class="explanationboxes">
              <div class="explanation">
                <div>
                  <span></span>
                  <span></span>
                </div>
                <button class="btn">Learn more</button>
              </div>
              <div class="explanation">
                <div>
                  <span></span>
                  <span></span>
                </div>
                <button class="btn">Learn more</button>
              </div>
            </div>`: ''}
          </div>
          <input type="checkbox" id="bannerPrivacy${setting.id}" ${(setting.forced ? 'disabled checked' : setting.default ? 'checked' : '')}>`;
          switchLabel.classList.add("settingsSwitch");
          switchLabel.setAttribute("for", `bannerPrivacy${setting.id}`);
          switchLabel.children[0].children[0].textContent = setting.head;
          switchLabel.children[0].children[1].textContent = setting.label;
          if (setting.why || setting.how) {
            switchLabel.children[0].children[2].children[0].children[0].children[0].textContent = "Why do you need this?";
            switchLabel.children[0].children[2].children[0].children[0].children[1].textContent = setting.why || "No explanation provided.";
            switchLabel.children[0].children[2].children[1].children[0].children[0].textContent = "How do you access this information?";
            switchLabel.children[0].children[2].children[1].children[0].children[1].textContent = setting.how || "No explanation provided.";
          }
          $("settings").querySelector(".settings").appendChild(switchLabel);
        }
      });
    }
    else if (index === 3) {
      const setMajors = {
        level: null,
        major: null,
        double: null,
        minors: []
      };
      setMajors.level = registeredMajors.level;
      setMajors.major = registeredMajors.major;
      setMajors.double = registeredMajors.double;
      let allMajors = {
        UG: [],
        MX: [],
        PD: [],
        DM: [],
        MN: []
      };
      if (window.suDesktop) {
        allMajors = window.suDesktop.getAllMajors();
      }
      else {
        const majorText = await fetch("scrapeResults/majorNames.csv", { cache: "no-store", method: "GET" });
        const majorNames = await majorText.text()
        majorNames.split("\n").filter(x => x.trim() !== "").forEach(x => {
          const idx = x.indexOf(",");
          const line = { k: x.substring(0, idx), n: x.substring(idx + 1).replaceAll("\"", "") };
          if (line.k.endsWith("-MINOR") && !allMajors.MN.includes(line)) allMajors.MN.push(line);
          else if (line.k.endsWith("-DM") && !allMajors.DM.includes(line)) allMajors.DM.push(line);
          else if (line.k.startsWith("PHD") && !allMajors.PD.includes(line)) allMajors.PD.push(line);
          else if (line.k.startsWith("M") && !allMajors.MX.includes(line)) allMajors.MX.push(line);
          else if (line.k.startsWith("B") && !allMajors.UG.includes(line)) allMajors.UG.push(line);
        });
      }
      // sort by name alphabetically
      allMajors.UG.sort((a, b) => a.n > b.n);
      allMajors.MX.sort((a, b) => a.n > b.n);
      allMajors.PD.sort((a, b) => a.n > b.n);
      allMajors.DM.sort((a, b) => a.n > b.n);
      allMajors.MN.sort((a, b) => a.n > b.n);
      const settingSave = document.createElement("div");
      settingSave.classList.add("settingsSwitch");
      settingSave.innerHTML = '<div><h3>Nothing to save yet</h3><p>Once you select your options, you can save them here.</p></div><button class="btn" disabled>Save</button>'
      $("settings").querySelector(".settings").appendChild(settingSave)
      const levelMenu = document.createElement("div");
      levelMenu.innerHTML = '<h3>I am a(n)...</h3><div><button class="btn" data-level="UG">Undergraduate</button><button class="btn" data-level="MX">Masters</button><button class="btn" data-level="PD">Doctorate</button></div><h3>...student.</h3>'
      levelMenu.classList.add("centeredbuttonmenu");
      $("settings").querySelector(".settings").appendChild(levelMenu)
      const majorMenu = document.createElement("div");
      majorMenu.classList.add("centeredbuttonmenu");
      $("settings").querySelector(".settings").appendChild(majorMenu)
      majorMenu.style.display = "none";
      majorMenu.innerHTML = '<h3>My primary major is...</h3><div></div>'
      const doubleMenu = document.createElement("div");
      doubleMenu.classList.add("centeredbuttonmenu");
      $("settings").querySelector(".settings").appendChild(doubleMenu)
      doubleMenu.style.display = "none";
      doubleMenu.innerHTML = '<h3>My second major is...</h3><div><button class="btn active" data-double-major="none">Nothing</button></div>'
      function checkForChanges() {
        const bothAreSame = (setMajors.level === registeredMajors.level && setMajors.major === registeredMajors.major && setMajors.double === registeredMajors.double && setMajors.minors.length === registeredMajors.minors.length);
        const invalidChoices = (setMajors.level && setMajors.major === null)
        if (bothAreSame) {
          settingSave.children[0].children[0].textContent = "Nothing to save yet";
          settingSave.children[0].children[1].textContent = "Once you select your options, you can save them here.";
          settingSave.children[1].classList.remove("active");
          settingSave.children[1].disabled = true;
        }
        else if (invalidChoices) {
          settingSave.children[0].children[0].textContent = "Select a major first";
          settingSave.children[0].children[1].textContent = "You can save when you select a major for your level of study.";
          settingSave.children[1].classList.remove("active");
          settingSave.children[1].disabled = true;
        }
        else {
          settingSave.children[0].children[0].textContent = "You have unsaved changes";
          settingSave.children[0].children[1].textContent = "Click the save button to save your changes.";
          settingSave.children[1].classList.add("active");
          settingSave.children[1].disabled = false;
        }
      }
      settingSave.children[1].addEventListener("click", async () => {
        settingSave.children[0].children[0].textContent = "Saving...";
        settingSave.children[0].children[1].textContent = "Please wait while your changes are being saved.";
        settingSave.children[1].textContent = "Saving...";
        settingSave.children[1].classList.remove("active");
        settingSave.children[1].disabled = true;

        const selectHTML = (() => {
          const startYear = 1999;
          const currentYear = parseInt(state.term.substring(0, 4));
          let optionsHTML = '';
          const yearSelect = document.createElement("select");
          for (let year = startYear; year <= currentYear; year++) {
            const option = document.createElement("option");
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
          }
          const termSelect = document.createElement("select");
          const termOptions = [
            { value: "01", text: "Fall" },
            { value: "02", text: "Spring" },
            { value: "03", text: "Summer" }
          ];
          for (const termOption of termOptions) {
            const option = document.createElement("option");
            option.value = termOption.value;
            option.textContent = termOption.text;
            termSelect.appendChild(option);
          }
          return termSelect.outerHTML + yearSelect.outerHTML;
        })()
        const dialog = createDialog("Admit term confirmation",
          `<p>Select your admitted term for each major and minor.</p>
          <div style="display: flex;gap: 5px;flex-wrap: wrap;justify-content: space-between;"><h3>Your entrance term</h3><div data-term="${setMajors.major}">${selectHTML}</div></div>
          ${(setMajors.double && setMajors.double !== "none") ? `<div style="display: flex;gap: 5px;flex-wrap: wrap;justify-content: space-between;"><h3>Your double major declaration term</h3><div data-term="${setMajors.double}">${selectHTML}</div></div>` : ''}
          ${(() => {
            let html = '';
            for (const minor of setMajors.minors) {
              html += `<div style="display: flex;gap: 5px;flex-wrap: wrap;justify-content: space-between;"><h3>Your ${minor.substring(0, minor.indexOf("-"))} minor declaration term</h3><div data-term="${minor}">${selectHTML}</div></div>`;
            }
            return html;
          })()}
          <button class="btn active">Confirm & Save</button><button class="btn modalHide">Cancel</button>
          `
        );
        let confirmed = false;
        dialog.querySelectorAll("div[data-term]").forEach(div => {
          let termCode = state.term;
          if (registeredMajors.admits[div.getAttribute("data-term")]) {
            termCode = registeredMajors.admits[div.getAttribute("data-term")];
          }
          const year = termCode.substring(0, 4);
          const term = termCode.substring(4, 6);
          const selects = div.querySelectorAll("select");
          selects[1].value = year;
          selects[0].value = term;
        });
        dialog.querySelector("button.active").addEventListener("click", () => {
          confirmed = true;
          dialog.querySelectorAll("div[data-term]").forEach(div => {
            const selects = div.querySelectorAll("select");
            const year = selects[1].value;
            const term = selects[0].value;
            const termCode = year + term;
            registeredMajors.admits[div.getAttribute("data-term")] = termCode;
          });
          dialog.hide();
        });
        dialog.querySelector("button.modalHide").addEventListener("click", () => {
          dialog.hide();
        });
        dialog.show();
        dialog.onceOnClose(async () => {
          dialog.remove();
          if (confirmed) {
            registeredMajors.level = setMajors.level;
            registeredMajors.major = setMajors.major;
            registeredMajors.double = setMajors.double;
            registeredMajors.minors = [...setMajors.minors];
            localStorage.setItem("registeredMajors", JSON.stringify(registeredMajors));
            await loadMajorData();
            renderCourseList();
          }
          settingSave.children[1].textContent = "Save";
          checkForChanges();
        });
      });
      for (const major of allMajors.DM) {
        const majorButton = document.createElement("button");
        majorButton.classList.add("btn");
        majorButton.textContent = major.n;
        majorButton.setAttribute("data-double-major", major.k);
        doubleMenu.children[1].appendChild(majorButton);
      }
      const minorMenu = document.createElement("div");
      minorMenu.classList.add("centeredbuttonmenu");
      $("settings").querySelector(".settings").appendChild(minorMenu)
      minorMenu.style.display = "none";
      minorMenu.innerHTML = '<h3>My minors are...</h3><div></div>'
      for (const major of allMajors.MN) {
        const majorButton = document.createElement("button");
        majorButton.classList.add("btn");
        majorButton.textContent = major.n;
        majorButton.setAttribute("data-minor", major.k);
        minorMenu.children[1].appendChild(majorButton);
      }
      function showMajorFor(level) {
        setMajors.level = level;
        if (level === "UG") {
          doubleMenu.style.display = "";
          minorMenu.style.display = "";
        } else {
          doubleMenu.style.display = "none";
          minorMenu.style.display = "none";
        }
        checkForChanges();
        majorMenu.style.display = "";
        majorMenu.children[1].innerHTML = '';
        for (const major of allMajors[level]) {
          const majorButton = document.createElement("button");
          majorButton.classList.add("btn");
          majorButton.textContent = major.n;
          majorButton.setAttribute("data-major", major.k);
          majorMenu.children[1].appendChild(majorButton);
          majorButton.addEventListener("click", () => {
            majorMenu.children[1].querySelectorAll("button").forEach(x => x.classList.remove("active"));
            majorButton.classList.add("active");
            setMajors.major = major.k;
            checkForChanges();
          });
        }
      }
      levelMenu.children[1].querySelectorAll("button").forEach(x => x.addEventListener("click", () => {
        levelMenu.children[1].querySelectorAll("button").forEach(x => x.classList.remove("active"));
        x.classList.add("active");
        const level = x.getAttribute("data-level");
        showMajorFor(level);
      }))
      doubleMenu.children[1].querySelectorAll("button").forEach(x => x.addEventListener("click", () => {
        doubleMenu.children[1].querySelectorAll("button").forEach(x => x.classList.remove("active"));
        x.classList.add("active");
        setMajors.double = x.getAttribute("data-double-major");
        if (setMajors.double === "none") setMajors.double = null;
        checkForChanges();
      }))
      minorMenu.children[1].querySelectorAll("button").forEach(x => x.addEventListener("click", () => {
        x.classList.toggle("active");
        if (x.classList.contains("active")) setMajors.minors.push(x.getAttribute("data-minor"));
        else setMajors.minors = setMajors.minors.filter(y => y !== x.getAttribute("data-minor"));
        checkForChanges();
      }))
      if (registeredMajors.level) {
        levelMenu.querySelector("button[data-level='" + registeredMajors.level + "']").classList.add("active");
        showMajorFor(registeredMajors.level);
        if (registeredMajors.major) {
          majorMenu.querySelector("button[data-major='" + registeredMajors.major + "']").classList.add("active");
        }
        if (registeredMajors.double) {
          doubleMenu.querySelector("button[data-double-major='none']").classList.remove("active");
          doubleMenu.querySelector("button[data-double-major='" + registeredMajors.double + "']").classList.add("active");
        }
        for (const minor of registeredMajors.minors) {
          minorMenu.querySelector("button[data-minor='" + minor + "']").classList.add("active");
          setMajors.minors.push(minor);
        }
      }
    }
  }
  Array.from($("settings").querySelector(".sidebar").children).forEach((button, index) => {
    button.addEventListener("click", event => {
      $("settings").loadSetting(index);
    });
  });
  $("settings").initialize = () => {
    $("settings").loadSetting(window.suDesktop ? 0 : 2);
  }

  document.querySelectorAll(".modal").forEach(dialog => {
    dialog.show = async () => {
      dialog.style.display = "flex";
      dialog.style.animation = "modalBG 0.2s cubic-bezier(0, 1, 1, 1) forwards";
      dialog.children[0].style.animation = "modalAppear 0.2s cubic-bezier(0, 1, 1, 1) forwards";
      if (dialog.initialize) {
        dialog.initialize();
      }
    }
    dialog.hide = () => {
      dialog.style.animation = "modalBGDisappear 0.2s cubic-bezier(1, 0, 1, 1) forwards";
      dialog.children[0].style.animation = "modalDisppear 0.2s cubic-bezier(1, 0, 1, 1) forwards";
      setTimeout(() => {
        dialog.style.display = "none";
      }, 200);
    }
    dialog.addEventListener("click", event => {
      if (event.target === dialog) {
        dialog.hide();
      }
    });
    dialog.querySelector(".close").addEventListener("click", () => {
      dialog.hide();
    });
  });

  settingsbutton.addEventListener("click", () => {
    $("settings").show();
  });

  function createDialog(title, content) {
    const dialog = document.createElement("dialog");
    dialog.classList.add("modal");
    dialog.innerHTML =
      `<div style="height: max-content; width: max-content;">
      <section class="modal-header">
        <h2>${title}</h2>
        <button class="btn close"></button>
      </section>
      <div style="grid-template-columns: auto;">
        ${content}
      </div>
    </div>`;
    dialog.show = async () => {
      dialog.style.display = "flex";
      dialog.style.animation = "modalBG 0.2s cubic-bezier(0, 1, 1, 1) forwards";
      dialog.children[0].style.animation = "modalAppear 0.2s cubic-bezier(0, 1, 1, 1) forwards";
      if (dialog.initialize) {
        dialog.initialize();
      }
    }
    dialog.hide = () => {
      dialog.style.animation = "modalBGDisappear 0.2s cubic-bezier(1, 0, 1, 1) forwards";
      dialog.children[0].style.animation = "modalDisppear 0.2s cubic-bezier(1, 0, 1, 1) forwards";
      setTimeout(() => {
        dialog.style.display = "none";
      }, 200);
    }
    dialog.onceOnClose = async (callback) => {
      await new Promise(async resolve => {
        while (dialog.style.display !== "none") {
          await new Promise(r => setTimeout(r, 100));
        }
        resolve();
      });
      callback();
    }
    dialog.addEventListener("click", event => {
      if (event.target === dialog) {
        dialog.hide();
      }
    });
    dialog.querySelector(".close").addEventListener("click", () => {
      dialog.hide();
    });
    document.body.appendChild(dialog);
    return dialog;
  }

  function sanitizeSlotName(value, fallback = "Untitled schedule") {
    const name = String(value || "").trim().replace(/\s+/g, " ");
    return (name || fallback).slice(0, 60);
  }

  function makeSlotId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeStoredSlot(value, index = 0) {
    if (!value || typeof value !== "object") return null;
    if (!Array.isArray(value.selected)) return null;

    return {
      id: String(value.id || makeSlotId()),
      name: sanitizeSlotName(value.name, `Schedule ${index + 1}`),
      selected: value.selected,
      savedAt: value.savedAt || ""
    };
  }

  function writeSaveSlots(slots) {
    localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(slots));
  }

  function readSaveSlots() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVE_SLOTS_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];

      const normalized = parsed
        .map((slot, index) => normalizeStoredSlot(slot, index))
        .filter(Boolean);

      // Keep IDs/names normalized.
      if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
        writeSaveSlots(normalized);
      }

      return normalized;
    } catch (error) {
      console.warn("Could not read schedule save slots.", error);
      return [];
    }
  }

  function migrateOldSaveDataOnce() {
    if (localStorage.getItem(SAVE_SLOTS_KEY) !== null) return;

    let migrated = [];

    try {
      const previousRaw = localStorage.getItem(PREVIOUS_SAVE_SLOTS_KEY);

      if (previousRaw !== null) {
        const previous = JSON.parse(previousRaw);

        if (Array.isArray(previous)) {
          migrated = previous
            .map((slot, index) => normalizeStoredSlot(slot, index))
            .filter(Boolean);
        } else if (previous && typeof previous === "object") {
          migrated = Object.keys(previous)
            .map(Number)
            .filter(Number.isInteger)
            .filter(key => key > 0)
            .sort((a, b) => a - b)
            .map((key, index) => {
              const slot = normalizeStoredSlot(previous[String(key)], index);
              if (!slot) return null;
              slot.name = sanitizeSlotName(slot.name, `Schedule ${key}`);
              return slot;
            })
            .filter(Boolean);
        }
      }

      if (!migrated.length) {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_SAVE_KEY) || "[]");
        if (Array.isArray(legacy) && legacy.length) {
          migrated = [{
            id: makeSlotId(),
            name: "Imported schedule",
            selected: legacy,
            savedAt: new Date().toISOString()
          }];
        }
      }
    } catch (error) {
      console.warn("Could not migrate old save data.", error);
      migrated = [];
    }

    writeSaveSlots(migrated);

    // Old keys are removed so deleted slots cannot reappear.
    localStorage.removeItem(PREVIOUS_SAVE_SLOTS_KEY);
    localStorage.removeItem(LEGACY_SAVE_KEY);
  }

  function currentSlotId() {
    return saveSlotSelect.value || "";
  }

  function currentSlot(slots = readSaveSlots()) {
    const id = currentSlotId();
    return slots.find(slot => slot.id === id) || null;
  }

  function setSaveStatus(message) {
    saveStatus.textContent = message;
    window.clearTimeout(setSaveStatus.timeoutId);

    if (message) {
      setSaveStatus.timeoutId = window.setTimeout(() => {
        saveStatus.textContent = "";
      }, 2200);
    }
  }

  function savedSelectionCreditText(selectedKeys) {
    if (!Array.isArray(selectedKeys) || !selectedKeys.length) {
      return "0 credits";
    }

    // Before the CSV finishes loading we cannot map stored section keys
    // back to course credits yet. refreshSaveSlotUI() runs again after load.
    if (!state.sections.length) {
      return "credits loading…";
    }

    const selectedSet = new Set(selectedKeys);
    const uniqueCourses = new Map();

    state.sections.forEach(section => {
      if (!selectedSet.has(section.key) || isLabOrRecitation(section)) return;

      const courseKey = `${section.subject}:${canonicalCourseNumber(section)}`;

      if (!uniqueCourses.has(courseKey)) {
        uniqueCourses.set(courseKey, numericCredits(section.credits));
      } else if (uniqueCourses.get(courseKey) === null) {
        uniqueCourses.set(courseKey, numericCredits(section.credits));
      }
    });

    const credits = [...uniqueCourses.values()];
    const knownTotal = credits.reduce(
      (sum, value) => sum + (value ?? 0),
      0
    );
    const unknownCount = credits.filter(value => value === null).length;

    return (
      `${formatCredits(knownTotal)} credits` +
      (unknownCount ? ` + ${unknownCount} unknown` : "")
    );
  }

  function refreshSaveSlotUI(preferredId = currentSlotId()) {
    const slots = readSaveSlots();

    if (!slots.length) {
      saveSlotSelect.innerHTML =
        `<option value="">No save slots</option>`;

      saveSlotSelect.value = "";

      renameSlotInput.value = "";
      renameSlotInput.hidden = true;
      renameSlotInput.disabled = true;

      updateSaveSlotButtons();
      return;
    }

    saveSlotSelect.innerHTML = slots.map(slot => {
      const status = savedSelectionCreditText(slot.selected);

      return `<option value="${esc(slot.id)}">${esc(slot.name)} · ${esc(status)}</option>`;
    }).join("");

    const requestedExists = slots.some(slot => slot.id === preferredId);
    saveSlotSelect.value = requestedExists ? preferredId : slots[0].id;

    const selected = currentSlot(slots);

    renameSlotInput.hidden = true;
    renameSlotInput.disabled = false;
    renameSlotInput.value = selected?.name || "";

    updateSaveSlotButtons();
  }
  function loadSlotIntoSchedule(slot, showStatus = true) {
    if (!slot || !state.sections.length) return;

    normalizeExclusiveSelection(slot.selected);
    renderAll();

    if (showStatus) {
      setSaveStatus(`Loaded ${slot.name}`);
    }
  }
  function updateSaveSlotButtons() {
    const slots = readSaveSlots();
    const slot = currentSlot(slots);
    const hasSlot = Boolean(slot);

    saveSlotSelect.disabled = !slots.length;
    renameSlotInput.disabled = !hasSlot;
    renameSaveSlotBtn.disabled = !hasSlot;
    deleteSaveBtn.disabled = !hasSlot;

    addSaveSlotBtn.disabled = false;
  }

  function ensureActiveSlotForAutosave() {
    let slots = readSaveSlots();
    let slot = currentSlot(slots);

    if (slot) return { slots, slot };

    slot = {
      id: makeSlotId(),
      name: `Schedule ${slots.length + 1}`,
      selected: [],
      savedAt: ""
    };

    slots.push(slot);
    writeSaveSlots(slots);
    refreshSaveSlotUI(slot.id);

    return { slots, slot };
  }

  function autosaveCurrentSelection() {
    const { slots, slot } = ensureActiveSlotForAutosave();

    slot.selected = [...state.selected];
    slot.savedAt = new Date().toISOString();

    writeSaveSlots(slots);
    refreshSaveSlotUI(slot.id);
    setSaveStatus("Autosaved");
  }

  saveSlotSelect.addEventListener("change", event => {
    event.preventDefault();

    const slot = currentSlot();

    renameSlotInput.hidden = true;
    renameSlotInput.value = slot?.name || "";

    updateSaveSlotButtons();

    if (slot) {
      loadSlotIntoSchedule(slot);
    }
  });

  addSaveSlotBtn.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();

    const slots = readSaveSlots();

    const defaultName =
      `Schedule ${slots.length + 1}`;

    const entered = prompt(
      "Name the new schedule:",
      defaultName
    );

    if (entered === null) return;

    const name = sanitizeSlotName(
      entered,
      defaultName
    );

    const slot = {
      id: makeSlotId(),
      name,
      selected: [],
      savedAt: ""
    };

    slots.push(slot);
    writeSaveSlots(slots);

    refreshSaveSlotUI(slot.id);

    if (state.sections.length) {
      state.selected.clear();
      renderAll();
    }

    setSaveStatus("Slot created");
  });

  deleteSaveBtn.addEventListener("click", event => {
    // Explicitly block every default browser action.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const deletedId = currentSlotId();
    if (!deletedId) return false;

    const slots = readSaveSlots();
    const deletedIndex = slots.findIndex(slot => slot.id === deletedId);
    if (deletedIndex === -1) return false;

    const deletedName = slots[deletedIndex].name;

    // Remove the exact save by immutable ID.
    const remaining = slots.filter(slot => slot.id !== deletedId);
    writeSaveSlots(remaining);

    const nextSlot =
      remaining[Math.min(deletedIndex, remaining.length - 1)] ||
      remaining[remaining.length - 1] ||
      null;

    refreshSaveSlotUI(nextSlot?.id || "");

    if (state.sections.length) {
      if (nextSlot) {
        loadSlotIntoSchedule(nextSlot, false);
      } else {
        state.selected.clear();
        renderAll();
      }
    }

    setSaveStatus(`Deleted ${deletedName}`);

    return false;
  });

  migrateOldSaveDataOnce();
  refreshSaveSlotUI();

  function setCSVStatus(message, kind = "") {
    csvStatus.textContent = message;
    csvStatus.className = `csv-status${kind ? " " + kind : ""}`;
  }

  function loadCSVText(csvText, sourceLabel) {
    try {
      const rows = parseCSV(csvText);
      const daterange = rows[0].daterange;
      const currentyear = parseInt(daterange.split(",")[1].split("-")[0].trim());
      if (daterange.startsWith("Aug") || daterange.startsWith("Sep") || daterange.startsWith("Oct")) {
        state.term = String(currentyear) + "01";
      }
      else if (daterange.startsWith("Jan") || daterange.startsWith("Feb")) {
        state.term = String(currentyear - 1) + "02";
      }
      else if (daterange.startsWith("Jun") || daterange.startsWith("Jul")) {
        state.term = String(currentyear - 1) + "03";
      }
      else {
        console.error("Could not determine the current semester from the CSV daterange. Check the CSV file format.");
      }
      state.sections = groupRows(rows);
      state.courses = groupCourses(state.sections);

      if (!state.sections.length || !state.courses.length) {
        throw new Error("No recognizable course rows were found.");
      }

      state.selected.clear();
      state.expandedCourses.clear();
      controls.style.display = "";
      selectedSummaryWrap.style.display = "";
      populateFilters();
      refreshSaveSlotUI();

      const activeSlot = currentSlot();
      if (activeSlot) {
        normalizeExclusiveSelection(activeSlot.selected);
      }

      renderAll();

      csvSourceLabel.textContent = sourceLabel;
      setCSVStatus(
        `${state.courses.length} courses and ${state.sections.length} sections loaded.`,
        "ok"
      );
    } catch (error) {
      console.error(error);
      setCSVStatus(`CSV could not be parsed: ${error.message}`, "error");
      scheduleWrap.innerHTML =
        `<div class="empty">The course CSV could not be loaded. Use the manual file picker or fix sabanci_courses.csv in the repository.</div>`;
    }
  }

  async function loadCSVFromGitHub() {
    if (window.suDesktop) {
      document.querySelector("header").children[0].children[0].style.display = "none";
      window.suDesktop.reloadTitlebar();
      setCSVStatus("Fetching the latest version…", "loading");
      try {
        if (!window.suDesktop?.loadCourseCsv) {
          throw new Error("Electron desktop bridge is unavailable.");
        }

        const result = await window.suDesktop.loadCourseCsv();
        if (localStorage.getItem("registeredMajors")) {
          const json = JSON.parse(localStorage.getItem("registeredMajors"));
          registeredMajors.level = json.level;
          registeredMajors.major = json.major;
          registeredMajors.double = json.double;
          registeredMajors.minors = json.minors;
          registeredMajors.admits = json.admits || {};
          await loadMajorData();
        }
        loadCSVText(result.text, result.source);
      } catch (error) {
        console.error(error);
        console.log("GitHub CSV could not be downloaded");
        setCSVStatus(
          `Could not download the course CSV: ${error.message} Manual upload still works.`,
          "error"
        );
        scheduleWrap.innerHTML =
          `<div class="empty">Could not load sabanci_courses.csv from GitHub. Choose a local CSV to continue.</div>`;
      } finally {
        await window.suDesktop.loadFinished();
      }
    }
    else {
      signinbutton.style.display = "none";
      signinbutton.disabled = true;
      const settingsmenu = document.querySelector("#settings").querySelector(".sidebar").children;
      settingsmenu[0].style.display = "none";
      settingsmenu[1].style.display = "none";
      reloadCsvBtn.disabled = true;
      csvSourceLabel.textContent = "Loading sabanci_courses.csv from GitHub…";
      setCSVStatus("Fetching the latest version…", "loading");
      try {
        const separator = CSV_URL.includes("?") ? "&" : "?";
        const response = await fetch(
          `${CSV_URL}${separator}cacheBust=${Date.now()}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const csvText = await response.text();
        loadCSVText(csvText, "Using sabanci_courses.csv from GitHub");
      } catch (error) {
        console.error(error);
        csvSourceLabel.textContent = "GitHub CSV was not found";
        setCSVStatus(
          "Place sabanci_courses.csv beside index.html, then press Reload GitHub CSV. Manual upload still works.",
          "error"
        );
        scheduleWrap.innerHTML =
          `<div class="empty">Could not load sabanci_courses.csv from the website repository.</div>`;
      } finally {
        reloadCsvBtn.disabled = false;
      }
    }
  }

  function loadFile(file) {
    if (!file) return;

    if (!/\.csv$/i.test(file.name)) {
      alert("Please choose a CSV file.");
      return;
    }

    setCSVStatus(`Reading ${file.name}…`, "loading");

    const reader = new FileReader();
    reader.onerror = () => {
      setCSVStatus("The selected file could not be read.", "error");
    };

    reader.onload = () => {
      loadCSVText(reader.result, `Using manually selected file: ${file.name}`);
    };

    reader.readAsText(file, "UTF-8");
  }

  function detectDelimiter(text) {
    const first = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0] || "";
    const commas = (first.match(/,/g) || []).length;
    const semicolons = (first.match(/;/g) || []).length;
    return semicolons > commas ? ";" : ",";
  }

  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, "");
    const delimiter = detectDelimiter(text);
    const table = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < text.length; index++) {
      const character = text[index];

      if (quoted) {
        if (character === '"' && text[index + 1] === '"') {
          field += '"';
          index++;
        } else if (character === '"') {
          quoted = false;
        } else {
          field += character;
        }
      } else if (character === '"') {
        quoted = true;
      } else if (character === delimiter) {
        row.push(field);
        field = "";
      } else if (character === "\n") {
        row.push(field.replace(/\r$/, ""));
        table.push(row);
        row = [];
        field = "";
      } else {
        field += character;
      }
    }

    if (field.length || row.length) {
      row.push(field.replace(/\r$/, ""));
      table.push(row);
    }

    if (table.length < 2) return [];

    const headers = table[0].map(normalizeHeader);

    return table.slice(1)
      .filter(values => values.some(value => String(value).trim()))
      .map(values => {
        const object = {};
        headers.forEach((header, index) => {
          object[header] = (values[index] ?? "").trim();
        });
        return object;
      });
  }

  function normalizeHeader(header) {
    const normalized = String(header)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    const aliases = {
      crn: "crn",
      subject: "subject",
      course: "course",
      coursenumber: "course",
      section: "section",
      title: "title",
      credits: "credits",
      meetingtype: "meetingtype",
      type: "meetingtype",
      time: "time",
      days: "days",
      location: "location",
      where: "location",
      daterange: "daterange",
      scheduletype: "scheduletype",
      instructors: "instructors",
      instructor: "instructors"
    };

    return aliases[normalized] || normalized;
  }

  function groupRows(rows) {
    const map = new Map();

    rows.forEach(row => {
      const subject = (row.subject || "").toUpperCase();
      const course = row.course || "";
      const section = row.section || "";
      const crn = row.crn || "";
      const title = row.title || `${subject} ${course}`;
      const key = crn
        ? `CRN:${crn}`
        : `${subject}:${course}:${section}:${title}`;
      const creditsObj = {
        SU: row.credits,
        ECTS: {
          base: row.creditsects,
          eng: row.engnrects,
          bsc: row.basicects,
          exception: null,
        }
      }
      if (row.ectsexceptionadmitbefore.length > 0) {
        creditsObj.ECTS.exception = {
          admit: row.ectsexceptionadmitbefore,
          base: row.ectsexception,
          eng: row.ectsexceptionengnr,
          bsc: row.ectsexceptionbasic
        }
      }
      if (!map.has(key)) {
        map.set(key, {
          key,
          subject,
          course,
          section,
          crn,
          title,
          credits: creditsObj,
          instructors: new Set(),
          meetings: []
        });
      }

      const group = map.get(key);

      if (!group.credits && row.credits) group.credits = row.credits;
      if (row.instructors) group.instructors.add(row.instructors);

      const meeting = parseMeeting(row);
      if (meeting) group.meetings.push(meeting);
    });

    return [...map.values()]
      .map(group => ({
        ...group,
        instructors: [...group.instructors]
      }))
      .sort((first, second) =>
        `${first.subject} ${first.course} ${first.section}`.localeCompare(
          `${second.subject} ${second.course} ${second.section}`,
          undefined,
          { numeric: true }
        )
      );
  }

  function canonicalCourseNumber(section) {
    const raw = String(section.course || "")
      .toUpperCase()
      .replace(/\s+/g, "")
      .trim();

    if (!raw) return "";

    if (isLabOrRecitation(section)) {
      const numericBase = raw.match(/^(\d+)/);
      if (numericBase) return numericBase[1];

      return raw.replace(
        /(?:[-_]?(?:LABORATORY|LAB|DISCUSSION|DISC|DIS|RECITATION|RECIT|REC|TUTORIAL|TUT|L|R|D))\d*$/i,
        ""
      ) || raw;
    }

    return raw;
  }

  function cleanCourseTitle(title) {
    const cleaned = String(title || "")
      .replace(
        /\s*[-–—:()]?\s*\b(?:laboratory|lab|discussion|disc|recitation|recit|tutorial)\b.*$/i,
        ""
      )
      .replace(/\s+/g, " ")
      .trim();

    return cleaned || String(title || "").trim();
  }

  function groupCourses(sections) {
    const map = new Map();

    sections.forEach(section => {
      const normalizedSubject = String(section.subject || "")
        .toUpperCase()
        .replace(/\s+/g, "")
        .trim();
      const normalizedCourse = canonicalCourseNumber(section);
      const key = `${normalizedSubject}:${normalizedCourse}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          subject: normalizedSubject || section.subject,
          course: normalizedCourse || section.course,
          title: "",
          sections: []
        });
      }

      map.get(key).sections.push(section);
    });

    return [...map.values()]
      .map(course => {
        const mainSections = course.sections
          .filter(section => !isLabOrRecitation(section))
          .sort((first, second) =>
            String(first.section).localeCompare(
              String(second.section),
              undefined,
              { numeric: true }
            )
          );

        const auxiliarySections = course.sections
          .filter(isLabOrRecitation)
          .sort((first, second) => {
            const typeComparison = auxiliaryLabel(first).localeCompare(
              auxiliaryLabel(second)
            );

            if (typeComparison) return typeComparison;

            return String(first.section).localeCompare(
              String(second.section),
              undefined,
              { numeric: true }
            );
          });

        const preferredSection = mainSections[0] || auxiliarySections[0];
        const creditSource = [...mainSections, ...auxiliarySections]
          .find(section => numericCredits(section.credits.SU) !== null);
        const preferredTitle = mainSections
          .map(section => cleanCourseTitle(section.title))
          .find(Boolean) ||
          auxiliarySections
            .map(section => cleanCourseTitle(section.title))
            .find(Boolean) ||
          preferredSection?.title ||
          `${course.subject} ${course.course}`;
        creditSource.credits.SU = parseInt(creditSource.credits.SU);
        creditSource.credits.ECTS.base = parseInt(creditSource.credits.ECTS.base);
        if (creditSource.credits.ECTS.eng) creditSource.credits.ECTS.eng = parseInt(creditSource.credits.ECTS.eng);
        if (creditSource.credits.ECTS.bsc) creditSource.credits.ECTS.bsc = parseInt(creditSource.credits.ECTS.bsc);
        if (creditSource.credits.ECTS.exception) {
          creditSource.credits.ECTS.exception.admit = parseInt(creditSource.credits.ECTS.exception.admit);
          creditSource.credits.ECTS.exception.base = parseInt(creditSource.credits.ECTS.exception.base);
          if (creditSource.credits.ECTS.exception.eng) creditSource.credits.ECTS.exception.eng = parseInt(creditSource.credits.ECTS.exception.eng);
          if (creditSource.credits.ECTS.exception.bsc) creditSource.credits.ECTS.exception.bsc = parseInt(creditSource.credits.ECTS.exception.bsc);
        }
        return {
          ...course,
          course: preferredSection
            ? canonicalCourseNumber(preferredSection)
            : course.course,
          title: preferredTitle,
          credits: creditSource ? creditSource.credits : null,
          mainSections,
          auxiliarySections,
          sections: [...mainSections, ...auxiliarySections]
        };
      })
      .sort((first, second) =>
        `${first.subject} ${first.course}`.localeCompare(
          `${second.subject} ${second.course}`,
          undefined,
          { numeric: true }
        )
      );
  }

  function parseMeeting(row) {
    const range = parseTimeRange(row.time || "");
    const days = parseDays(row.days || "");
    const location = parseLocation(row.location || "");

    if (!range || !days.length) return null;

    return {
      start: range[0],
      end: range[1],
      days,
      timeText: row.time || "",
      location: location || "",
      type: row.meetingtype || "",
      instructor: row.instructors || ""
    };
  }

  function parseTimeRange(value) {
    const text = String(value)
      .trim()
      .toLowerCase()
      .replace(/\./g, "");

    if (!text || /tba|arranged/.test(text)) return null;

    const matches = [...text.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/g)];
    if (matches.length < 2) return null;

    const minutes = matches.slice(0, 2).map(match => {
      let hour = Number(match[1]);
      const minute = Number(match[2] || 0);
      const period = match[3];

      if (period === "pm" && hour !== 12) hour += 12;
      if (period === "am" && hour === 12) hour = 0;

      return hour * 60 + minute;
    });

    if (!matches[0][3] && matches[1][3]) {
      const endingPeriod = matches[1][3];
      let startingHour = Number(matches[0][1]);
      const startingMinute = Number(matches[0][2] || 0);

      if (endingPeriod === "pm" && startingHour < 8) startingHour += 12;
      minutes[0] = startingHour * 60 + startingMinute;
    }

    return minutes[1] > minutes[0] ? minutes : null;
  }

  function parseLocation(value) {
    const text = String(value || "").trim();
    if (text.startsWith("Fac. of Engin. and Nat. Sci.")) return text.replace("Fac. of Engin. and Nat. Sci.", "FENS");
    else if (text.startsWith("Sabancı Business School")) return text.replace("Sabancı Business School", "FMAN");
    else if (text.startsWith("Fac.of Arts and Social Sci.")) return text.replace("Fac.of Arts and Social Sci.", "FASS");
    else if (text.startsWith("University Center")) return text.replace("University Center", "UC");
    else if (text.startsWith("Art and Research Center")) return text.replace("Art and Research Center", "SUSAM");
    else if (text.startsWith("TPHI Building CLAS")) return text.replace("TPHI Building CLAS", "TPHI CLASS"); //what is this?
  }

  function parseDays(value) {
    let text = String(value).trim();
    if (!text || /tba|arranged/i.test(text)) return [];

    const words = {
      monday: "M",
      mon: "M",
      pazartesi: "M",
      tuesday: "T",
      tue: "T",
      sali: "T",
      "salı": "T",
      wednesday: "W",
      wed: "W",
      carsamba: "W",
      "çarşamba": "W",
      thursday: "R",
      thu: "R",
      persembe: "R",
      "perşembe": "R",
      friday: "F",
      fri: "F",
      cuma: "F"
    };

    const lower = text.toLowerCase();
    const found = [];

    Object.entries(words).forEach(([word, code]) => {
      if (
        new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(lower) &&
        !found.includes(code)
      ) {
        found.push(code);
      }
    });

    if (found.length) {
      return DAYS.map(day => day.code).filter(code => found.includes(code));
    }

    text = text
      .toUpperCase()
      .replace(/TH/g, "R")
      .replace(/TU/g, "T")
      .replace(/[^MTWRF]/g, "");

    return [...new Set([...text])]
      .filter(code => DAYS.some(day => day.code === code));
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function sectionCategory(section) {
    const text = `${section.title || ""} ${section.section || ""} ${section.meetings
      .map(meeting => meeting.type || "")
      .join(" ")}`;

    if (/\blab|laboratory\b/i.test(text)) return "lab";
    if (/\bdiscussion|disc\b/i.test(text)) return "discussion";
    if (/\brecitation|recit\b/i.test(text)) return "recitation";
    if (/\btutorial\b/i.test(text)) return "tutorial";
    return "lecture";
  }

  function isLabOrRecitation(section) {
    return sectionCategory(section) !== "lecture";
  }

  function numericCredits(value) {
    const match = String(value || "")
      .replace(",", ".")
      .match(/\d+(?:\.\d+)?/);

    return match ? Number(match[0]) : null;
  }

  function formatCredits(value) {
    if (value === null || !Number.isFinite(value)) return "?";
    return Number.isInteger(value)
      ? String(value)
      : String(Number(value.toFixed(2)));
  }

  function populateFilters() {
    const creditValues = [...new Set(
      state.courses
        .map(course => numericCredits(course.credits))
        .filter(value => value !== null)
    )].sort((first, second) => first - second);

    creditFilter.innerHTML =
      `<option value="">All credits</option>` +
      creditValues.map(value =>
        `<option value="${value}">${esc(formatCredits(value))} credit${value === 1 ? "" : "s"}</option>`
      ).join("") +
      `<option value="unknown">Unknown credits</option>`;
  }

  function courseForSection(section) {
    return state.courses.find(course =>
      course.sections.some(candidate => candidate.key === section.key)
    ) || null;
  }

  function clearCourseSelection(courseKey) {
    const course = state.courses.find(item => item.key === courseKey);
    if (!course) return;

    course.sections.forEach(section => state.selected.delete(section.key));
    autosaveCurrentSelection();
    renderAll();
  }

  function openCourseInList(courseKey) {
    const course = state.courses.find(item => item.key === courseKey);
    if (!course) return;

    search.value = "";
    creditFilter.value = "";
    fitFilter.value = "";
    state.expandedCourses.clear();
    state.expandedCourses.add(courseKey);
    renderCourseList();

    requestAnimationFrame(() => {
      const details = [...courseList.querySelectorAll(".course-group")]
        .find(item => item.dataset.courseKey === courseKey);

      if (details) {
        details.open = true;
        details.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  function renderAll() {
    renderCourseList();
    renderSelectedSummary();
    renderSchedule();
  }

  function auxiliaryKind(section) {
    return sectionCategory(section);
  }

  function categoryFeasibility(sections) {
    if (!sections.length) return null;

    const results = sections.map(section => evaluateSectionFit(section));
    const fittingCount = results.filter(result => result.kind === "ok").length;
    const unknownCount = results.filter(result => result.kind === "unknown").length;

    if (fittingCount > 0) {
      return {
        kind: "ok",
        fittingCount,
        total: sections.length
      };
    }

    if (unknownCount > 0) {
      return {
        kind: "unknown",
        fittingCount: 0,
        total: sections.length
      };
    }

    return {
      kind: "bad",
      fittingCount: 0,
      total: sections.length
    };
  }

  function courseFitSummary(course) {
    const categories = [];

    const lectureResult = categoryFeasibility(course.mainSections);
    if (lectureResult) {
      categories.push({
        label: "lecture",
        ...lectureResult
      });
    }

    const labs = course.auxiliarySections.filter(
      section => auxiliaryKind(section) === "lab"
    );
    const discussions = course.auxiliarySections.filter(
      section => auxiliaryKind(section) === "discussion"
    );
    const recitations = course.auxiliarySections.filter(
      section => auxiliaryKind(section) === "recitation"
    );
    const tutorials = course.auxiliarySections.filter(
      section => auxiliaryKind(section) === "tutorial"
    );

    [
      ["lab", labs],
      ["discussion", discussions],
      ["recitation", recitations],
      ["tutorial", tutorials]
    ].forEach(([label, sections]) => {
      const result = categoryFeasibility(sections);
      if (result) categories.push({ label, ...result });
    });

    return categories;
  }

  function overallCourseFit(course) {
    const categories = courseFitSummary(course);

    if (!categories.length) return "unknown";

    const hasBad = categories.some(category => category.kind === "bad");
    const hasUnknown = categories.some(category => category.kind === "unknown");
    const hasGood = categories.some(category => category.kind === "ok");

    if (!hasBad && !hasUnknown) return "fits";
    if (hasBad && hasGood) return "partial";
    if (hasUnknown && !hasBad) return "unknown";
    if (hasUnknown && hasGood) return "partial";
    return "nofit";
  }

  function renderCourseMajorRequirementSummary(course) {
    if (registeredMajors.level === null) {
      return "";
    }
    const majorReqs = (() => {
      const currentReqs = {};
      Object.keys(majorRequirements).forEach(major => {
        if (Object.keys(majorRequirements[major].result).includes(course.key.replaceAll(":", " "))) {
          currentReqs[major] = majorRequirements[major].result[course.key.replaceAll(":", " ")];
        }
      });
      return currentReqs;
    })();
    if (!Object.keys(majorReqs).length) return "<div class='course-fit-summary'><span class='course-major-pill useless'>No progress upon completion</span></div>";
    return '<div class="course-fit-summary">' + Object.keys(majorReqs).map((major) => {
      let facultyAddition = "";
      if (majorReqs[major].includes(":")) {
        const faculty = (() => {
          const text = esc(majorReqs[major].split(":")[1]);
          if (text === "E") return "FENS";
          else if (text === "M") return "FMAN";
          else if (text === "A") return "FASS";
          return text;
        })();
        facultyAddition = '<span class="course-major-pill faculty">' + faculty + ' Faculty Course</span>';
        majorReqs[major] = majorReqs[major].split(":")[0];
      }
      let differentMajor = "";
      if (major.endsWith("-MINOR")) {
        differentMajor = major.replace("-MINOR", "") + ": ";
      }
      else if (major.endsWith("-DM")) {
        differentMajor = major.replace("-DM", "").substring(2) + ": ";
      }
      else if (Object.keys(majorReqs).length > 1) {
        differentMajor = major.substring(2) + ": ";
        if (major === "BSMS") differentMajor = "IE: ";
      }
      return '<span class="course-major-pill ' + esc(majorReqs[major].substring(0, 1)) + '">' + differentMajor + esc(majorReqs[major].substring(1)) + '</span>' + facultyAddition;
    }).join('') + '</div>';
  }

  function renderCourseCreditsSummary(course) {
    let creditsText = `<div class="course-fit-summary"><span class="course-credits-pill">${course.credits.SU} credits</span><span class="course-credits-pill ects">${course.credits.ECTS.base} ECTS</span>`;
    if (course.credits.ECTS.bsc && course.credits.ECTS.bsc > 0) {
      creditsText += `<span class="course-credits-pill basic">${course.credits.ECTS.bsc} Basic</span>`;
    }
    return creditsText + '</div>';
  }

  function renderCourseFitSummary(course) {
    const categories = courseFitSummary(course);
    if (!categories.length) return "";

    return `<div class="course-fit-summary">${categories.map(category => {
      let text;

      if (category.kind === "ok") {
        text = `${category.fittingCount}/${category.total} ${category.label} fit`;
      } else if (category.kind === "unknown") {
        text = `${category.label} fit unknown`;
      } else {
        text = `No ${category.label} fits`;
      }

      return `<span class="course-fit-pill ${category.kind}">${esc(text)}</span>`;
    }).join("")}</div>`;
  }

  function categoryDisplayName(category) {
    const labels = {
      lecture: "Lecture sections",
      discussion: "Discussion sections",
      recitation: "Recitation sections",
      lab: "Lab sections",
      tutorial: "Tutorial sections"
    };

    return labels[category] || "Sections";
  }

  function groupedSectionCategories(course) {
    const order = ["lecture", "discussion", "recitation", "lab", "tutorial"];

    return order
      .map(category => ({
        category,
        sections: course.sections.filter(
          section => sectionCategory(section) === category
        )
      }))
      .filter(group => group.sections.length);
  }

  function selectSectionExclusively(sectionKey) {
    const section = state.sections.find(item => item.key === sectionKey);
    if (!section) return;

    const course = state.courses.find(item =>
      item.sections.some(candidate => candidate.key === sectionKey)
    );
    if (!course) return;

    const category = sectionCategory(section);

    course.sections.forEach(candidate => {
      if (sectionCategory(candidate) === category) {
        state.selected.delete(candidate.key);
      }
    });

    state.selected.add(sectionKey);
  }

  function normalizeExclusiveSelection(keys) {
    state.selected.clear();

    keys.forEach(key => {
      if (state.sections.some(section => section.key === key)) {
        selectSectionExclusively(key);
      }
    });
  }

  function renderCourseList() {
    const query = search.value.trim().toLowerCase();
    const compactQuery = query.replace(/[^a-z0-9]/g, "");
    const searchField = searchFieldFilter.value;
    const credit = creditFilter.value;
    const fitStatus = fitFilter.value;

    state.filteredCourses = state.courses.filter(course => {
      const courseCredit = numericCredits(course.credits);
      const matchesCredit =
        !credit ||
        (credit === "unknown"
          ? courseCredit === null
          : courseCredit === Number(credit));

      const searchValues = {
        coursecode: [
          `${course.subject || ""} ${course.course || ""}`,
          `${course.subject || ""}${course.course || ""}`
        ],
        instructor: course.sections.flatMap(section => section.instructors || [])
      };

      const searchable = (searchValues[searchField] || [])
        .join(" ")
        .toLowerCase();
      const compactSearchable = searchable.replace(/[^a-z0-9]/g, "");
      const matchesQuery =
        !query ||
        searchable.includes(query) ||
        (compactQuery && compactSearchable.includes(compactQuery));

      const courseFit = overallCourseFit(course);
      const matchesFit =
        !fitStatus ||
        courseFit === fitStatus;

      return (
        matchesCredit &&
        matchesFit &&
        matchesQuery
      );
    });

    const selectedSections = state.selected.size;
    stats.textContent =
      `${state.courses.length} courses · ${state.sections.length} sections · ` +
      `${selectedSections} selected · ${state.filteredCourses.length} visible`;

    if (!state.filteredCourses.length) {
      courseList.innerHTML = `<div class="empty">No matching course found.</div>`;
      return;
    }

    courseList.innerHTML = state.filteredCourses.map(course => {
      const selectedCount = course.sections.filter(section =>
        state.selected.has(section.key)
      ).length;
      const categoryGroups = groupedSectionCategories(course);
      const countParts = categoryGroups.map(group => {
        const label = group.category === "recitation"
          ? "recit"
          : group.category;

        return `${group.sections.length} ${label}${group.sections.length === 1 ? "" : "s"}`;
      });

      const auxiliaryCount = course.sections.filter(
        section => sectionCategory(section) !== "lecture"
      ).length;
      const open = state.expandedCourses.has(course.key) ? " open" : "";

      return `<details class="course-group" data-course-key="${esc(course.key)}"${open}>
        <summary>
          <div class="course-heading">
            <div class="course-code">${esc(course.subject)} ${esc(course.course)}</div>
            <div class="course-name">${esc(course.title)}</div>
            <div>
              ${selectedCount
          ? `<span class="badge selected">${selectedCount} selected</span>`
          : ""}
              
            </div>
          </div>
          <div class="course-summary-side">
            ${renderCourseMajorRequirementSummary(course)}
            ${renderCourseCreditsSummary(course)}
            ${renderCourseFitSummary(course)}
            <div class="expand-label">Select sections</div>
          </div>
        </summary>

        <div class="section-list">
          ${categoryGroups.map(group => `
            <div class="${group.category === "lecture" ? "" : "auxiliary-group"}">
              <div class="${group.category === "lecture" ? "lecture-heading" : "auxiliary-heading"}">
                ${esc(categoryDisplayName(group.category))}
                <span style="font-weight:500;text-transform:none;letter-spacing:0">
                  · choose one
                </span>
              </div>
              <div class="${group.category === "lecture" ? "" : "auxiliary-options"}">
                ${group.sections.map(section =>
            renderSectionOption(section, group.category !== "lecture")
          ).join("")}
              </div>
            </div>
          `).join("")}

          ${!categoryGroups.length
          ? `<div class="selected-summary-empty">No selectable sections found.</div>`
          : ""}
        </div>
      </details>`;
    }).join("");

    courseList.querySelectorAll(".course-group").forEach(details => {
      details.addEventListener("toggle", () => {
        const key = details.dataset.courseKey;

        if (details.open) {
          state.expandedCourses.clear();
          state.expandedCourses.add(key);

          courseList.querySelectorAll(".course-group").forEach(other => {
            if (other !== details && other.open) other.open = false;
          });
        } else {
          state.expandedCourses.delete(key);
        }
      });
    });

    courseList.querySelectorAll("input[data-section-key]").forEach(checkbox => {
      checkbox.addEventListener("change", () => {
        const key = checkbox.dataset.sectionKey;

        if (checkbox.checked) {
          selectSectionExclusively(key);
        } else {
          state.selected.delete(key);
        }

        autosaveCurrentSelection();
        renderAll();
      });
    });
  }

  function renderSectionOption(section, compact = false) {
    const checked = state.selected.has(section.key);
    const issue = findIssue(section);
    const auxiliary = isLabOrRecitation(section);
    const meetings = section.meetings.length
      ? section.meetings.map(meeting =>
        `${meeting.days.map(d => d === "M" ? "Monday" : d === "T" ? "Tuesday" : d === "W" ? "Wednesday" : d === "R" ? "Thursday" : d === "F" ? "Friday" : d === "S" ? "Saturday" : d).join("")} · ${formatMinutes(meeting.start)}–${formatMinutes(meeting.end)}` +
        `${meeting.location ? " · " + meeting.location : ""}`
      ).join("<br>")
      : section.bypass ? "No lectures will be conducted" : "Time not announced";

    let optionClass = "section-option" + (compact ? " compact" : "");
    if (checked) optionClass += " selected-section";
    if (issue && issue.kind === "bad") optionClass += " conflicting-section";

    const fitLabel = checked
      ? (issue && issue.kind === "bad" ? "Selected · " + issue.label : "Selected")
      : issue ? issue.label : "";

    return `<label class="${optionClass}">
      <input
        type="checkbox"
        data-section-key="${esc(section.key)}"
        ${checked ? "checked" : ""}
      >
      <span class="section-main">
        <span class="section-top">
          <span>
            <span class="section-title">Section ${esc(section.section || "?")}</span>
            ${auxiliary ? `<span class="badge aux">${esc(auxiliaryLabel(section))}</span>` : ""}
          </span>
          <span class="fit-status ${issue ? issue.kind : "ok"}">${esc(fitLabel)}</span>
        </span>

        <span class="section-meta">
          ${meetings}
          ${section.instructors.length ? `<br>${esc(section.instructors.map(s => s.replaceAll(" (P)", "").trim()).join(", "))}` : ""}
        </span>

        ${issue && issue.detail
        ? `<div class="fit-detail ${issue.kind}">${esc(issue.detail)}</div>`
        : ""}
      </span>
    </label>`;
  }
  function selectedCRNs() {
    return [...new Set(
      state.sections
        .filter(section => state.selected.has(section.key))
        .map(section => String(section.crn || "").trim())
        .filter(crn => /^\d+$/.test(crn))
    )];
  }
  function auxiliaryLabel(section) {
    const kind = auxiliaryKind(section);
    if (kind === "lab") return "Lab";
    if (kind === "discussion") return "Discussion";
    if (kind === "tutorial") return "Tutorial";
    return "Recitation";
  }

  function evaluateSectionFit(section) {
    if (!section.meetings.length) {
      return {
        kind: "unknown",
        label: "Fit unknown",
        detail: "No meeting time is available."
      };
    }

    const outsideGrid = section.meetings.some(meeting =>
      meeting.start < START_MIN || meeting.end > END_MIN
    );

    const otherSelected = state.sections.filter(other =>
      other.key !== section.key && state.selected.has(other.key)
    );

    const conflictingSections = conflictingWith(section, otherSelected);

    if (conflictingSections.length) {
      const names = conflictingSections
        .map(other => `${other.subject} ${other.course}-${other.section}`)
        .join(", ");

      return {
        kind: "bad",
        label: "Time Conflict",
        detail: `Conflicts with ${names}.`
      };
    }

    if (outsideGrid) {
      return {
        kind: "unknown",
        label: "Outside grid",
        detail: "Part of this section is outside 08:40–19:30."
      };
    }

    return {
      kind: "ok",
      label: "Fits",
      detail: "No conflict with the currently selected program."
    };
  }

  function conflictingWith(section, candidates) {
    return candidates.filter(candidate =>
      section.meetings.some(first =>
        candidate.meetings.some(second =>
          meetingsOverlap(first, second)
        )
      )
    );
  }

  function meetingsOverlap(first, second) {
    const sameDay = first.days.some(day => second.days.includes(day));
    return sameDay && first.start < second.end && second.start < first.end;
  }

  function renderSelectedSummary() {
    const selectedSections = state.sections.filter(section =>
      state.selected.has(section.key)
    );

    const excludedCount = selectedSections.filter(isLabOrRecitation).length;
    const mainSections = selectedSections.filter(section =>
      !isLabOrRecitation(section)
    );
    const uniqueCourses = new Map();

    mainSections.forEach(section => {
      const courseKey = `${section.subject}:${section.course}`;

      if (!uniqueCourses.has(courseKey)) {
        uniqueCourses.set(courseKey, {
          subject: section.subject,
          course: section.course,
          title: section.title,
          credits: numericCredits(section.credits),
          sections: new Set()
        });
      }

      const course = uniqueCourses.get(courseKey);

      if (section.section) course.sections.add(section.section);
      if (course.credits === null) {
        course.credits = numericCredits(section.credits);
      }
    });

    const courses = [...uniqueCourses.values()].sort((first, second) =>
      `${first.subject} ${first.course}`.localeCompare(
        `${second.subject} ${second.course}`,
        undefined,
        { numeric: true }
      )
    );

    const knownTotal = courses.reduce(
      (sum, course) => sum + (course.credits ?? 0),
      0
    );
    const unknownCount = courses.filter(course => course.credits === null).length;
    const totalText =
      `${formatCredits(knownTotal)} credits` +
      (unknownCount ? ` + ${unknownCount} unknown` : "");

    selectedSummaryLabel.textContent =
      `Selected courses (${courses.length}) · ${totalText}`;

    if (!courses.length) {
      selectedSummaryList.innerHTML =
        `<div class="selected-summary-empty">No main courses selected.` +
        `${excludedCount ? ` ${excludedCount} discussion/lab/recitation/tutorial selection(s) are excluded.` : ""}` +
        `</div>`;
      return;
    }

    selectedSummaryList.innerHTML =
      courses.map(course => {
        const sections = [...course.sections].sort((first, second) =>
          first.localeCompare(second, undefined, { numeric: true })
        );

        const courseKey = `${course.subject}:${course.course}`;

        return `<div class="selected-summary-item">
          <div>
            <div class="selected-summary-code">${esc(course.subject)} ${esc(course.course)}</div>
            <div class="selected-summary-name">${esc(course.title)}</div>
            ${sections.length
            ? `<div class="selected-summary-note">Section${sections.length > 1 ? "s" : ""}: ${esc(sections.join(", "))}</div>`
            : ""}
          </div>
          <div class="selected-summary-actions">
            <div class="selected-summary-credit">${esc(formatCredits(course.credits))} credits</div>
            <button
              type="button"
              class="remove-course-btn"
              data-remove-course="${esc(courseKey)}"
              title="Remove this course"
              aria-label="Remove ${esc(course.subject)} ${esc(course.course)}"
            >&times;</button>
          </div>
        </div>`;
      }).join("") +
      (excludedCount
        ? `<div class="selected-summary-note" style="padding:8px 0">` +
        `${excludedCount} selected discussion/lab/recitation/tutorial section(s) excluded from the course count and credit total.` +
        `</div>`
        : "");

    selectedSummaryList.querySelectorAll("[data-remove-course]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        clearCourseSelection(button.dataset.removeCourse);
      });
    });
  }

  function resizeSchedule() {
    // const schedule = scheduleWrap.querySelector(".schedule");
    // if (!schedule) return;
    // const height = schedule.parentElement.getBoundingClientRect().height - 42;
    // const times = Array.from(schedule.querySelector(".time-col").children);
    // const heightPerSlot = times.length ? (height / times.length) : 64;
    // schedule.style.setProperty("--slot-height", `${heightPerSlot}px`);
  }
  window.addEventListener("resize", resizeSchedule);

  function createWarning(text, courseKey = null) {
    const warning = document.createElement("div");
    warning.textContent = text;
    conflictNote.classList.add("conflict-note");
    warning.addEventListener("click", () => {
      if (courseKey) openCourseInList(courseKey);
    });
    conflictNote.appendChild(warning);
  }

  function renderSchedule() {
    const chosen = state.sections.filter(section =>
      state.selected.has(section.key)
    );
    const conflicts = findConflicts(chosen);

    if (!chosen.length) {
      scheduleWrap.innerHTML =
        `<div class="empty">Expand a course and select a section from the left.</div>`;
      conflictNote.className = "conflict-note";
      return;
    }
    conflictNote.innerHTML = '';
    conflictNote.className = "conflict-note";
    if (conflicts.sectionKeys.size) {
      createWarning(`${conflicts.sectionKeys.size} selected section(s) are involved in a time conflict. ` +
        `Conflicting blocks are outlined in red.`);
    }

    const otherIssues = findIssues(chosen);
    if (otherIssues.length) {
      console.log(otherIssues);
      otherIssues.map(x => [x.section.subject + " " + x.section.course + "-" + x.section.section + ": " + x.header, x.key]).forEach(x => createWarning(x[0], x[1]));
    }

    const gridHeight = minutesToPixels(END_MIN - START_MIN);

    let html = `<div class="schedule">
      <div class="time-head">Time</div>
      ${DAYS.map(day => `<div class="day-head">${day.name}</div>`).join("")}
      <div class="time-col">
        ${timeLabels()}
        <div class="time-label">${formatMinutes(END_MIN)}</div>
      </div>`;

    DAYS.forEach(day => {
      html += `<div class="day-col">`;

      chosen.forEach(section => {
        section.meetings.forEach((meeting, meetingIndex) => {
          if (!meeting.days.includes(day.code)) return;

          const visibleStart = Math.max(meeting.start, START_MIN);
          const visibleEnd = Math.min(meeting.end, END_MIN);

          if (visibleEnd <= START_MIN || visibleStart >= END_MIN) return;

          const top = minutesToSlots(visibleStart - START_MIN);
          const height = minutesToSlots(visibleEnd - visibleStart);
          const eventId = `${section.key}|${day.code}|${meetingIndex}`;
          const conflictClass = conflicts.eventIds.has(eventId)
            ? " conflict"
            : "";

          const parentCourse = courseForSection(section);
          const parentCourseKey = parentCourse?.key || `${section.subject}:${canonicalCourseNumber(section)}`;

          html += `<div
            class="event${conflictClass}"
            data-course-key="${esc(parentCourseKey)}"
            data-section-key="${esc(section.key)}"
            tabindex="0"
            role="button"
            style="--row:${top};--duration:${height};background:${colorFor(`${section.subject}:${section.course}`)}"
            title="${esc(`${section.subject} ${section.course}-${section.section} · ${formatMinutes(meeting.start)}–${formatMinutes(meeting.end)} · Click to open course`)}"
          >
            <strong>${esc(section.subject)} ${esc(section.course)}-${esc(section.section)}</strong>
            ${meeting.location ? `${esc(meeting.location)}` : ""}
            <br>${esc(formatMinutes(meeting.start))}–${esc(formatMinutes(meeting.end))}
          </div>`;
        });
      });

      html += `</div>`;
    });

    html += `</div>`;
    scheduleWrap.innerHTML = '<div>' + html + '</div>';

    scheduleWrap.querySelectorAll(".event[data-course-key]").forEach(eventBlock => {
      const openMatchingCourse = () => {
        openCourseInList(eventBlock.dataset.courseKey);
      };

      eventBlock.addEventListener("click", openMatchingCourse);
      eventBlock.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openMatchingCourse();
        }
      });
    });
    resizeSchedule();
  }
  function findIssue(section, notimeconflicts) {
    const parentCourse = courseForSection(section);
    // Check for sections that are only for bypassed students (exempt from the course)
    if (section.subject === "MATH" && section.course === "101" && section.section === "X") section.bypass = true;
    if (section.subject === "IF" && section.course === "100" && section.section === "X") section.bypass = true;
    if (section.bypass) {
      return {
        key: parentCourse.key,
        kind: "bad",
        label: "Unavailable",
        detail: "This section is only for students who passed the exam to be exempt from this course.",
        header: "The section you selected is only available for students who are exempt from this course and registration for that section will be done by Foundations Development Directorate."
      }
    }

    // Courses that are restricted to the same section for main and aux sections
    const samesection = ["SPS 101", "SPS 102", "SPS 303", "ECON 201"];
    if (samesection.includes(section.subject + " " + section.course.substring(0, 3))) {
      const selected = selectedCRNs()
      if (parentCourse.mainSections.map(x => x.crn).includes(section.crn)) {
        // This is the main section, check if the user has selected any aux
        const chosenAux = parentCourse.auxiliarySections.find(x => selected.includes(x.crn));
        if (chosenAux) {
          if (!chosenAux.section.startsWith(section.section)) {
            const lastLetter = chosenAux.course.substring(chosenAux.course.length - 1);
            return {
              key: parentCourse.key,
              kind: "bad",
              label: "Section Restricted",
              detail: "Section not available when" + (lastLetter === "L" ? " lab" : lastLetter === "R" ? " recitation" : lastLetter === "D" ? " discussion" : "") + " section " + chosenAux.section + " is selected.",
              header: (lastLetter === "L" ? "Lab" : lastLetter === "R" ? "Recitation" : lastLetter === "D" ? "Discussion" : "Corequisite") + " section " + chosenAux.section + " is not compatible with this section."
            }
          }
        }
      }
      else {
        // This is not the main section, check if the user has selected any mains
        const chosenMain = parentCourse.mainSections.find(x => selected.includes(x.crn));
        if (chosenMain) {
          if (!section.section.startsWith(chosenMain.section)) {
            return {
              key: parentCourse.key,
              kind: "bad",
              label: "Section Restricted",
              detail: "Section not available when lecture section " + chosenMain.section + " is selected.",
              header: "Lecture section " + chosenMain.section + " is not compatible with this section."
            }
          }
        }
      }
    }

    // Check for time conflicts
    if (notimeconflicts) return null;
    const fit = evaluateSectionFit(section);
    if (fit.kind === "bad" || fit.kind === "unknown") {
      return {
        kind: fit.kind,
        label: fit.label,
        detail: fit.detail
      }
    }
    return null;
  }
  function findIssues(sections) {
    const issues = [];
    sections.forEach(section => {
      const issue = findIssue(section, true);
      if (issue) issues.push({ section: section, ...issue });
    })
    return issues;
  }
  function findConflicts(sections) {
    const eventIds = new Set();
    const sectionKeys = new Set();

    DAYS.forEach(day => {
      const events = [];

      sections.forEach(section => {
        section.meetings.forEach((meeting, meetingIndex) => {
          if (meeting.days.includes(day.code)) {
            events.push({
              section,
              meeting,
              id: `${section.key}|${day.code}|${meetingIndex}`
            });
          }
        });
      });

      for (let firstIndex = 0; firstIndex < events.length; firstIndex++) {
        for (
          let secondIndex = firstIndex + 1;
          secondIndex < events.length;
          secondIndex++
        ) {
          const first = events[firstIndex];
          const second = events[secondIndex];

          if (
            first.section.key !== second.section.key &&
            first.meeting.start < second.meeting.end &&
            second.meeting.start < first.meeting.end
          ) {
            eventIds.add(first.id);
            eventIds.add(second.id);
            sectionKeys.add(first.section.key);
            sectionKeys.add(second.section.key);
          }
        }
      }
    });

    return { eventIds, sectionKeys };
  }

  function timeLabels() {
    let html = "";
    let current = START_MIN;

    while (current < END_MIN) {
      const next = Math.min(current + 60, END_MIN);
      const height = minutesToPixels(next - current);

      html += `<div class="time-label">${formatMinutes(current)}</div>`;
      current = next;
    }

    return html;
  }

  function minutesToPixels(minutes) {
    return Math.ceil(minutes / 60) * SLOT_HEIGHT;
  }
  function minutesToSlots(minutes) {
    return Math.ceil(minutes / 60);
  }

  function formatMinutes(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:` +
      `${String(minutes % 60).padStart(2, "0")}`;
  }

  function colorFor(key) {
    let hash = 0;

    for (let index = 0; index < key.length; index++) {
      hash = ((hash << 5) - hash) + key.charCodeAt(index);
    }

    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 78% 84%)`;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }
  function commitInlineRename() {
    const slots = readSaveSlots();
    const slot = currentSlot(slots);

    if (!slot) {
      renameSlotInput.hidden = true;
      return;
    }

    const newName = sanitizeSlotName(
      renameSlotInput.value,
      slot.name
    );

    slot.name = newName;

    writeSaveSlots(slots);

    refreshSaveSlotUI(slot.id);

    setSaveStatus("Renamed");
  }
  renameSaveSlotBtn.addEventListener(
    "click",
    event => {
      event.preventDefault();
      event.stopPropagation();

      const slot = currentSlot();

      if (!slot) return;

      renameSlotInput.value = slot.name;
      renameSlotInput.hidden = false;
      renameSlotInput.disabled = false;

      renameSlotInput.focus();
      renameSlotInput.select();
    }
  );
  renameSlotInput.addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();

        commitInlineRename();

        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();

        renameSlotInput.hidden = true;
      }
    }
  );
  renameSlotInput.addEventListener(
    "blur",
    () => {
      if (!renameSlotInput.hidden) {
        commitInlineRename();
      }
    }
  );
  window.suDesktop?.onMessageFromMain("session-attempts", (data) => {
    console.log(Object.keys(data.attempts).length);
    const attemptsDiv = document.querySelector("#attemptsdiv");
    if (attemptsDiv) {
      const container = attemptsDiv.querySelector("#attemptscontainer");
      attemptsDiv.style.display = "block";
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
  window.suDesktop?.onMessageFromMain("login-details", (data) => {
    console.log(data);
    if (data.signedin && data.status === "active") {
      usermenubutton.querySelector("span").textContent = data.user.name;
      usermenubutton.querySelector("div").style.backgroundImage = `url(${data.user.image})`;
      registeredSchedule = data.user.schedule;
      usermenubutton.style.display = "flex";
      signinbutton.style.display = "none";
    }
    else {
      signinbutton.style.display = "block";
      usermenubutton.style.display = "none";
    }
  });
  loadCSVFromGitHub();
})();
