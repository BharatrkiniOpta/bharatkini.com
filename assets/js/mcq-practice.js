const quizOptions = document.querySelector("#quiz-options");
const quizSelection = document.querySelector("#quiz-selection");
const resumePanel = document.querySelector("#resume-panel");
const resumeSummary = document.querySelector("#resume-summary");
const resumeAttempt = document.querySelector("#resume-attempt");
const discardAttempt = document.querySelector("#discard-attempt");
const quizPanel = document.querySelector("#quiz-panel");
const questionNavigator = document.querySelector("#question-navigator");
const resultsPanel = document.querySelector("#results-panel");
const timerDisplay = document.querySelector("#timer-display");
const quizTitle = document.querySelector("#quiz-title");
const quizSource = document.querySelector("#quiz-source");
const questionProgress = document.querySelector("#question-progress");
const answeredCount = document.querySelector("#answered-count");
const questionText = document.querySelector("#question-text");
const optionList = document.querySelector("#option-list");
const prevQuestion = document.querySelector("#prev-question");
const markReview = document.querySelector("#mark-review");
const nextQuestion = document.querySelector("#next-question");
const finishQuiz = document.querySelector("#finish-quiz");
const restartQuiz = document.querySelector("#restart-quiz");
const scoreSummary = document.querySelector("#score-summary");
const reportSearch = document.querySelector("#global-report-search");
const downloadReport = document.querySelector("#download-report");
const resultsTable = document.querySelector("#results-table");
const resultsBody = resultsTable?.querySelector("tbody");
const columnFilters = document.querySelectorAll("[data-column-filter]");
const resetCompletionsButton = document.querySelector("#reset-completions");
const mcqPageHeader = document.querySelector("#mcq-page-header");
const headerTimerWrap = document.querySelector("#header-timer-wrap");
const disclaimerModal = document.querySelector("#disclaimer-modal");
const disclaimerCheckbox = document.querySelector("#disclaimer-checkbox");
const disclaimerDeny = document.querySelector("#disclaimer-deny");
const disclaimerAccept = document.querySelector("#disclaimer-accept");
const disclaimerBanner = document.querySelector("#disclaimer-banner");
const disclaimerBannerText = document.querySelector("#disclaimer-banner-text");

const STORAGE_KEY = "bk-mcq-active-attempt-v1";
const COMPLETION_STORAGE_KEY = "bk-mcq-completions-v1";
const DISCLAIMER_STORAGE_KEY = "bk-mcq-disclaimer-v1";
const ATTEMPT_HISTORY_STATE = { mcqAttemptActive: true };

const DISCLAIMER_SEGMENTS = [
  "⚠ Disclaimer — These MCQ drills are a personal study tool built by Bharat Kini for his own exam prep. Not affiliated with any institution, university, professor, examination body, or educational organisation.",
  "⚠ Disclaimer — Questions were drafted by Bharat with AI assistance, based on publicly available online material. They are not official, verified, or curated by any subject-matter authority.",
  "⚠ Disclaimer — Use entirely at your own risk. Questions, options, and stated answers may contain errors, outdated information, or misinterpretations.",
  "⚠ Disclaimer — Not a substitute for official study materials or coursework. You are strongly encouraged to use professionally prepared materials instead.",
  "⚠ Disclaimer — By using these drills you release Bharat Kini from any liability for incorrect answers, exam performance, lost study time, missed grades, or any other direct or indirect consequence.",
  "⚠ Disclaimer — The author does not recommend using these drills as your primary or sole preparation resource.",
];

let activeQuiz;
let activeQuestionIndex = 0;
let answers = [];
let reviewFlags = [];
let reviewSnapshots = [];
let reviewLeft = [];
let reviewRevisited = [];
let reviewAnswerChanged = [];
let deadline = 0;
let startedAt = 0;
let attemptId = "";
let timerId;
let reportRows = [];
let sortState = { key: "result", direction: "asc" };
let isAttemptActive = false;

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad(minutes)}:${pad(seconds)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char]);
}

function generateAttemptId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2, 10);
  return `attempt-${Date.now()}-${randomPart}`;
}

function validAnswer(value) {
  return ["", "A", "B", "C", "D"].includes(value);
}

function booleanArray(source, length) {
  const values = Array.isArray(source) ? source : [];
  return Array.from({ length }, (_item, index) => Boolean(values[index]));
}

function answerArray(source, length) {
  const values = Array.isArray(source) ? source : [];
  return Array.from({ length }, (_item, index) => {
    const answer = typeof values[index] === "string" ? values[index].toUpperCase() : "";
    return validAnswer(answer) ? answer : "";
  });
}

function sanitizeAttempt(rawAttempt) {
  if (!rawAttempt || typeof rawAttempt !== "object") {
    return null;
  }

  const quiz = QUIZ_BANKS.find((bank) => bank.id === rawAttempt.quizId);
  if (!quiz) {
    return null;
  }

  const questionCount = quiz.questions.length;
  const savedIndex = Number(rawAttempt.activeQuestionIndex);
  const savedDeadline = Number(rawAttempt.deadline);
  const savedStartedAt = Number(rawAttempt.startedAt);
  const sanitizedAnswers = answerArray(rawAttempt.answers, questionCount);
  const sanitizedFlags = booleanArray(rawAttempt.reviewFlags, questionCount);
  const sanitizedSnapshots = answerArray(rawAttempt.reviewSnapshots, questionCount);

  return {
    attemptId: typeof rawAttempt.attemptId === "string" ? rawAttempt.attemptId.slice(0, 80) : generateAttemptId(),
    quizId: quiz.id,
    activeQuestionIndex: Number.isInteger(savedIndex) ? Math.min(questionCount - 1, Math.max(0, savedIndex)) : 0,
    answers: sanitizedAnswers,
    reviewFlags: sanitizedFlags,
    reviewSnapshots: sanitizedSnapshots,
    reviewLeft: booleanArray(rawAttempt.reviewLeft, questionCount),
    reviewRevisited: booleanArray(rawAttempt.reviewRevisited, questionCount),
    reviewAnswerChanged: booleanArray(rawAttempt.reviewAnswerChanged, questionCount),
    deadline: Number.isFinite(savedDeadline) ? savedDeadline : Date.now() + quiz.durationMinutes * 60 * 1000,
    startedAt: Number.isFinite(savedStartedAt) ? savedStartedAt : Date.now(),
  };
}

function loadSavedAttempt() {
  try {
    return sanitizeAttempt(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch (_error) {
    return null;
  }
}

function saveAttempt() {
  if (!activeQuiz || !isAttemptActive) {
    return;
  }

  const attempt = {
    attemptId,
    quizId: activeQuiz.id,
    activeQuestionIndex,
    answers,
    reviewFlags,
    reviewSnapshots,
    reviewLeft,
    reviewRevisited,
    reviewAnswerChanged,
    deadline,
    startedAt,
    savedAt: Date.now(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attempt));
  } catch (_error) {
    showToast("Progress could not be saved on this browser.");
  }
}

function clearSavedAttempt() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_error) {
    return;
  }
}

function updateTimer() {
  const remaining = deadline - Date.now();
  timerDisplay.textContent = formatTime(remaining);

  if (remaining <= 0) {
    window.clearInterval(timerId);
    finishAttempt("Time is up.");
  }
}

function renderSavedAttemptNotice() {
  const savedAttempt = loadSavedAttempt();

  if (!savedAttempt) {
    resumePanel.hidden = true;
    return;
  }

  const quiz = QUIZ_BANKS.find((bank) => bank.id === savedAttempt.quizId);
  const answeredTotal = savedAttempt.answers.filter(Boolean).length;
  const flaggedTotal = savedAttempt.reviewFlags.filter(Boolean).length;
  const remaining = savedAttempt.deadline - Date.now();
  const timingText = remaining > 0 ? `${formatTime(remaining)} remaining` : "timer expired, resume to view results";
  resumeSummary.textContent = `${quiz.title}: question ${savedAttempt.activeQuestionIndex + 1} of ${quiz.questions.length}, ${answeredTotal} answered, ${flaggedTotal} marked, ${timingText}.`;
  resumeAttempt.textContent = remaining > 0 ? "Resume" : "View results";
  resumePanel.hidden = false;
}

function loadCompletions() {
  try {
    const raw = JSON.parse(localStorage.getItem(COMPLETION_STORAGE_KEY));
    return raw && typeof raw === "object" ? raw : {};
  } catch (_error) {
    return {};
  }
}

function saveCompletion(quizId, payload) {
  const all = loadCompletions();
  all[quizId] = payload;
  try {
    localStorage.setItem(COMPLETION_STORAGE_KEY, JSON.stringify(all));
  } catch (_error) {
    // localStorage may be unavailable in private mode; ignore.
  }
}

function clearAllCompletions() {
  try {
    localStorage.removeItem(COMPLETION_STORAGE_KEY);
  } catch (_error) {
    // ignore
  }
}

// ── Disclaimer ───────────────────────────────────────────────

function loadDisclaimerStatus() {
  try {
    return localStorage.getItem(DISCLAIMER_STORAGE_KEY);
  } catch (_error) {
    return null;
  }
}

function saveDisclaimerAccepted() {
  try {
    localStorage.setItem(DISCLAIMER_STORAGE_KEY, "accepted");
  } catch (_error) {
    // ignore — modal will reappear next visit but that's acceptable
  }
}

let bannerSegmentIndex = 0;
let bannerRotateId;
let bannerFadeId;

function rotateBannerSegment() {
  if (!disclaimerBannerText) {
    return;
  }

  disclaimerBannerText.classList.add("is-fading");
  bannerFadeId = window.setTimeout(() => {
    bannerSegmentIndex = (bannerSegmentIndex + 1) % DISCLAIMER_SEGMENTS.length;
    disclaimerBannerText.textContent = DISCLAIMER_SEGMENTS[bannerSegmentIndex];
    disclaimerBannerText.classList.remove("is-fading");
  }, 400);
}

function stopRotatingBanner() {
  window.clearInterval(bannerRotateId);
  window.clearTimeout(bannerFadeId);
  if (disclaimerBannerText) {
    disclaimerBannerText.classList.remove("is-fading");
  }
}

function startRotatingBanner() {
  if (!disclaimerBanner || !disclaimerBannerText) {
    return;
  }

  stopRotatingBanner();
  bannerSegmentIndex = 0;
  disclaimerBannerText.textContent = DISCLAIMER_SEGMENTS[0];
  disclaimerBanner.hidden = false;
  bannerRotateId = window.setInterval(rotateBannerSegment, 5000);
}

function checkDisclaimer() {
  if (loadDisclaimerStatus() === "accepted") {
    startRotatingBanner();
  } else if (disclaimerModal) {
    disclaimerModal.hidden = false;
    // Move keyboard focus into the modal so screen-reader and keyboard users
    // land inside it rather than tabbing through the obscured page behind it.
    disclaimerDeny?.focus();
  }
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${pad(m)}:${pad(s)}`;
}

function renderQuizChoices() {
  const savedAttempt = loadSavedAttempt();
  const completions = loadCompletions();
  const inProgressId = savedAttempt ? savedAttempt.quizId : null;

  const rowsHtml = QUIZ_BANKS.map((quiz, index) => {
    const completion = completions[quiz.id];
    const isInProgress = quiz.id === inProgressId;
    const rowClasses = ["mcq-drill-row"];
    if (isInProgress) rowClasses.push("is-in-progress");

    const lastCompletionCell = isInProgress
      ? `<span class="mcq-resume-tag">Resume ⟳</span>`
      : completion
        ? (() => {
            const attempted = completion.attempted ?? completion.total;
            const scoreStr = `${completion.correct}/${completion.total} correct`;
            const attemptedStr = attempted < completion.total
              ? `<span class="mcq-completion-attempted">${attempted} answered</span>`
              : "";
            return `<span class="mcq-completion"><strong>${escapeHtml(formatDuration(completion.durationSeconds))}</strong><span class="mcq-completion-score">${escapeHtml(scoreStr)}</span>${attemptedStr}</span>`;
          })()
        : `<span class="mcq-empty">—</span>`;

    const actionLabel = isInProgress ? "Resume" : "Start drill";
    const actionClass = isInProgress ? "button button--secondary mcq-action-button" : "button button--primary mcq-action-button";
    const hasDownloadData = isInProgress || Boolean(completion && Array.isArray(completion.rows));
    const downloadDisabledAttr = hasDownloadData ? "" : "disabled";

    return `
      <tr class="${rowClasses.join(" ")}">
        <td data-label="#"><span class="mcq-drill-number">${index + 1}</span></td>
        <td data-label="Drill">
          <strong>${escapeHtml(quiz.title.replace(/^Drill \d+ — /, ""))}</strong>
          <span class="mcq-drill-source">${escapeHtml(quiz.source)}</span>
          <span class="mcq-drill-description">${escapeHtml(quiz.description)}</span>
        </td>
        <td data-label="Difficulty">
          <span class="mcq-difficulty-stars" aria-label="${escapeHtml(quiz.difficulty.length + ' of 5 stars')}">${escapeHtml(quiz.difficulty)}</span>
          <span class="mcq-difficulty-label">${escapeHtml(quiz.difficultyLabel)}</span>
        </td>
        <td data-label="Use it for">${escapeHtml(quiz.useCase)}</td>
        <td data-label="Questions">${quiz.questions.length}</td>
        <td data-label="Time limit">${quiz.durationMinutes} min</td>
        <td data-label="Last completion">${lastCompletionCell}</td>
        <td data-label="Actions">
          <div class="mcq-action-buttons">
            <button class="${actionClass}" type="button" data-start-quiz="${escapeHtml(quiz.id)}">${actionLabel}</button>
            <span class="mcq-tooltip-wrap"${hasDownloadData ? "" : ` data-tooltip="Start the drill first to enable this download"`}>
              <button class="button button--secondary mcq-action-button" type="button" data-download-quiz="${escapeHtml(quiz.id)}" ${downloadDisabledAttr}>Download report</button>
            </span>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  quizOptions.innerHTML = `
    <table class="mcq-drill-table">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Drill</th>
          <th scope="col">Difficulty</th>
          <th scope="col">Use it for</th>
          <th scope="col">Questions</th>
          <th scope="col">Time limit</th>
          <th scope="col">Last completion</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

// Restore all mutable attempt state from a sanitized attempt object.
// Used by both beginAttempt (live resume) and the expired-timer resume path.
function restoreAttemptState(attempt) {
  activeQuiz = QUIZ_BANKS.find((quiz) => quiz.id === attempt.quizId);
  attemptId = attempt.attemptId;
  activeQuestionIndex = attempt.activeQuestionIndex;
  answers = attempt.answers;
  reviewFlags = attempt.reviewFlags;
  reviewSnapshots = attempt.reviewSnapshots;
  reviewLeft = attempt.reviewLeft;
  reviewRevisited = attempt.reviewRevisited;
  reviewAnswerChanged = attempt.reviewAnswerChanged;
  deadline = attempt.deadline;
  startedAt = attempt.startedAt;
}

function beginAttempt(attempt) {
  restoreAttemptState(attempt);

  if (!activeQuiz) {
    return;
  }

  isAttemptActive = true;

  window.clearInterval(timerId);
  timerId = window.setInterval(updateTimer, 1000);
  updateTimer();

  quizSelection.hidden = true;
  resumePanel.hidden = true;
  resultsPanel.hidden = true;
  quizPanel.hidden = false;
  if (headerTimerWrap) headerTimerWrap.hidden = false;
  if (mcqPageHeader) mcqPageHeader.hidden = true;
  stopRotatingBanner();
  if (disclaimerBanner) disclaimerBanner.hidden = true;
  quizTitle.textContent = activeQuiz.title;
  quizSource.textContent = activeQuiz.source;
  history.pushState(ATTEMPT_HISTORY_STATE, "", window.location.href);
  renderQuestion();
  saveAttempt();
}

function startQuiz(quizId) {
  const existingAttempt = loadSavedAttempt();

  if (existingAttempt && existingAttempt.quizId !== quizId) {
    const shouldReplace = window.confirm("Starting this drill will discard your saved in-progress attempt. Continue?");

    if (!shouldReplace) {
      return;
    }

    clearSavedAttempt();
  }

  const quiz = QUIZ_BANKS.find((bank) => bank.id === quizId);

  if (!quiz) {
    return;
  }

  beginAttempt({
    attemptId: generateAttemptId(),
    quizId: quiz.id,
    activeQuestionIndex: 0,
    answers: Array(quiz.questions.length).fill(""),
    reviewFlags: Array(quiz.questions.length).fill(false),
    reviewSnapshots: Array(quiz.questions.length).fill(""),
    reviewLeft: Array(quiz.questions.length).fill(false),
    reviewRevisited: Array(quiz.questions.length).fill(false),
    reviewAnswerChanged: Array(quiz.questions.length).fill(false),
    deadline: Date.now() + quiz.durationMinutes * 60 * 1000,
    startedAt: Date.now(),
  });
}

function selectedOptionMarkup(question, selected) {
  return question.options.map((option) => {
    const id = `q${activeQuestionIndex}-${option.label}`;
    const checked = selected === option.label ? "checked" : "";
    return `
      <label class="mcq-option" for="${escapeHtml(id)}">
        <input id="${escapeHtml(id)}" type="radio" name="answer" value="${escapeHtml(option.label)}" ${checked} />
        <span class="mcq-option__label">${escapeHtml(option.label)}</span>
        <span>${escapeHtml(option.text)}</span>
      </label>
    `;
  }).join("");
}

function renderQuestionNavigator() {
  questionNavigator.innerHTML = activeQuiz.questions.map((_question, index) => {
    const stateClasses = ["mcq-question-jump"];

    if (index === activeQuestionIndex) {
      stateClasses.push("is-current");
    }

    if (answers[index]) {
      stateClasses.push("is-answered");
    }

    if (reviewFlags[index]) {
      stateClasses.push("is-flagged");
    }

    const labelParts = [`Question ${index + 1}`];

    if (answers[index]) {
      labelParts.push("answered");
    }

    if (reviewFlags[index]) {
      labelParts.push("marked for review");
    }

    return `<button class="${stateClasses.join(" ")}" type="button" data-jump-question="${index}" aria-label="${labelParts.join(", ")}" aria-current="${index === activeQuestionIndex ? "step" : "false"}">${index + 1}</button>`;
  }).join("");
}

function renderQuestion() {
  const question = activeQuiz.questions[activeQuestionIndex];
  const selected = answers[activeQuestionIndex];
  const total = activeQuiz.questions.length;
  const answeredTotal = answers.filter(Boolean).length;
  const flaggedTotal = reviewFlags.filter(Boolean).length;

  questionProgress.textContent = `Question ${activeQuestionIndex + 1} of ${total}`;
  answeredCount.textContent = `${answeredTotal} answered, ${flaggedTotal} marked`;
  questionText.textContent = question.question;
  optionList.innerHTML = selectedOptionMarkup(question, selected);
  prevQuestion.disabled = activeQuestionIndex === 0;
  nextQuestion.textContent = activeQuestionIndex === total - 1 ? "Submit" : "Next";
  markReview.setAttribute("aria-pressed", String(reviewFlags[activeQuestionIndex]));
  markReview.textContent = reviewFlags[activeQuestionIndex] ? "Marked for review" : "Mark for review";
  renderQuestionNavigator();
}

function updateReviewAnswerChange(index, nextAnswer) {
  if (!reviewFlags[index]) {
    return;
  }

  const snapshot = reviewSnapshots[index] || "";
  reviewAnswerChanged[index] = Boolean(nextAnswer) && nextAnswer !== snapshot;
}

function storeSelectedAnswer() {
  const selected = optionList.querySelector("input[name='answer']:checked");
  const nextAnswer = selected ? selected.value : "";
  answers[activeQuestionIndex] = nextAnswer;
  updateReviewAnswerChange(activeQuestionIndex, nextAnswer);
  saveAttempt();
  renderQuestionNavigator();
}

function noteLeavingQuestion(index) {
  if (reviewFlags[index]) {
    reviewLeft[index] = true;
  }
}

function noteArrivingQuestion(index) {
  if (reviewFlags[index] && reviewLeft[index]) {
    reviewRevisited[index] = true;
  }
}

function goToQuestion(index) {
  const previousIndex = activeQuestionIndex;
  const nextIndex = Math.min(activeQuiz.questions.length - 1, Math.max(0, index));
  storeSelectedAnswer(); // also calls saveAttempt()

  if (nextIndex !== previousIndex) {
    noteLeavingQuestion(previousIndex);
    activeQuestionIndex = nextIndex;
    noteArrivingQuestion(activeQuestionIndex);
    saveAttempt(); // persist updated index + review flags
  }

  renderQuestion();
}

function moveQuestion(delta) {
  if (delta > 0 && activeQuestionIndex === activeQuiz.questions.length - 1) {
    // submitAttempt() calls storeSelectedAnswer() internally.
    submitAttempt();
    return;
  }

  // goToQuestion() calls storeSelectedAnswer() internally.
  goToQuestion(activeQuestionIndex + delta);
}

function toggleReviewFlag() {
  const nextFlagState = !reviewFlags[activeQuestionIndex];
  reviewFlags[activeQuestionIndex] = nextFlagState;

  if (nextFlagState) {
    reviewSnapshots[activeQuestionIndex] = answers[activeQuestionIndex] || "";
    reviewLeft[activeQuestionIndex] = false;
    reviewRevisited[activeQuestionIndex] = false;
    reviewAnswerChanged[activeQuestionIndex] = false;
  }

  saveAttempt();
  renderQuestion();
}

function submitAttempt() {
  storeSelectedAnswer();
  const unansweredTotal = answers.filter((answer) => !answer).length;
  const flaggedTotal = reviewFlags.filter(Boolean).length;

  if (unansweredTotal || flaggedTotal) {
    const parts = [];
    if (unansweredTotal) parts.push(`${unansweredTotal} unanswered`);
    if (flaggedTotal) parts.push(`${flaggedTotal} marked for review`);
    const shouldSubmit = window.confirm(`You have ${parts.join(" and ")}. Submit anyway?`);

    if (!shouldSubmit) {
      return;
    }
  }

  finishAttempt("Attempt submitted.");
}

function optionText(question, label) {
  const option = question.options.find((item) => item.label === label);
  return option ? `${option.label}) ${option.text}` : "Not answered";
}

function reviewStatus(index, selected) {
  if (!reviewFlags[index]) {
    return "Not marked for review";
  }

  if (reviewLeft[index] && !reviewRevisited[index]) {
    return "Marked for review and not visited later";
  }

  if (reviewAnswerChanged[index]) {
    return "Marked for review and answer changed";
  }

  if (reviewRevisited[index] && !reviewAnswerChanged[index]) {
    return "Marked for review and answer not changed";
  }

  if (selected) {
    return "Marked for review and answered";
  }

  return "Marked for review and not answered";
}

function resultLabel(question, selected) {
  if (!selected) {
    return "Unanswered";
  }

  return selected === question.answer ? "Right" : "Wrong";
}

function resultSortValue(result) {
  if (result === "Wrong") {
    return "0-wrong";
  }

  if (result === "Unanswered") {
    return "1-unanswered";
  }

  return "2-right";
}

function buildReportRows() {
  return activeQuiz.questions.map((question, index) => {
    const selected = answers[index] || "";
    const result = resultLabel(question, selected);

    return {
      question: `Q${question.sourceNumber}. ${question.question}`,
      options: question.options.map((option) => `${option.label}) ${option.text}`).join(" | "),
      selected: selected ? optionText(question, selected) : "Not answered",
      answer: optionText(question, question.answer),
      reviewStatus: reviewStatus(index, selected),
      result,
      isCorrect: result === "Right",
      isWrong: result === "Wrong",
      resultSort: resultSortValue(result),
    };
  });
}

function finishAttempt(message) {
  if (!activeQuiz) {
    return;
  }

  storeSelectedAnswer();
  window.clearInterval(timerId);
  isAttemptActive = false;
  clearSavedAttempt();
  if (headerTimerWrap) headerTimerWrap.hidden = true;
  quizPanel.hidden = true;
  resumePanel.hidden = true;
  resultsPanel.hidden = false;

  reportRows = buildReportRows();
  const correct = reportRows.filter((row) => row.isCorrect).length;
  const attempted = reportRows.filter((row) => row.result !== "Unanswered").length;
  const total = reportRows.length;
  const percent = Math.round((correct / total) * 100);
  const durationSeconds = Math.max(0, (Date.now() - startedAt) / 1000);

  saveCompletion(activeQuiz.id, {
    durationSeconds,
    completedAt: Date.now(),
    correct,
    attempted,
    total,
    // Store pre-computed rows so the drill-table download button works after completion.
    rows: reportRows.map((r) => ({
      question: r.question,
      options: r.options,
      selected: r.selected,
      answer: r.answer,
      reviewStatus: r.reviewStatus,
      result: r.result,
    })),
  });

  scoreSummary.textContent = `${message} Score: ${correct} / ${total} (${percent}%). Time: ${formatDuration(durationSeconds)}. Attempt ID: ${attemptId}.`;
  reportSearch.value = "";
  columnFilters.forEach((input) => {
    input.value = "";
  });
  sortState = { key: "result", direction: "asc" };
  renderReportTable();
}

function normalized(value) {
  return String(value || "").toLowerCase().trim();
}

function filteredRows() {
  const globalNeedle = normalized(reportSearch.value);
  const filters = Array.from(columnFilters).map((input) => ({
    key: input.dataset.columnFilter,
    value: normalized(input.value),
  }));

  return reportRows.filter((row) => {
    const values = [row.question, row.options, row.selected, row.answer, row.reviewStatus, row.result];
    const matchesGlobal = !globalNeedle || values.some((value) => normalized(value).includes(globalNeedle));
    const matchesColumns = filters.every((filter) => !filter.value || normalized(row[filter.key]).includes(filter.value));
    return matchesGlobal && matchesColumns;
  });
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const left = sortState.key === "result" ? a.resultSort : normalized(a[sortState.key]);
    const right = sortState.key === "result" ? b.resultSort : normalized(b[sortState.key]);
    const result = left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
    return sortState.direction === "asc" ? result : -result;
  });
}

function resultClass(row) {
  if (row.result === "Wrong") {
    return "is-wrong";
  }

  if (row.result === "Unanswered") {
    return "is-unanswered";
  }

  return "is-right";
}

function renderReportTable() {
  const rows = sortRows(filteredRows());
  resultsBody.innerHTML = rows.map((row) => `
    <tr class="${resultClass(row)}">
      <td>${escapeHtml(row.question)}</td>
      <td>${escapeHtml(row.options)}</td>
      <td>${escapeHtml(row.selected)}</td>
      <td>${escapeHtml(row.answer)}</td>
      <td>${escapeHtml(row.reviewStatus)}</td>
      <td><span class="mcq-result-pill ${resultClass(row)}">${escapeHtml(row.result)}</span></td>
    </tr>
  `).join("");
}

function crc32(bytes) {
  let crc = -1;

  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ -1) >>> 0;
}

function littleEndian(value, byteCount) {
  const bytes = [];

  for (let index = 0; index < byteCount; index += 1) {
    bytes.push((value >>> (index * 8)) & 0xff);
  }

  return bytes;
}

function textBytes(value) {
  return new TextEncoder().encode(value);
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = textBytes(file.name);
    const contentBytes = textBytes(file.content);
    const checksum = crc32(contentBytes);
    const localHeader = new Uint8Array([
      ...littleEndian(0x04034b50, 4),
      ...littleEndian(20, 2),
      ...littleEndian(0, 2),
      ...littleEndian(0, 2),
      ...littleEndian(0, 2),
      ...littleEndian(0, 2),
      ...littleEndian(checksum, 4),
      ...littleEndian(contentBytes.length, 4),
      ...littleEndian(contentBytes.length, 4),
      ...littleEndian(nameBytes.length, 2),
      ...littleEndian(0, 2),
    ]);
    localParts.push(localHeader, nameBytes, contentBytes);

    const centralHeader = new Uint8Array([
      ...littleEndian(0x02014b50, 4),
      ...littleEndian(20, 2),
      ...littleEndian(20, 2),
      ...littleEndian(0, 2),
      ...littleEndian(0, 2),
      ...littleEndian(0, 2),
      ...littleEndian(0, 2),
      ...littleEndian(checksum, 4),
      ...littleEndian(contentBytes.length, 4),
      ...littleEndian(contentBytes.length, 4),
      ...littleEndian(nameBytes.length, 2),
      ...littleEndian(0, 2),
      ...littleEndian(0, 2),
      ...littleEndian(0, 2),
      ...littleEndian(0, 2),
      ...littleEndian(0, 4),
      ...littleEndian(offset, 4),
    ]);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + contentBytes.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array([
    ...littleEndian(0x06054b50, 4),
    ...littleEndian(0, 2),
    ...littleEndian(0, 2),
    ...littleEndian(files.length, 2),
    ...littleEndian(files.length, 2),
    ...littleEndian(centralSize, 4),
    ...littleEndian(offset, 4),
    ...littleEndian(0, 2),
  ]);

  return new Blob([...localParts, ...centralParts, endRecord], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function spreadsheetCell(value) {
  return `<c t="inlineStr"><is><t>${escapeHtml(value)}</t></is></c>`;
}

function spreadsheetRow(values, rowIndex) {
  return `<row r="${rowIndex}">${values.map(spreadsheetCell).join("")}</row>`;
}

function createXlsxBlob(rows) {
  const headers = ["Question", "4 options", "Selected option", "Right answer", "Review status", "Result"];
  const sheetRows = [headers, ...rows.map((row) => [row.question, row.options, row.selected, row.answer, row.reviewStatus, row.result])]
    .map((values, index) => spreadsheetRow(values, index + 1))
    .join("");
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Attempt Report" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

  return createZip([
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rels },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    { name: "xl/worksheets/sheet1.xml", content: worksheet },
  ]);
}

// Build report rows from any saved attempt for the drill-table download button.
// Unanswered questions are labelled "Unattempted" rather than "Not answered".
function buildDownloadRowsFromAttempt(quiz, attempt) {
  return quiz.questions.map((question, index) => {
    const sel = attempt.answers[index] || "";
    const flagged = attempt.reviewFlags[index];
    const left = attempt.reviewLeft[index];
    const revisited = attempt.reviewRevisited[index];
    const changed = attempt.reviewAnswerChanged[index];

    let rvStatus;
    if (!flagged) {
      rvStatus = "Not marked for review";
    } else if (left && !revisited) {
      rvStatus = "Marked for review and not visited later";
    } else if (changed) {
      rvStatus = "Marked for review and answer changed";
    } else if (revisited && !changed) {
      rvStatus = "Marked for review and answer not changed";
    } else if (sel) {
      rvStatus = "Marked for review and answered";
    } else {
      rvStatus = "Marked for review and not answered";
    }

    return {
      question: `Q${question.sourceNumber}. ${question.question}`,
      options: question.options.map((o) => `${o.label}) ${o.text}`).join(" | "),
      selected: sel ? optionText(question, sel) : "Unattempted",
      answer: optionText(question, question.answer),
      reviewStatus: rvStatus,
      result: sel ? (sel === question.answer ? "Right" : "Wrong") : "Unattempted",
    };
  });
}

// Download the Excel report for a drill directly from the drill-selection table.
// Works for both in-progress (saved attempt) and completed (stored rows) drills.
function downloadExcelForQuiz(quizId) {
  const quiz = QUIZ_BANKS.find((b) => b.id === quizId);
  if (!quiz) return;

  const savedAttempt = loadSavedAttempt();
  const completions = loadCompletions();
  const completion = completions[quizId];

  let rows;
  if (savedAttempt && savedAttempt.quizId === quizId) {
    rows = buildDownloadRowsFromAttempt(quiz, savedAttempt);
  } else if (completion && Array.isArray(completion.rows)) {
    rows = completion.rows;
  } else {
    return;
  }

  const blob = createXlsxBlob(rows);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${quiz.id}-report.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadExcel() {
  const rows = sortRows(filteredRows());
  const blob = createXlsxBlob(rows);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${activeQuiz.id}-${attemptId}-report.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function handleBrowserBack() {
  if (!isAttemptActive) {
    return;
  }

  const shouldLeave = window.confirm("Your attempt is saved locally. Leave this attempt page? Use the question number bar to move between questions.");

  if (!shouldLeave) {
    history.pushState(ATTEMPT_HISTORY_STATE, "", window.location.href);
    return;
  }

  saveAttempt();
  isAttemptActive = false;
  window.clearInterval(timerId);
  history.back();
}

quizOptions?.addEventListener("click", (event) => {
  const startButton = event.target.closest("[data-start-quiz]");
  if (startButton) {
    startQuiz(startButton.dataset.startQuiz);
    return;
  }

  const downloadButton = event.target.closest("[data-download-quiz]");
  if (downloadButton && !downloadButton.disabled) {
    downloadExcelForQuiz(downloadButton.dataset.downloadQuiz);
  }
});

questionNavigator?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-jump-question]");

  if (button) {
    goToQuestion(Number(button.dataset.jumpQuestion));
  }
});

optionList?.addEventListener("change", storeSelectedAnswer);
prevQuestion?.addEventListener("click", () => moveQuestion(-1));
markReview?.addEventListener("click", toggleReviewFlag);
nextQuestion?.addEventListener("click", () => moveQuestion(1));
finishQuiz?.addEventListener("click", submitAttempt);
resumeAttempt?.addEventListener("click", () => {
  const savedAttempt = loadSavedAttempt();

  if (savedAttempt) {
    if (savedAttempt.deadline <= Date.now()) {
      restoreAttemptState(savedAttempt);
      finishAttempt("Time is up.");
      return;
    }

    beginAttempt(savedAttempt);
  }
});
discardAttempt?.addEventListener("click", () => {
  const shouldDiscard = window.confirm("Discard the saved attempt on this device?");

  if (shouldDiscard) {
    clearSavedAttempt();
    renderSavedAttemptNotice();
    renderQuizChoices();
  }
});
restartQuiz?.addEventListener("click", () => {
  window.clearInterval(timerId);
  isAttemptActive = false;
  activeQuiz = undefined;
  timerDisplay.textContent = "60:00";
  if (headerTimerWrap) headerTimerWrap.hidden = true;
  if (mcqPageHeader) mcqPageHeader.hidden = false;
  if (loadDisclaimerStatus() === "accepted") startRotatingBanner();
  resultsPanel.hidden = true;
  quizSelection.hidden = false;
  renderQuizChoices();
  renderSavedAttemptNotice();
});
resetCompletionsButton?.addEventListener("click", () => {
  const ok = window.confirm("Clear all saved completion times for the 5 drills on this device?");
  if (!ok) return;
  clearAllCompletions();
  renderQuizChoices();
});
reportSearch?.addEventListener("input", renderReportTable);
columnFilters.forEach((input) => input.addEventListener("input", renderReportTable));
downloadReport?.addEventListener("click", downloadExcel);
resultsTable?.querySelectorAll("thead tr:first-child th[data-sort]").forEach((header) => {
  header.tabIndex = 0;
  header.setAttribute("role", "button");
  header.addEventListener("click", () => {
    const key = header.dataset.sort;
    sortState = {
      key,
      direction: sortState.key === key && sortState.direction === "asc" ? "desc" : "asc",
    };
    renderReportTable();
  });
  header.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      header.click();
    }
  });
});

window.addEventListener("beforeunload", (event) => {
  if (!isAttemptActive) {
    return;
  }

  saveAttempt();
  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("pagehide", saveAttempt);
window.addEventListener("popstate", handleBrowserBack);

disclaimerCheckbox?.addEventListener("change", () => {
  if (disclaimerAccept) {
    disclaimerAccept.disabled = !disclaimerCheckbox.checked;
  }
});

function denyDisclaimer() {
  // Try to close the tab (works when opened from another page);
  // fall back to a blank page — browsers don't expose the home URL to JS.
  window.close();
  window.location.replace("about:blank");
}

disclaimerModal?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    denyDisclaimer();
  }
});

disclaimerDeny?.addEventListener("click", denyDisclaimer);

disclaimerAccept?.addEventListener("click", () => {
  saveDisclaimerAccepted();
  if (disclaimerModal) {
    disclaimerModal.hidden = true;
  }
  startRotatingBanner();
});

// Pause rotation while hovering (full text shown via CSS); resume on leave.
disclaimerBanner?.addEventListener("mouseenter", () => {
  stopRotatingBanner(); // cancels interval AND any pending fade setTimeout
});

disclaimerBanner?.addEventListener("mouseleave", () => {
  bannerRotateId = window.setInterval(rotateBannerSegment, 5000);
});

checkDisclaimer();
renderQuizChoices();
renderSavedAttemptNotice();
