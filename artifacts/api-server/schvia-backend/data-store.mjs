import { mkdir, open, readFile, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

function seedData() {
  return {
    school: {
      id: "school-northbridge",
      name: "Northbridge School",
      location: "Accra, Ghana",
      term: "2026 / 27 academic year",
      createdAt: new Date().toISOString(),
    },
    users: [
      { id: "user-principal", name: "Amara Mensah", email: "amara@northbridge.edu", role: "principal", status: "active", classIds: [] },
      { id: "user-teacher", name: "Kofi Owusu", email: "kofi@northbridge.edu", role: "teacher", status: "active", classIds: ["class-primary-5"] },
    ],
    classes: [
      { id: "class-primary-5", name: "Primary 5", year: "2026 / 27", teacherIds: ["user-teacher"] },
      { id: "class-primary-6", name: "Primary 6", year: "2026 / 27", teacherIds: [] },
    ],
    students: [
      { id: "student-ama", studentId: "NBS-001", name: "Ama Boateng", gender: "Female", classId: "class-primary-5", guardian: "Adwoa Boateng", status: "enrolled" },
      { id: "student-kojo", studentId: "NBS-002", name: "Kojo Asante", gender: "Male", classId: "class-primary-5", guardian: "Yaw Asante", status: "enrolled" },
      { id: "student-abena", studentId: "NBS-003", name: "Abena Owusu", gender: "Female", classId: "class-primary-5", guardian: "Mavis Owusu", status: "enrolled" },
      { id: "student-nana", studentId: "NBS-004", name: "Nana Mensah", gender: "Male", classId: "class-primary-5", guardian: "Esi Mensah", status: "enrolled" },
      { id: "student-yaw", studentId: "NBS-005", name: "Yaw Ofori", gender: "Male", classId: "class-primary-6", guardian: "Akosua Ofori", status: "enrolled" },
    ],
    attendance: {},
    invitations: [],
    audit: [],
  };
}

function normalizeData(data) {
  const primarySchool = data.school || {
    id: "school-northbridge",
    name: "Northbridge School",
    location: "",
    term: "",
    createdAt: new Date().toISOString(),
  };
  data.schools ||= [primarySchool];
  if (!data.schools.some((school) => school.id === primarySchool.id)) data.schools.unshift(primarySchool);
  data.memberships ||= [];
  data.users ||= [];
  data.classes ||= [];
  data.students ||= [];
  data.attendance ||= {};
  data.invitations ||= [];
  data.audit ||= [];
  for (const user of data.users) {
    user.schoolId ||= primarySchool.id;
    const role = user.role === "teacher" ? "teacher" : user.role === "principal" ? "principal" : "admin";
    if (!data.memberships.some((membership) => membership.userId === user.id && membership.schoolId === user.schoolId)) {
      data.memberships.push({ id: `membership-${user.id}`, userId: user.id, schoolId: user.schoolId, role, status: user.status || "active", createdAt: user.createdAt || new Date().toISOString() });
    }
  }
  for (const item of data.classes) item.schoolId ||= primarySchool.id;
  for (const item of data.students) item.schoolId ||= primarySchool.id;
  for (const item of data.invitations) item.schoolId ||= primarySchool.id;
  for (const item of data.audit) item.schoolId ||= primarySchool.id;
  for (const item of Object.values(data.attendance)) item.schoolId ||= primarySchool.id;
}

function defaultDataPath() {
  return process.env.DATA_PATH || join(root, "data", "schvia.json");
}

export function createPersistence({ dataPath = defaultDataPath() } = {}) {
  let data;

  async function writeData() {
    const directory = dirname(dataPath);
    await mkdir(directory, { recursive: true });
    const tempPath = `${dataPath}.tmp`;
    const content = JSON.stringify(data, null, 2);
    const handle = await open(tempPath, "w");
    try {
      await handle.writeFile(content);
      await handle.datasync();
    } finally {
      await handle.close();
    }
    await rename(tempPath, dataPath);
  }

  async function loadData() {
    try {
      data = JSON.parse(await readFile(dataPath, "utf8"));
    } catch {
      data = seedData();
      await writeData();
    }
    normalizeData(data);
    return data;
  }

  async function saveData() {
    await writeData();
    return data;
  }

  async function ready() {
    try {
      await stat(dataPath);
      return true;
    } catch {
      return false;
    }
  }

  return {
    get data() {
      return data;
    },
    loadData,
    saveData,
    ready,
  };
}
