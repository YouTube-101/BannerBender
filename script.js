(() => {
  "use strict";

  const BANNER_BASE = "https://suis.sabanciuniv.edu/prod";
  const START_MIN = 8 * 60 + 40;
  const END_MIN = 19 * 60 + 30;
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
    selected: new Set(),
    filteredCourses: [],
    expandedCourses: new Set()
  };

  const $ = id => document.getElementById(id);
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
  const bannerConfirmDialog = $("bannerConfirmDialog");
  const bannerCrnPreview = $("bannerCrnPreview");
  const cancelBannerSendBtn = $("cancelBannerSendBtn");
  const confirmBannerSendBtn = $("confirmBannerSendBtn");
  let registeredSchedule = [];
  let pendingBannerUrl = "";

  search.addEventListener("input", renderCourseList);
  searchFieldFilter.addEventListener("change", () => {
    const placeholders = {
      coursecode: "Search course code, e.g. CS 204...",
      instructor: "Search instructor name...",
      crn: "Search CRN..."
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

  $("settings").loadSetting = (index) => {
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
  }
  Array.from($("settings").querySelector(".sidebar").children).forEach((button, index) => {
    button.addEventListener("click", event => {
      $("settings").loadSetting(index);
    });
  });
  $("settings").initialize = () => {
    $("settings").loadSetting(0);
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

  cancelBannerSendBtn.addEventListener("click", () => {
    pendingBannerUrl = "";
    bannerConfirmDialog.close();
  });
  confirmBannerSendBtn.addEventListener("click", () => {
    if (!pendingBannerUrl) return;
    const url = pendingBannerUrl;
    pendingBannerUrl = "";
    bannerConfirmDialog.close();
    window.open(url, "_blank", "noopener");
  });
  function saveState() {
    localStorage.setItem("suScheduleSelectionV2", JSON.stringify([...state.selected]));
  }
  function loadState() {
    const saved = JSON.parse(localStorage.getItem("suScheduleSelectionV2") || "[]");
    normalizeExclusiveSelection(saved);
    renderAll();
    return;
  }

  function selectedCRNs() {
    return [...new Set(
      state.sections
        .filter(section => state.selected.has(section.key))
        .map(section => String(section.crn || "").trim())
        .filter(crn => /^\d+$/.test(crn))
    )];
  }

  function buildBannerAddUrl(term, crns) {
    const params = new URLSearchParams();
    params.append("term_in", term);

    [
      ["RSTS_IN", "DUMMY"],
      ["assoc_term_in", "DUMMY"],
      ["CRN_IN", "DUMMY"],
      ["start_date_in", "DUMMY"],
      ["end_date_in", "DUMMY"],
      ["SUBJ", "DUMMY"],
      ["CRSE", "DUMMY"],
      ["SEC", "DUMMY"],
      ["LEVL", "DUMMY"],
      ["CRED", "DUMMY"],
      ["GMOD", "DUMMY"],
      ["TITLE", "DUMMY"],
      ["MESG", "DUMMY"],
      ["REG_BTN", "DUMMY"],
      ["MESG", "DUMMY"]
    ].forEach(([name, value]) => params.append(name, value));

    crns.forEach(crn => {
      params.append("RSTS_IN", "RW");
      params.append("CRN_IN", crn);
      params.append("assoc_term_in", "");
      params.append("start_date_in", "");
      params.append("end_date_in", "");
    });

    params.append("regs_row", "0");
    params.append("wait_row", "0");
    params.append("add_row", String(crns.length));
    params.append("REG_BTN", "Submit Changes");

    return `${BANNER_BASE}/su_registration.p_su_register?${params.toString()}`;
  }

  function prepareBannerSend() {
    const term = state.term;
    const crns = selectedCRNs();

    if (!/^\d{6}$/.test(term)) {
      alert("The term is not valid. Please check the CSV file.");
      return;
    }

    if (!crns.length) {
      alert("Select at least one section with a valid CRN first.");
      return;
    }

    pendingBannerUrl = buildBannerAddUrl(term, crns);
    bannerCrnPreview.textContent = crns.join(", ");
    bannerConfirmDialog.showModal();
  }

  function updateBannerSendButton() {
    const count = selectedCRNs().length;
    // sendBannerBtn.disabled = count === 0;
    // sendBannerBtn.textContent = count
    //   ? `Send ${count} CRN${count === 1 ? "" : "s"} once`
    //   : "Send selected once";
  }

  function setCSVStatus(message, kind = "") {
    console.log(message);
    console.log("CSV status:", kind || "(no kind)");
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
      renderAll();

      console.log(sourceLabel);
      setCSVStatus(
        `${state.courses.length} courses and ${state.sections.length} sections loaded.`,
        "ok"
      );
      loadState();
    } catch (error) {
      console.error(error);
      setCSVStatus(`CSV could not be parsed: ${error.message}`, "error");
      scheduleWrap.innerHTML =
        `<div class="empty">The course CSV could not be loaded. Use the manual file picker or fix sabanci_courses.csv in the repository.</div>`;
    }
  }

  async function loadCSVFromGitHub() {
    console.log("Loading sabanci_courses.csv from GitHub…");
    setCSVStatus("Fetching the latest version…", "loading");

    try {
      if (!window.suDesktop?.loadCourseCsv) {
        throw new Error("Electron desktop bridge is unavailable.");
      }

      const result = await window.suDesktop.loadCourseCsv();
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

      if (!map.has(key)) {
        map.set(key, {
          key,
          subject,
          course,
          section,
          crn,
          title,
          credits: row.credits || "",
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
          .find(section => numericCredits(section.credits) !== null);
        const preferredTitle = mainSections
          .map(section => cleanCourseTitle(section.title))
          .find(Boolean) ||
          auxiliarySections
            .map(section => cleanCourseTitle(section.title))
            .find(Boolean) ||
          preferredSection?.title ||
          `${course.subject} ${course.course}`;

        return {
          ...course,
          course: preferredSection
            ? canonicalCourseNumber(preferredSection)
            : course.course,
          title: preferredTitle,
          credits: creditSource?.credits || "",
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
    saveState();
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
        details.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  function renderAll() {
    renderCourseList();
    renderSelectedSummary();
    renderSchedule();
    updateBannerSendButton();
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
        instructor: course.sections.flatMap(section => section.instructors || []),
        crn: course.sections.map(section => section.crn || "")
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
            <div class="course-credit">${esc(formatCredits(numericCredits(course.credits)))} credits</div>
            <div class="section-count">${esc(countParts.join(" · ") || "No sections")}</div>
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
        saveState();
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
      ? (issue && issue.kind === "bad" ? "Selected · "+issue.label : "Selected")
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
            <span class="badge">CRN ${esc(section.crn || "—")}</span>
          </span>
          <span class="fit-status ${issue?issue.kind:"ok"}">${esc(fitLabel)}</span>
        </span>

        <span class="section-meta">
          ${meetings}
          ${section.instructors.length ? `<br>${esc(section.instructors.map(s => s.replaceAll(" (P)","").trim()).join(", "))}` : ""}
        </span>

        ${(issue && issue.detail)
        ? `<div class="fit-detail ${issue.kind}">${esc(issue.detail)}</div>`
        : ""}
      </span>
    </label>`;
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
        label: "Does not fit",
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

  function createWarning(text) {
    const warning = document.createElement("div");
    warning.textContent = text;
    conflictNote.classList.add("conflict-note");
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
      otherIssues.map(x => x.section.subject + " " + x.section.course + "-" + x.section.section + ": " + x.header).forEach(x => createWarning(x));
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
    if (section.subject === "MATH" && section.course === "101" && section.section === "X") section.bypass = true;
    if (section.subject === "IF" && section.course === "100" && section.section === "X") section.bypass = true;
    if (section.bypass) {
      return {
        kind: "bad",
        label: "Unavailable",
        detail: "This section is only for students who passed the exam to be exempt from this course.",
        header: "The section you selected is only available for students who are exempt from this course and registration for that section will be done by Foundations Development Directorate."
      }
    }

    const samesection = ["SPS 101","SPS 102","SPS 303","ECON 201"];
    if (samesection.includes(section.subject + " " + section.course.substring(0,3))) {
      const parentCourse = courseForSection(section);
      const selected = selectedCRNs()
      if (parentCourse.mainSections.map(x => x.crn).includes(section.crn)) {
        // This is the main section, check if the user has selected any aux
        const chosenAux = parentCourse.auxiliarySections.find(x => selected.includes(x.crn));
        if (chosenAux) {
          if (!chosenAux.section.startsWith(section.section)) {
            const lastLetter = chosenAux.course.substring(chosenAux.course.length - 1);
            return {
              kind: "bad",
              label: "Section Restricted",
              detail: "Section not available when" + (lastLetter==="L"?" lab":lastLetter==="R"?" recitation":lastLetter==="D"?" discussion":"") + " section " + chosenAux.section + " is selected.",
              header: (lastLetter==="L"?"Lab":lastLetter==="R"?"Recitation":lastLetter==="D"?"Discussion":"Corequisite") + " section " + chosenAux.section + " is not compatible with this section."
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
              kind: "bad",
              label: "Section Restricted",
              detail: "Section not available when lecture section " + chosenMain.section + " is selected.",
              header: "Lecture section " + chosenMain.section + " is not compatible with this section."
            }
          }
        }
      }
    }

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
      if (issue) issues.push({section: section, ...issue});
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

  window.suDesktop.onMessageFromMain("session-attempts", (data) => {
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

  window.suDesktop.onMessageFromMain("login-details", (data) => {
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