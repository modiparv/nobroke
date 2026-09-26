import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GOAL_MAP, GOALS, refreshGoalNames } from "./goals.ts";

test("the catalogue: permanent, unique ids; the student-sized goals; fixed dates where life sets them", () => {
  const ids = GOALS.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  assert.equal(GOAL_MAP.bike.name, "Bike or scooter");
  assert.equal(GOAL_MAP.bike.targetToday, 100000);
  assert.equal(GOAL_MAP.college.name, "College fees");
  assert.equal(GOAL_MAP.college.targetToday, 150000);
  assert.equal(GOAL_MAP.course.name, "Upskill or a course");
  assert.equal(GOAL_MAP.course.targetToday, 50000);
  for (const id of ["bike", "college", "course"]) assert.equal(GOAL_MAP[id].horizonYears, 1);
  assert.equal(GOAL_MAP.education.name, "Study abroad", "renamed, id kept");
  assert.deepEqual(
    GOALS.filter((g) => g.dateFixed).map((g) => g.id),
    ["college", "wedding", "child"],
  );
});

test("a saved plan's goal names follow the catalogue; unknown ids are left alone", () => {
  const saved = [
    { id: "education", name: "Study abroad or upskill", emoji: "🎓", targetToday: 4000000, horizonYears: 5, tenureConfirmed: true, notes: "keep" },
    { id: "custom-1", name: "Mom's birthday", emoji: "🎂", targetToday: 5000, horizonYears: 1, tenureConfirmed: false },
  ];
  const fresh = refreshGoalNames(saved);
  assert.equal(fresh[0].name, "Study abroad");
  assert.equal(fresh[0].notes, "keep", "everything else on the goal survives");
  assert.equal(fresh[0].targetToday, 4000000, "the person's own target is not reset");
  assert.deepEqual(fresh[1], saved[1]);
});

test("the AI's tool schema accepts exactly the catalogue's ids", () => {
  // api/chat.ts cannot be imported here (it pulls the Groq SDK), so its
  // GOAL_IDS literal is read as text and compared.
  const src = readFileSync(new URL("../../api/chat.ts", import.meta.url), "utf8");
  const block = src.match(/const GOAL_IDS = \[([\s\S]*?)\] as const;/);
  assert.ok(block, "GOAL_IDS literal found");
  const toolIds = [...block![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(toolIds, GOALS.map((g) => g.id).sort());
  // And the labels the model reads name every goal as the catalogue does.
  for (const g of GOALS) assert.ok(src.includes(`${g.id}=${g.name}`), `label for ${g.id}`);
});
