const fs = require("fs");
const { app, ipcMain, BrowserWindow } = require("electron");
const cheerio = require('cheerio'); // For parsing HTML
const banner = require("./bannerinterfacer.js");

function broadcastToAllWindows(channel, data) {
  const allWindows = BrowserWindow.getAllWindows();
  allWindows.forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, data);
    }
  });
}
function parsePrereqObject(prereqString) {
  if (!prereqString) return prereqString;
  const obj = {
    level: null,
    subject: null,
    course: null,
    grade: null
  }
  if (prereqString.includes("Minimum Grade of")) {
    obj.grade = prereqString.substring(prereqString.indexOf("Minimum Grade of") + 17).trim();
    prereqString = prereqString.substring(0, prereqString.indexOf("Minimum Grade of")).trim();
  }
  if (prereqString.includes("level")) {
    obj.level = prereqString.substring(0, prereqString.indexOf("level")).trim();
    prereqString = prereqString.substring(prereqString.indexOf("level") + 5).trim();
  }
  obj.subject = prereqString.substring(0, prereqString.indexOf(" ")).trim();
  obj.course = prereqString.substring(prereqString.indexOf(" ") + 1).trim();
  return obj;
}
function parsePrerequisites(text) {
  if (text.includes("&gt;")) return null; // If the text contains > sign. It means that the prerequisites are too insignificant. So we return null.
  // Example: SPS 303's prerequisites: "SPS 303 > Prerequisite". An actual catch 22, so we ignore it.
  const words = text
    .replace(/\(/g, ' ( ')
    .replace(/\)/g, ' ) ')
    .split(/\s+/)
    .filter(w => w);
  const tokens = [];
  let currentCourse = [];
  for (const word of words) {
    const lower = word.toLowerCase();
    if (['and', 'or', '(', ')'].includes(lower)) {
      if (currentCourse.length > 0) {
        tokens.push(currentCourse.join(' '));
        currentCourse = [];
      }
      tokens.push(lower);
    } else {
      currentCourse.push(word);
    }
  }
  if (currentCourse.length > 0) tokens.push(currentCourse.join(' '));
  let pos = 0;
  function parseOr() {
    let left = parseAnd();
    while (pos < tokens.length && tokens[pos] === 'or') {
      pos++;
      let right = parseAnd();
      left = { o: 'O', a: left, b: right };
    }
    if (typeof left === 'string') {
      left = parsePrereqObject(left);
    }
    return left;
  }
  function parseAnd() {
    let left = parseFactor();
    while (pos < tokens.length && tokens[pos] === 'and') {
      pos++;
      let right = parseFactor();
      left = { o: 'A', a: left, b: right };
    }
    return left;
  }
  function parseFactor() {
    if (tokens[pos] === '(') {
      pos++;
      let node = parseOr();
      pos++; // Skip the closing ')'
      return node;
    } else {
      return parsePrereqObject(tokens[pos++]); // Return the course string
    }
  }
  return parseOr();
}
function parseGeneralRequirements(text) {
  if (!text) return null;
  //58.000 credits   \n 000  to  9999 \n Minimum Grade of  D \n May not be taken concurrently.

  //23.000 credits   \n Course or Test:  SPS 101  \n Minimum Grade of  D \n May not be taken concurrently. \nand\n Course or Test:  SPS 102  \n Minimum Grade of  D \n May not be taken concurrently. \nand\n 000  to  9999 \n Minimum Grade of  D \n May not be taken concurrently.
  const lines = text.split("\n").map(line => line.trim()).filter(line => line.length > 0);
  const obj = {};
  let courseDetected = false;
  for (const line of lines) {
    if (line.includes("credits")) {
      obj.credits = parseFloat(line.substring(0, line.indexOf("credits")).trim());
    } else if (line.includes("Course or Test:")) {
      // ADD THESE TO PREREQS!
      courseDetected = true;
      if (!obj.prerequisites) obj.prerequisites = "";
      obj.prerequisites += line.substring(line.indexOf("Course or Test:") + 15).trim() + " ";
    } else if (courseDetected) {
      obj.prerequisites += line + " ";
      if (line === "and" || line === "or") {
        courseDetected = false;
        obj.prerequisites = obj.prerequisites.replaceAll("May not be taken concurrently.", "");
      }
    } else if (line === "000  to  9999") {
      if (obj.prerequisites) obj.prerequisites = obj.prerequisites.trim();
      break; // Ignore this line and everything after it
    }
  }
  return obj;
}
async function generateCSV() {
  const thisterm = banner.getCurrentTerm();
  if (true) {
    const listOfSubjects = await banner.requestToPublicBanner("bwckgens.p_proc_term_date", "POST", "p_calling_proc=bwckschd.p_disp_dyn_sched&p_term=" + thisterm);
    let $ = listOfSubjects.dom;
    const subjects = [];
    $("select[name='sel_subj']").find("option").each((index, element) => {
      // if (element.attribs.value === "HUM")
      subjects.push("sel_subj=" + element.attribs.value);
    });
    broadcastToAllWindows("scraper-information", { h: subjects.length + " subjects found", t: "Fetching course list..." });
    const listOfCourses = await banner.requestToPublicBanner("bwckschd.p_get_crse_unsec", "POST", "term_in=" + thisterm + "&sel_subj=dummy&sel_day=dummy&sel_schd=dummy&sel_insm=dummy&sel_camp=dummy&sel_levl=dummy&sel_sess=dummy&sel_instr=dummy&sel_ptrm=dummy&sel_attr=dummy&" + subjects.join("&") + "&sel_crse=&sel_title=&sel_from_cred=&sel_to_cred=&begin_hh=0&begin_mi=0&begin_ap=a&end_hh=0&end_mi=0&end_ap=a");
    $ = listOfCourses.dom;
    const courses = [];
    let pendingCourse = null;
    $("table[summary='This layout table is used to present the sections found']").find("tbody").eq(0).children().each((index, element) => {
      const firstChild = $(element).children().first()[0];
      if (firstChild.name === "th") {
        const header = $(firstChild).find("a").eq(0)
        if (pendingCourse) {
          console.warn("Pending course not null when starting new course. This may indicate a parsing error.");
        }
        else {
          const detailLink = header.attr("href").substring(1);
          pendingCourse = {
            header: header.text().trim(),
            link: detailLink.substring(detailLink.indexOf("/") + 1),
            body: null
          }
        }
      }
      else {
        if (pendingCourse) {
          pendingCourse.body = $(firstChild).html();
          //if (pendingCourse.header.includes("HUM 2"))
          courses.push(pendingCourse);
          pendingCourse = null;
        }
        else {
          console.warn("No pending course when trying to parse a course body. This may indicate a parsing error.", $(firstChild).html());
        }
      }
    });
    broadcastToAllWindows("scraper-information", { h: courses.length + " sections found", t: "Processing each section...", p: 0 });
    const allCourseCodes = [];
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      broadcastToAllWindows("scraper-information", { p: ((i + 1) / courses.length) });
      course.section = course.header.substring(course.header.lastIndexOf(" - ") + 3);
      course.header = course.header.substring(0, course.header.lastIndexOf(" - "));
      course.subject = course.header.substring(course.header.lastIndexOf(" - ") + 3);
      course.course = course.subject.substring(course.subject.indexOf(" ")).trim();
      course.subject = course.subject.substring(0, course.subject.indexOf(" ")).trim();
      course.header = course.header.substring(0, course.header.lastIndexOf(" - "));
      course.crn = course.header.substring(course.header.lastIndexOf(" - ") + 3);
      course.header = course.header.substring(0, course.header.lastIndexOf(" - "));
      course.title = course.header;
      delete course.header;
      const $$ = cheerio.load(course.body);
      $$("span.fieldlabeltext").each((index, element) => {
        const key = $$(element).text().trim();
        const value = $$(element)[0].next.data.trim();
        if (key && value) {
          course[key.substring(0, key.length - 1)] = value;
        }
        $$(element)[0].next.data = "";
        $$(element).remove();
      });
      if ($$("a:contains('View Catalog Entry')").length > 0) {
        course.catalog = $$("a:contains('View Catalog Entry')").attr("href").substring(1);
        course.catalog = course.catalog.substring(course.catalog.indexOf("/") + 1);
        $$("a:contains('View Catalog Entry')").remove();
      }
      if (course.Attributes) course.Attributes = course.Attributes.split(", ");
      const timetablekeys = [];
      $$("table.datadisplaytable").find("tr").each((index, element) => {
        $$(element).find("th").each((i, e) => {
          timetablekeys.push($$(e).text().trim());
        });
        $$(element).find("td").each((i, e) => {
          const key = timetablekeys[i];
          const value = $$(e).text().trim().replaceAll("   ", " ").replaceAll("  ", " ").replaceAll(" (P)", "").replaceAll(" , ", ", ").replaceAll(" ,", ", ");
          if (!course.timetable) course.timetable = [];
          if (!course.timetable[index - 1]) course.timetable[index - 1] = {};
          course.timetable[index - 1][key] = value;
        });
      });
      course.credits = { "SU": 0, "ECTS": { base: 0, eng: 0, bsc: 0, exception: null } };
      $$("table.datadisplaytable").remove();
      course.remains = [];
      if ($$("span")) {
        const span = $$("span").text().trim();
        if (span.includes("for students admitted before")) {
          course.credits.ECTS.exception = {
            admit: parseInt(span.substring(span.indexOf("for students admitted before") + 28, span.indexOf("for students admitted before") + 33).trim()),
            base: parseInt(span.substring(span.indexOf("ECTS") - 2, span.indexOf("ECTS")).trim()),
            eng: parseInt(span.substring(span.indexOf("ENGINEERING:") + 12, span.indexOf("/") - 1).trim()),
            bsc: parseInt(span.substring(span.indexOf("BASIC:") + 6, span.indexOf(")")).trim())
          }
          if (!course.credits.ECTS.exception.eng) course.credits.ECTS.exception.eng = 0;
          if (!course.credits.ECTS.exception.bsc) course.credits.ECTS.exception.bsc = 0;
        }
        $$("span").remove();
      }
      course.remains.push(...($$("body").html().replaceAll("<br>", "").trim().split("\n").map(s => s.trim()).filter(s => s.length > 0)));
      if (course.Attributes) {
        course.Attributes = course.Attributes.map(attr => {
          if (attr.startsWith("Course Offered by ")) {
            if (!course.Faculty) course.Faculty = attr.substring("Course Offered by ".length);
            return null;
          }
          else if (attr.includes("ECTS")) {
            course.credits.ECTS.base = parseInt(attr.substring(attr.indexOf("ECTS") - 2, attr.indexOf("ECTS")).trim())
            if (attr.includes("ENGINEERING:")) course.credits.ECTS.eng = parseInt(attr.substring(attr.indexOf("ENGINEERING:") + 12, attr.indexOf("/") - 1).trim())
            if (!course.credits.ECTS.eng) course.credits.ECTS.eng = 0;
            if (attr.includes("BASIC:")) course.credits.ECTS.bsc = parseInt(attr.substring(attr.indexOf("BASIC:") + 6, attr.indexOf(")")).trim())
            if (!course.credits.ECTS.bsc) course.credits.ECTS.bsc = 0;
          }
          return null;
        }).filter(attr => attr !== null);
      }
      if (course.Faculty) {
        course.Faculty = course.Faculty.replace("Course Offered by ", "").trim().replace("SBS", "FMAN");
      }
      if (course.remains.length > 0) {
        course.remains = course.remains.map(line => {
          line = line.replace("(), ", "").trim();
          if (line.startsWith("Course Offered by ")) {
            if (!course.Faculty) course.Faculty = line.substring("Course Offered by ".length);
            return null;
          }
          if (line.endsWith("Credits")) {
            course.credits.SU = parseFloat(line.substring(0, line.indexOf("Credits")).trim());
            return null;
          }
          if (line.endsWith("Campus")) {
            course.campus = line.substring(0, line.indexOf("Campus")).trim();
            return null;
          }
          if (line.endsWith("Instructional Method")) {
            course.instructionalMethod = line.substring(0, line.indexOf("Instructional Method")).trim();
            return null;
          }
          if (line.endsWith("Schedule Type")) {
            course.scheduleType = line.substring(0, line.indexOf("Schedule Type")).trim();
            return null;
          }
          if (line.startsWith("Lang. of Instruction:")) {
            course.language = line.substring("Lang. of Instruction:".length).trim();
            return null;
          }
          if (line.includes("Syllabus Available")) {
            return null;
          }
          return line;
        }).filter(line => line !== null);
        if (!allCourseCodes.includes(course.subject + " " + course.course) && !["Lab", "Recitation", "Discussion"].includes(course.scheduleType)) {
          allCourseCodes.push(course.subject + " " + course.course);
        }
        if (((course.subject === "TLL" && ["101", "102"].includes(course.course)) || course.subject === "HIST" && ["191", "192"].includes(course.course))) {
          if (course.section.endsWith("Y")) {
            course.language = "English";
            course.restriction = "NO_TURKISH_CITIZENS";
          } else {
            course.restriction = "TURKISH_CITIZENS_ONLY";
          }
        }
        else if (course.subject === "TUR") {
          course.language = "Turkish";
          course.restrictions = "NO_TURKISH_CITIZENS";
        }
      }
      if (course.remains.length === 0) delete course.remains;
      if (course.Attributes && course.Attributes.length === 0) delete course.Attributes;
      if (course.Levels) course.Levels = course.Levels.split(", ").map(level => level.trim());
      delete course.body;
      courses[i] = course;
    }
    broadcastToAllWindows("scraper-information", { h: allCourseCodes.length + " courses found", t: "Fetching prerequisites...", p: 0 });
    let completeCount = 0;
    let ongoingCount = 0;
    const catalogs = [];
    const MAX_CONCURRENT_REQUESTS = 5;
    const coreqs = {};
    for (let i = 0; i < allCourseCodes.length; i++) {
      await new Promise(async r => { while (ongoingCount >= MAX_CONCURRENT_REQUESTS) { await new Promise(o => setTimeout(o, 1)); }; r(); });
      ongoingCount++;
      broadcastToAllWindows("scraper-information", { p: ((completeCount + 1) / allCourseCodes.length) });
      new Promise(async r => {
        const catalogData = await banner.requestToPublicBanner("bwckctlg.p_disp_course_detail?cat_term_in=202601&subj_code_in=" + allCourseCodes[i].split(" ")[0] + "&crse_numb_in=" + allCourseCodes[i].split(" ")[1], "GET");
        const $$ = cheerio.load(catalogData.dom("td.ntdefault").html().replaceAll("\n", " ").replaceAll("<br>", "\n"));
        const description = $$("i")[0] && $$("i")[0].next ? $$("i")[0].next.data.trim() : null;
        const descriptionTR = $$("b")[0] && $$("b")[0].next ? $$("b")[0].next.data.substring(0, $$("b")[0].next.data.indexOf("\n")).trim() : null;
        const restrictions = $$("span.fieldlabeltext:contains('Restrictions:')")[0] ? $$("span.fieldlabeltext:contains('Restrictions:')")[0].next.data.trim().split("\n").map(x => { x = x.trim(); if (x === "Must be enrolled in one of the following Levels:") return "MUSTBE:allowedLevels"; else if (x === "Must be enrolled in one of the following Colleges:") return "MUSTBE:allowedFaculties"; else if (x === "Must be enrolled in one of the following Programs:") return "MUSTBE:allowedPrograms"; else if (x === "Must be enrolled in one of the following Classifications:") return "MUSTBE:allowedClasses"; else if (x === "May not be enrolled in one of the following Colleges:") return "MUSTBE:deniedFaculties"; else return x }).filter(x => x.length > 0) : null;
        const getSectionText = (startLabel, endLabel) => {
          const $start = $$(`span.fieldlabeltext:contains('${startLabel}')`);
          if ($start.length === 0) return null;
          let rawText = '';
          let currentNode = $start[0].next;
          const endSelector = endLabel ? `span.fieldlabeltext:contains('${endLabel}')` : null;
          while (currentNode) {
            if (endSelector && currentNode.type === 'tag' && $$(currentNode).is(endSelector)) {
              break;
            }
            if (currentNode.type === 'text') {
              rawText += currentNode.data;
            }
            else if (currentNode.type === 'tag') {
              rawText += $$(currentNode).text();
            }
            currentNode = currentNode.next;
          }
          return rawText.trim();
        };

        const rawCoreqText = getSectionText('Corequisites:', 'Prerequisites:');
        const coreqText = rawCoreqText ? rawCoreqText.split("\n").map(x => x.trim()).filter(x => x.length > 0) : null;
        if (coreqText && coreqText.length > 0) {
          for (let j = 0; j < coreqText.length; j++) {
            coreqs[coreqText[j]] = [allCourseCodes[i], ...coreqText.filter(x => x !== coreqText[j])].filter(x => x !== undefined);
          }
        }

        let rawPrereqText = getSectionText('Prerequisites:', 'General Requirements:');
        const rawGeneralText = getSectionText('General Requirements:', null);

        const generalText = rawGeneralText ? parseGeneralRequirements(rawGeneralText) : null;
        if (generalText && generalText.prerequisites) {
          if (rawPrereqText && !rawPrereqText.includes(">")) {
            rawPrereqText += " and (" + generalText.prerequisites + ")";
          }
          else {
            rawPrereqText = generalText.prerequisites;
          }
          delete generalText.prerequisites;
        }
        const prereqText = rawPrereqText ? parsePrerequisites(rawPrereqText) : null;

        const obj = {
          subject: allCourseCodes[i].split(" ")[0],
          course: allCourseCodes[i].split(" ")[1],
          description,
          descriptionTR,
          restrictions,
          prerequisites: prereqText,
          coreqText,
          generalText
        }
        if (obj.restrictions && obj.restrictions.length === 0) delete obj.restrictions;
        else if (obj.restrictions) {
          const restrictionsObj = {};
          let currentKey = null;
          obj.restrictions.forEach(line => {
            if (line.startsWith("MUSTBE:")) {
              currentKey = line.substring(7);
              restrictionsObj[currentKey] = [];
            }
            else if (currentKey) {
              restrictionsObj[currentKey].push(line);
            }
          });
          obj.restrictions = restrictionsObj;
        }
        catalogs.push(obj);
        completeCount++;
        ongoingCount--;
        r();
      });
    }
    await new Promise(async r => { while (completeCount < allCourseCodes.length) { await new Promise(o => setTimeout(o, 1)); }; r(); });

    broadcastToAllWindows("scraper-information", { h: "Almost there", t: "Applying prerequisites to courses", p: 0 });

    for (let i = 0; i < courses.length; i++) {
      broadcastToAllWindows("scraper-information", { p: ((i + 1) / courses.length) });
      const course = courses[i];
      const coursecode = (() => {
        if (["Lab", "Recitation", "Discussion"].includes(course.scheduleType)) {
          return coreqs[course.subject + " " + course.course][0];
        }
        return course.subject + " " + course.course;
      })();

      const catalog = catalogs.find(c => c.subject === coursecode.split(" ")[0] && c.course === coursecode.split(" ")[1]);
      if (catalog) {
        course.description = catalog.description;
        course.descriptionTR = catalog.descriptionTR;
        course.restrictions = {
          general: catalog.generalText,
          prerequisites: catalog.prerequisites,
          corequisites: ["Lab", "Recitation", "Discussion"].includes(course.scheduleType) ? coreqs[course.subject + " " + course.course] : catalog.coreqText,
          enrollment: catalog.restrictions
        }
        courses[i] = course;
      }
      else {
        console.warn(course.subject + " " + course.course + ": No catalog entry found for course", coursecode);
      }
    }
    const allSchedules = [];
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      const c = { CRN: course.crn, Subject: course.subject, Course: course.course, Section: course.section, Title: course.title, MeetingType: course.scheduleType, ...course };
      delete c.crn;
      delete c.subject;
      delete c.course;
      delete c.section;
      delete c.title;
      c.Levels = course.Levels ? course.Levels.join(":") : null;
      delete c["Associated Term"];
      c.AssociatedTerm = thisterm;
      c.Credits = course.credits.SU;
      c.CreditsECTS = course.credits.ECTS.base;
      c.EngnrECTS = course.credits.ECTS.eng;
      c.BasicECTS = course.credits.ECTS.bsc;
      if (course.credits.ECTS.exception !== null) {
        c.ECTSExceptionAdmitBefore = course.credits.ECTS.exception.admit;
        c.ECTSException = course.credits.ECTS.exception.base;
        c.ECTSExceptionEngnr = course.credits.ECTS.exception.eng;
        c.ECTSExceptionBasic = course.credits.ECTS.exception.bsc;
      }
      else {
        c.ECTSExceptionAdmitBefore = null;
        c.ECTSException = null;
        c.ECTSExceptionEngnr = null;
        c.ECTSExceptionBasic = null;
      }
      delete c.credits;
      delete c.catalog;
      delete c.link;
      if (course.restrictions.general !== null && course.restrictions.general.credits !== undefined) c.CreditLimit = course.restrictions.general.credits;
      else c.CreditLimit = null;
      c.Prerequisites = null;
      c.Corequisites = null;
      c.AllowedLevels = null;
      c.DeniedLevels = null;
      c.AllowedFaculties = null;
      c.DeniedFaculties = null;
      c.AllowedPrograms = null;
      c.DeniedPrograms = null;
      c.AllowedClasses = null;
      c.DeniedClasses = null;
      if (course.restrictions.prerequisites) c.Prerequisites = JSON.stringify(course.restrictions.prerequisites);
      if (course.restrictions.corequisites) c.Corequisites = course.restrictions.corequisites.join(":");
      if (course.restrictions.enrollment) {
        if (course.restrictions.enrollment.allowedLevels) c.AllowedLevels = course.restrictions.enrollment.allowedLevels.join(":");
        if (course.restrictions.enrollment.deniedLevels) c.DeniedLevels = course.restrictions.enrollment.deniedLevels.join(":");
        if (course.restrictions.enrollment.allowedFaculties) c.AllowedFaculties = course.restrictions.enrollment.allowedFaculties.join(":");
        if (course.restrictions.enrollment.deniedFaculties) c.DeniedFaculties = course.restrictions.enrollment.deniedFaculties.join(":");
        if (course.restrictions.enrollment.allowedPrograms) c.AllowedPrograms = course.restrictions.enrollment.allowedPrograms.join(":");
        if (course.restrictions.enrollment.deniedPrograms) c.DeniedPrograms = course.restrictions.enrollment.deniedPrograms.join(":");
        if (course.restrictions.enrollment.allowedClasses) c.AllowedClasses = course.restrictions.enrollment.allowedClasses.join(":");
        if (course.restrictions.enrollment.deniedClasses) c.DeniedClasses = course.restrictions.enrollment.deniedClasses.join(":");
      }
      if (course.restrictions) {
        delete c.restrictions;
      }

      if (course.timetable === undefined || course.timetable.length === 0) {
        console.log("No timetable found for course", course.subject + " " + course.course + " - " + course.section);
        allSchedules.push(c);
      }
      else for (const meeting of course.timetable) {
        const schedule = { ...c };
        schedule.timetable = meeting;
        Object.keys(meeting).forEach(key => {
          if (key !== "Type") schedule[key.replaceAll(" ", "")] = meeting[key];
        });
        delete schedule.timetable;
        allSchedules.push(schedule);
      }
    }

    broadcastToAllWindows("scraper-information", { h: "Saving...", t: "Saving as JSON", p: 0 });
    if (!fs.existsSync("scrapeResults")) fs.mkdirSync("scrapeResults");
    //fs.writeFileSync("scrapeResults/courses.json", JSON.stringify(allSchedules, null, 2));
    broadcastToAllWindows("scraper-information", { h: "Saving...", t: "Saving as CSV", p: 0 });
    const csv = [];
    const headers = Object.keys(allSchedules[0]);
    csv.push(headers.join(","));
    for (let i = 0; i < allSchedules.length; i++) {
      const row = [];
      for (let j = 0; j < headers.length; j++) {
        let value = allSchedules[i][headers[j]];
        if (value === null || value === undefined) value = "";
        else if (typeof value === "string" && value.includes(",")) value = "\"" + value.replaceAll("\"", "\"\"") + "\"";
        row.push(value);
      }
      csv.push(row.join(","));
    }
    fs.writeFileSync("scrapeResults/courses.csv", csv.join("\n"));
  }
  const allMajors = [];
  const allMasterMajors = [];
  const allPHDMajors = [];
  const doubleMajors = [];
  const allMinors = [];

  const degreeForm = (() => {
    const html = fs.readFileSync("degreeEvalForm.html", "utf8");
    const frame = html.substring(html.indexOf(">") + 2, html.lastIndexOf("</select>") - 1);
    const parsed = frame.split("\n").map(line => line.replaceAll("<option value=\"", "").replaceAll("</option>", "").trim().split("\">")).map(arr => ({ code: arr[0], name: arr[1].substring(arr[1].indexOf(" - ") + 3).trim() }));
    return parsed;
  })();
  const majorNames = [];
  degreeForm.forEach(line => {
    if (line.code.endsWith("-MINOR") && !allMinors.includes(line)) allMinors.push(line);
    else if (line.code.endsWith("-DM") && !doubleMajors.includes(line)) doubleMajors.push(line);
    else if (line.code.startsWith("PHD") && !allPHDMajors.includes(line)) allPHDMajors.push(line);
    else if (line.code.startsWith("M") && !allMasterMajors.includes(line)) allMasterMajors.push(line);
    else if (line.code.startsWith("B") && !allMajors.includes(line)) allMajors.push(line);
    else return;
    // else ... yes, there's a HIST 191 as a major code for some reason. Ignore it.
    majorNames.push(line.code + ",\"" + line.name + "\"");
  });
  fs.writeFileSync("scrapeResults/majorNames.csv", majorNames.join("\n"));

  async function getMajorDetails(major, level = "UG") {
    const majordata = {
      terms: {},
      courses: {}
    };
    const fromTerm = (major === "ARTTC-MINOR") ? "201203" : "199901"; // ARTTC-MINOR was horribly formatted in Banner before 201203, so we ignore those terms. Otherwise, we start from 199901.
    const toTerm = banner.getCurrentTerm();
    function nextTerm(term) {
      if (term.endsWith("01")) return term.substring(0, 5) + "2";
      else if (term.endsWith("02")) return term.substring(0, 5) + "3";
      else if (term.endsWith("03")) return (parseInt(term.substring(0, 4)) + 1) + "01";
      else return null;
    }
    const termsToCheck = (parseInt(toTerm.substring(0, 4)) - parseInt(fromTerm.substring(0, 4))) * 3 + (parseInt(toTerm.substring(4)) - parseInt(fromTerm.substring(4))) + 1;
    let termsChecked = 0;
    const MAX_CONCURRENT_REQUESTS = 5;
    let ongoingRequests = 0;
    for (let termToCheck = fromTerm; parseInt(termToCheck) <= parseInt(toTerm); termToCheck = nextTerm(termToCheck)) {
      await new Promise(async r => { while (ongoingRequests >= MAX_CONCURRENT_REQUESTS) { await new Promise(o => setTimeout(o, 1)); }; r(); });
      ongoingRequests++;
      new Promise(async r => {
        const response = await banner.requestToPublicBanner("SU_DEGREE.p_degree_detail?P_TERM=" + termToCheck + "&P_PROGRAM=" + major + "&P_SUBMIT=&P_LANG=EN&P_LEVEL=" + level, "GET");
        if (!response.dom) {
          majordata.terms[termToCheck] = { error: "No response from Banner" };
          r();
          return;
        }
        majordata.terms[termToCheck] = {}
        const $ = response.dom;

        function parseRequirementTable(table, codeForUs, termToCheck, thisIsPool = false) {
          majordata.terms[termToCheck].requirements[codeForUs].courses = []
          table.find("tbody").eq(thisIsPool ? 1 : 0).children().each((index, element) => {
            const obj = {};
            const crse = $(element);
            crse.find("a").each((i, e) => {
              const text = $(e).text().trim();
              $(e).replaceWith(text);
            });
            if (crse.children().eq(0).find("center").length > 0) {
              obj.facultyCourse = crse.children().last().text().trim();
              if (obj.facultyCourse === "FENS") obj.facultyCourse = "E";
              else if (obj.facultyCourse === "SBS") obj.facultyCourse = "M";
              else if (obj.facultyCourse === "FASS") obj.facultyCourse = "A";
            }
            crse.children().eq(0).remove();
            obj.course = crse.children().eq(0).text().trim();
            majordata.terms[termToCheck].requirements[codeForUs].courses.push(obj);
          });
        }
        try {
          if ($(".t_mezuniyet")) {
            majordata.terms[termToCheck].totalRequired = {};
            majordata.terms[termToCheck].requirements = {};
            $(".t_mezuniyet").find("tbody").eq(1).children().each((index, element) => {
              const row = $(element);
              const col1 = row.find("td").eq(1).text().trim();
              const col2 = row.find("td").eq(2).text().trim();
              const col3 = row.find("td").eq(3).text().trim();
              if ($(".t_mezuniyet").find("tbody").eq(1).children().length === index + 1) {
                majordata.terms[termToCheck].totalRequired.credits = col2 === "-" ? undefined : isNaN(parseInt(col2)) ? undefined : parseInt(col2);
                majordata.terms[termToCheck].totalRequired.ECTS = col1 === "-" ? undefined : isNaN(parseInt(col1)) ? undefined : parseInt(col1);
                majordata.terms[termToCheck].totalRequired.courses = col3 === "-" ? undefined : isNaN(parseInt(col3)) ? undefined : parseInt(col3);
                return;
              }
              const title = row.find("td").eq(0).find("a").eq(0);
              const codeForUs = (() => {
                const text = title.text().trim();
                if (text === "University Courses") return "DFoundationally Required";
                else if (text === "Internship") return "IInternship";
                else if (text === "Seminar") return "SSeminar";
                else if (text === "Required") return "RRequired";
                else if (text === "Required Courses") return "RRequired";
                else if (text === "Required Courses (Area of Management)") return "RRequired (Management)";
                else if (text === "Required Courses (Area of Engineering)") return "RRequired (Engineering)";
                else if (text === "Required Course") return "RRequired";
                else if (text === "Mathematics Requirement Courses") return "RRequired (Math)";
                else if (text === "Philosophy Requirement Course") return "RRequired (Philosophy)";
                else if (text === "Elective Courses") return "CElective";
                else if (text === "Electives Courses") return "CElective";
                else if (text === "Term Project") return "PProject";
                else if (text === "Project Course") return "PProject";
                else if (text === "Project") return "PProject";
                else if (text === "Graduation Project") return "PProject";
                else if (text === "PhD Dissertation") return "TDissertation";
                else if (text === "PhD. Thesis") return "TPhD Thesis";
                else if (text === "Ph.D. Thesis") return "TPhD Thesis";
                else if (text === "PhD Thesis") return "TPhD Thesis";
                else if (text === "Thesis Course") return "TPhD Thesis";
                else if (text === "Professional Development Seminars") return "SSeminar";
                else if (text === "Area Core Courses (Management and Organization Area)") return "AArea (Management)";
                else if (text === "Area Core Courses (M") return "AArea (Management)"; // This is a weird case where the text is cut off in Banner, but we can still recognize it.
                else if (text === "Core Courses (Management and Organization Area)") return "CCore (Management)";
                else if (text === "Core Courses (Operations Management Area)") return "CCore (Operations)";
                else if (text === "Elective Courses (Management and Organization Area)") return "AElective (Management)";
                else if (text === "Elective Courses (Operations Management Area)") return "AElective (Operations)";
                else if (text === "FENS Graduate Courses") return "OFENS Graduate";
                else if (text === "Managerial Skills Workshop") return "WWorkshop";
                else if (text === "Managerial Skill Workshops") return "WWorkshop";
                else if (text === "Managerial Skills Workshops") return "WWorkshop";
                else if (text === "Project (Area of Management)") return "PProject (Management)";
                else if (text === "Project (Area of Engineering)") return "PProject (Engineering)";
                else if (text === "Practicing Finance") return "OFinance";
                else if (text === "Master Thesis") return "TThesis";
                else if (text === "Master Thesis / Studio Project") return "TThesis";
                else if (text === "Core Electives") return "CCore";
                else if (text === "Core Elective") return "CCore";
                else if (text === "Core Electives (Area of Management)") return "CCore (Management)";
                else if (text === "Core Electives (Area of Engineering)") return "CCore (Engineering)";
                else if (text === "Core Electives (Area of Management) *") return "CCore (Management)";
                else if (text === "Core Electives (Area of Engineering) *") return "CCore (Engineering)";
                else if (text === "Core Courses") return "CCore";
                else if (text === "Core Area Courses") return "CCore";
                else if (text === "Area Core Courses") return "AArea";
                else if (text === "Core Elective Courses") return "CCore";
                else if (text === "Core Electives 1") return "CCore 1";
                else if (text === "Core Electives 2") return "CCore 2";
                else if (text.startsWith("Core Elective I")) return "CCore " + (text.substring(text.indexOf("I"), text.indexOf(" ", text.indexOf("I"))).trim()).length;
                else if (text.startsWith("Core Electives I")) return "CCore " + (text.substring(text.indexOf("I"), text.indexOf(" ", text.indexOf("I"))).trim()).length;
                else if (text === "Area Electives") return "AArea";
                else if (text === "Area Electives (Area of Engineering)") return "AArea (Engineering)";
                else if (text === "Area Electives (Area of Management)") return "AArea (Management)";
                else if (text === "Area Electives (Area of Engineering) *") return "AArea (Engineering)";
                else if (text === "Area Electives (Area of Management) *") return "AArea (Management)";
                else if (text === "Area Elective") return "AArea";
                else if (text === "Area Courses") return "AArea";
                else if (text === "Area Elective Courses") return "AArea";
                else if (text === "Free Elective Courses") return "FFree";
                else if (text === "Free Electives") return "FFree";
                else if (text === "Free Elective") return "FFree";
                else if (text === "Faculty Courses") return "FACULTY";
                else if (text === "Engineering") return "ECTS:ENG";
                else if (text === "Basic Science") return "ECTS:BSC";
                else console.warn(major, termToCheck, "Unknown requirement type: " + text);
                return text;
              })();
              if (codeForUs === "ECTS:ENG") majordata.terms[termToCheck].totalRequired.ECTSENG = col1 === "-" ? undefined : isNaN(parseInt(col1)) ? undefined : parseInt(col1);
              else if (codeForUs === "ECTS:BSC") majordata.terms[termToCheck].totalRequired.ECTSBSC = col1 === "-" ? undefined : isNaN(parseInt(col1)) ? undefined : parseInt(col1);
              else if (codeForUs === "FACULTY") majordata.terms[termToCheck].totalRequired.facultyCourses = col3 === "-" ? undefined : isNaN(parseInt(col3)) ? undefined : parseInt(col3);
              else {
                const code = title.attr("href").substring(1).trim();
                const table = $("a[name='" + code + "']").parent().parent().parent().parent().parent().parent().parent().nextAll('tr:not(.t_kategori_row_desc)').filter((index, el) => { return $(el).text().trim().length > 0; }).first();
                majordata.terms[termToCheck].requirements[codeForUs] = {
                  code: title.attr("href").substring(1).trim(),
                  credits: col2 === "-" ? undefined : isNaN(parseInt(col2)) ? undefined : parseInt(col2),
                  ECTS: col1 === "-" ? undefined : isNaN(parseInt(col1)) ? undefined : parseInt(col1),
                  courses: col3 === "-" ? undefined : isNaN(parseInt(col3)) ? undefined : parseInt(col3)
                }
                if (table.find("table").length === 0) {
                  if (table.find("a").length > 0) majordata.terms[termToCheck].requirements[codeForUs].url = table.find("a").eq(0).attr("href").trim();
                  else {
                    //console.warn(major, termToCheck, "No table or link found for requirement type: " + codeForUs);
                    majordata.terms[termToCheck].requirements[codeForUs].courses = [];
                  }
                }
                else {
                  parseRequirementTable(table.find("table").eq(0), codeForUs, termToCheck);
                }
              }
            });
          }
          for (const code in majordata.terms[termToCheck].requirements) {
            if (majordata.terms[termToCheck].requirements[code].url) {
              const poolPage = await banner.requestToPublicBanner(majordata.terms[termToCheck].requirements[code].url, "GET");
              const $$ = poolPage.dom;
              parseRequirementTable($$("table").eq(0), code, termToCheck, true);
              delete majordata.terms[termToCheck].requirements[code].url;
            }
            delete majordata.terms[termToCheck].requirements[code].code;
          }
          for (const code in majordata.terms[termToCheck].requirements) {
            for (const course of majordata.terms[termToCheck].requirements[code].courses) {
              if (!majordata.courses[course.course]) majordata.courses[course.course] = {};
              majordata.courses[course.course][termToCheck] = code + (course.facultyCourse ? ":" + course.facultyCourse : "");
            }
          }
          delete majordata.terms[termToCheck].requirements;
          if (Object.keys(majordata.terms[termToCheck].totalRequired).some(key => majordata.terms[termToCheck].totalRequired[key] !== undefined)) majordata.terms[termToCheck] = majordata.terms[termToCheck].totalRequired;
          else delete majordata.terms[termToCheck];
        }
        catch (e) {
          console.error("Error parsing major details for " + major + " in term " + termToCheck, e.message);
        }
        termsChecked++;
        ongoingRequests--;
        broadcastToAllWindows("scraper-information", { p: termsChecked / termsToCheck });
        r();
      });
    }
    await new Promise(async r => { while (termsChecked < termsToCheck) { await new Promise(o => setTimeout(o, 1)); }; r(); });
    return majordata;
  }
  function createCSVForMajor(major, majordata, folder) {
    let CSV = "\"" + major.name + "\",\"" + Object.keys(majordata.terms).join("\",\"") + "\"\n";
    const requirementKeys = []
    for (const term in majordata.terms) {
      for (const key in majordata.terms[term]) {
        if (!requirementKeys.includes(key) && majordata.terms[term][key] !== undefined) requirementKeys.push(key);
      }
    }
    for (const key of requirementKeys) {
      CSV += "Requirement:" + key;
      for (const term in majordata.terms) {
        CSV += "," + (majordata.terms[term][key] || "");
      }
      CSV += "\n";
    }
    for (let c = 0; c < Object.keys(majordata.courses).length; c++) {
      const course = Object.keys(majordata.courses)[c];
      let stringifiedCourse = course;
      for (const term in majordata.terms) {
        stringifiedCourse += "," + (majordata.courses[course][term] || "");
      }
      CSV += stringifiedCourse + "\n";
    }
    CSV = CSV.trim();
    fs.writeFileSync("scrapeResults/" + folder + "/" + major.code + ".csv", CSV);
  }
  const getOnlyMajor = undefined;
  let continueOnMajor = undefined;
  if (!fs.existsSync("scrapeResults")) fs.mkdirSync("scrapeResults");
  if (!fs.existsSync("scrapeResults/UGMajors")) fs.mkdirSync("scrapeResults/UGMajors");
  for (let i = 0; i < allMajors.length; i++) {
    const major = allMajors[i];
    if (continueOnMajor && major.code !== continueOnMajor) continue;
    if (continueOnMajor && major.code === continueOnMajor) continueOnMajor = undefined;
    if (getOnlyMajor && major.code !== getOnlyMajor) continue;
    broadcastToAllWindows("scraper-information", { h: "Getting majors (" + i + "/" + allMajors.length + ")", t: major.name, p: 0 });
    const majordata = await getMajorDetails(major.code, "UG");
    createCSVForMajor(major, majordata, "UGMajors");
    majordata.name = major.name;
    //fs.writeFileSync("scrapeResults/UGMajors/" + major.code + ".json", JSON.stringify(majordata, null, 2));
  };
  if (!fs.existsSync("scrapeResults/DMMajors")) fs.mkdirSync("scrapeResults/DMMajors");
  for (let i = 0; i < doubleMajors.length; i++) {
    const major = doubleMajors[i];
    if (continueOnMajor && major.code !== continueOnMajor) continue;
    if (continueOnMajor && major.code === continueOnMajor) continueOnMajor = undefined;
    if (getOnlyMajor && major.code !== getOnlyMajor) continue;
    broadcastToAllWindows("scraper-information", { h: "Getting doubles (" + i + "/" + doubleMajors.length + ")", t: major.name, p: 0 });
    const majordata = await getMajorDetails(major.code, "UG");
    createCSVForMajor(major, majordata, "DMMajors");
    majordata.name = major.name;
    //fs.writeFileSync("scrapeResults/DMMajors/" + major.code + ".json", JSON.stringify(majordata, null, 2));
  };
  if (!fs.existsSync("scrapeResults/Minors")) fs.mkdirSync("scrapeResults/Minors");
  for (let i = 0; i < allMinors.length; i++) {
    const major = allMinors[i];
    if (continueOnMajor && major.code !== continueOnMajor) continue;
    if (continueOnMajor && major.code === continueOnMajor) continueOnMajor = undefined;
    if (getOnlyMajor && major.code !== getOnlyMajor) continue;
    broadcastToAllWindows("scraper-information", { h: "Getting minors (" + i + "/" + allMinors.length + ")", t: major.name, p: 0 });
    const majordata = await getMajorDetails(major.code, "UG");
    createCSVForMajor(major, majordata, "Minors");
    majordata.name = major.name;
    //fs.writeFileSync("scrapeResults/Minors/" + major.code + ".json", JSON.stringify(majordata, null, 2));
  };
  if (!fs.existsSync("scrapeResults/MXMajors")) fs.mkdirSync("scrapeResults/MXMajors");
  for (let i = 0; i < allMasterMajors.length; i++) {
    const major = allMasterMajors[i];
    if (continueOnMajor && major.code !== continueOnMajor) continue;
    if (continueOnMajor && major.code === continueOnMajor) continueOnMajor = undefined;
    if (getOnlyMajor && major.code !== getOnlyMajor) continue;
    broadcastToAllWindows("scraper-information", { h: "Getting masters (" + i + "/" + allMasterMajors.length + ")", t: major.name, p: 0 });
    const majordata = await getMajorDetails(major.code, "UG");
    createCSVForMajor(major, majordata, "MXMajors");
    majordata.name = major.name;
    //fs.writeFileSync("scrapeResults/MXMajors/" + major.code + ".json", JSON.stringify(majordata, null, 2));
  };
  if (!fs.existsSync("scrapeResults/PDMajors")) fs.mkdirSync("scrapeResults/PDMajors");
  for (let i = 0; i < allPHDMajors.length; i++) {
    const major = allPHDMajors[i];
    if (continueOnMajor && major.code !== continueOnMajor) continue;
    if (continueOnMajor && major.code === continueOnMajor) continueOnMajor = undefined;
    if (getOnlyMajor && major.code !== getOnlyMajor) continue;
    broadcastToAllWindows("scraper-information", { h: "Getting PhD (" + i + "/" + allPHDMajors.length + ")", t: major.name, p: 0 });
    const majordata = await getMajorDetails(major.code, "PHD");
    createCSVForMajor(major, majordata, "PDMajors");
    majordata.name = major.name;
    //fs.writeFileSync("scrapeResults/PDMajors/" + major.code + ".json", JSON.stringify(majordata, null, 2));
  };
}


module.exports = { generateCSV }