import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/prototypes/universal-board/app.js", import.meta.url), "utf8");
const previewSource = source.slice(source.indexOf("function updateSetupPreview()"), source.indexOf("function startLocalSession("));
const css = readFileSync(new URL("../public/prototypes/universal-board/styles.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/prototypes/universal-board/index.html", import.meta.url), "utf8");

function fixture(mode = "teacher-led") {
  const control = (value) => {
    const label = { hidden: false };
    return { value, disabled: false, closest: (selector) => {
      assert.equal(selector, "label");
      return label;
    } };
  };
  const nodes = {
    setupMode: control(mode), setupTheme: control("cloud-harbor"),
    setupLearning: control("test-pack"), setupOpportunities: control("3"),
    setupPlayerCount: control("2"), setupPreview: { textContent: "" },
  };
  const intro = { textContent: "" };
  const context = {
    nodes, TEACHER_MODE: "teacher-led", playerCount: 2,
    LEARNING_PACKS: { test: { id: "test-pack", title: "测试题库" } },
    learningPack: null, characterAssignments: ["rabbit", "cat"],
    selectedStudentProfiles: () => [{ name: "模拟学生" }],
    studentGameName: (student) => student.name,
    normalizeCharacterAssignments: (assignments) => assignments,
    minimumTurnsForSession: ({ playerCount, minOpportunitiesPerSeat }) => playerCount * minOpportunitiesPerSeat,
    document: { querySelector: (selector) => {
      assert.equal(selector, "#setup-mode-intro");
      return intro;
    } },
  };
  return { nodes, context, intro, update: () => runInNewContext(`${previewSource}\nupdateSetupPreview();`, context) };
}

test("teacher setup hides and disables voice-only fields without needing knowledge data", () => {
  const { nodes, context, intro, update } = fixture();
  context.LEARNING_PACKS = null;
  context.minimumTurnsForSession = () => assert.fail("teacher setup must not calculate reading quotas");
  update();
  for (const control of [nodes.setupLearning, nodes.setupOpportunities]) {
    assert.equal(control.closest("label").hidden, true);
    assert.equal(control.disabled, true);
  }
  assert.equal(nodes.setupTheme.disabled, false);
  assert.equal(nodes.setupMode.disabled, false);
  assert.match(intro.textContent, /题目和活动由老师掌握/);
  assert.match(nodes.setupPreview.textContent, /模拟学生.*老师自由点人.*1–6 课堂骰/);
  assert.doesNotMatch(nodes.setupPreview.textContent, /题卡|朗读|寻宝回合/);
});

test("switching modes restores voice fields and retained selections repeatedly", () => {
  const { nodes, update } = fixture();
  for (let index = 0; index < 3; index += 1) {
    nodes.setupMode.value = "teacher-led";
    update();
    nodes.setupMode.value = "voice";
    update();
    for (const control of [nodes.setupLearning, nodes.setupOpportunities]) {
      assert.equal(control.closest("label").hidden, false);
      assert.equal(control.disabled, false);
    }
    assert.equal(nodes.setupLearning.value, "test-pack");
    assert.equal(nodes.setupOpportunities.value, "3");
    assert.match(nodes.setupPreview.textContent, /每位至少 3 次朗读.*共 6 个寻宝回合.*题卡：测试题库/);
  }
});

test("hidden setup labels override grid display without leaving slots or changing other forms", () => {
  assert.match(css, /\.setup-grid label\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.setup-grid label\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
  const setupGrid = html.slice(html.indexOf('<div class="setup-grid">'), html.indexOf('<section class="character-selection"'));
  assert.equal((setupGrid.match(/<select\b/g) || []).length, 4);
  assert.match(setupGrid, /<label hidden>\s*课堂模式[\s\S]*id="setup-mode"/);
  assert.match(setupGrid, /<label hidden>\s*棋盘主题[\s\S]*id="setup-theme"/);
  assert.match(setupGrid, /教学内容[\s\S]*id="setup-learning"/);
  assert.match(setupGrid, /发言保障[\s\S]*id="setup-opportunities"/);
});

// The UI starts only the teacher harbor mode; archived sessions retain their mode.
test("new games use fixed teacher harbor defaults while voice snapshots still restore", () => {
  assert.match(source, /function startLocalSession\(\{\s*mode = TEACHER_MODE,\s*themeId = "cloud-harbor"/);
  assert.match(source, /nodes\.setupMode\.value = isTeacherSession\(restoredSession\) \? TEACHER_MODE : "voice"/);
  assert.match(html, /<h1 id="setup-title" class="sr-only">/);
  assert.match(html, /id="setup-mode-intro" hidden/);
  assert.match(html, /id="setup-preview" hidden/);
});
