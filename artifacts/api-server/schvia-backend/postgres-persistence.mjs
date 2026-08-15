import { connect, query, ensureDatabaseConfigured } from "./db/index.mjs";
import { randomUUID } from "node:crypto";

function mapTimestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== "object") return {};
  return profile;
}

function classTeacherRows(classes) {
  const rows = [];
  for (const klass of classes) {
    for (const teacherId of Array.isArray(klass.teacherIds) ? klass.teacherIds : []) {
      rows.push({
        id: `class-teacher-${klass.id}-${teacherId}`,
        school_id: klass.schoolId,
        class_id: klass.id,
        user_id: teacherId,
        academic_term_id: klass.academicTermId || null,
        created_at: klass.createdAt ? new Date(klass.createdAt) : new Date(),
        updated_at: klass.updatedAt ? new Date(klass.updatedAt) : new Date(),
      });
    }
  }
  return rows;
}

function classRows(classes, termLookup) {
  return classes.map((klass) => ({
    id: klass.id,
    school_id: klass.schoolId,
    name: klass.name,
    academic_term_id: klass.academicTermId || termLookup.get(`${klass.schoolId}:${klass.year}`) || null,
    status: "active",
    created_at: klass.createdAt ? new Date(klass.createdAt) : new Date(),
    updated_at: klass.updatedAt ? new Date(klass.updatedAt) : new Date(),
  }));
}

function membershipRows(memberships) {
  return memberships.map((membership) => ({
    id: membership.id,
    user_id: membership.userId,
    school_id: membership.schoolId,
    role: membership.role,
    status: membership.status || "active",
    created_at: membership.createdAt ? new Date(membership.createdAt) : new Date(),
    accepted_at: membership.acceptedAt ? new Date(membership.acceptedAt) : null,
    revoked_at: membership.revokedAt ? new Date(membership.revokedAt) : null,
    ended_at: membership.endedAt ? new Date(membership.endedAt) : null,
  }));
}

function schoolRows(schools) {
  return schools.map((school) => ({
    id: school.id,
    name: school.name,
    location: school.location || null,
    status: school.status || "active",
    current_term: school.current_term || school.term || null,
    created_at: school.createdAt ? new Date(school.createdAt) : new Date(),
    updated_at: school.updatedAt ? new Date(school.updatedAt) : new Date(),
    founder_user_id: school.founder_user_id || null,
  }));
}

function userRows(users) {
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status || "active",
    profile: normalizeProfile(user.profile || { role: user.role || null, classIds: Array.isArray(user.classIds) ? user.classIds : [] }),
    created_at: user.createdAt ? new Date(user.createdAt) : new Date(),
    updated_at: user.updatedAt ? new Date(user.updatedAt) : new Date(),
  }));
}

function userCredentialRows(users) {
  return users
    .filter((user) => typeof user.passwordHash === "string" && user.passwordHash.length)
    .map((user) => ({
      user_id: user.id,
      password_hash: user.passwordHash,
      password_algorithm: "scrypt",
      created_at: user.createdAt ? new Date(user.createdAt) : new Date(),
      updated_at: user.updatedAt ? new Date(user.updatedAt) : new Date(),
    }));
}

function invitationRows(invitations) {
  return invitations.map((invite) => ({
    id: invite.id,
    school_id: invite.schoolId,
    name: invite.name,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    invited_at: invite.invitedAt ? new Date(invite.invitedAt) : new Date(),
    code: invite.code,
    accepted_at: invite.acceptedAt ? new Date(invite.acceptedAt) : null,
    revoked_at: invite.revokedAt ? new Date(invite.revokedAt) : null,
    accepted_user_id: invite.acceptedUserId || null,
  }));
}

function auditRows(audit) {
  return audit.map((item) => ({
    id: item.id,
    school_id: item.schoolId,
    actor_id: item.actorId,
    actor_name: item.actorName,
    action: item.action,
    detail: item.detail || null,
    at: item.at ? new Date(item.at) : new Date(),
  }));
}

function academicTermRows(schools, classes) {
  const terms = new Map();
  for (const school of schools) {
    const name = school.current_term || school.term;
    if (name) {
      terms.set(`${school.id}:${name}`, {
        id: randomUUID(),
        school_id: school.id,
        name,
        starts_at: null,
        ends_at: null,
        status: "active",
        created_at: school.createdAt ? new Date(school.createdAt) : new Date(),
        updated_at: school.updatedAt ? new Date(school.updatedAt) : new Date(),
      });
    }
  }
  for (const klass of classes) {
    const key = `${klass.schoolId}:${klass.year || klass.academicTermName || ""}`;
    if (!terms.has(key) && klass.year) {
      terms.set(key, {
        id: randomUUID(),
        school_id: klass.schoolId,
        name: klass.year,
        starts_at: null,
        ends_at: null,
        status: "active",
        created_at: klass.createdAt ? new Date(klass.createdAt) : new Date(),
        updated_at: klass.updatedAt ? new Date(klass.updatedAt) : new Date(),
      });
    }
  }
  return [...terms.values()];
}

function studentRows(students) {
  return students.map((student) => ({
    id: student.id,
    school_id: student.schoolId,
    student_number: student.studentId || student.student_number,
    name: student.name,
    gender: student.gender || null,
    status: student.status || "enrolled",
    current_class_id: student.classId || null,
    created_at: student.createdAt ? new Date(student.createdAt) : new Date(),
    updated_at: student.updatedAt ? new Date(student.updatedAt) : new Date(),
  }));
}

async function upsertRows(client, table, rows, conflictKey = "id") {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const insertColumns = columns.join(", ");
  const placeholders = rows.map((row, rowIndex) => `(${columns.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(", ")})`).join(", ");
  const values = rows.flatMap((row) => columns.map((column) => row[column]));
  const updateSet = columns.filter((column) => column !== conflictKey).map((column) => `${column} = EXCLUDED.${column}`).join(", ");
  const text = `INSERT INTO ${table} (${insertColumns}) VALUES ${placeholders} ON CONFLICT (${conflictKey}) DO UPDATE SET ${updateSet}`;
  await client.query(text, values);
}

export function createPostgresPersistence(options = {}) {
  const mode = (options.mode || process.env.PERSISTENCE_MODE || "postgres").toString().trim().toLowerCase();
  if (mode !== "postgres") {
    throw new Error(`Postgres persistence requires PERSISTENCE_MODE=postgres. Current mode: ${mode}`);
  }

  let data;

  async function loadData() {
    ensureDatabaseConfigured();
    const client = await connect();
    try {
      const [schoolsResult, usersResult, userCredsResult, membershipsResult, invitationsResult, auditResult, classesResult, classTeachersResult, studentsResult, termsResult] = await Promise.all([
        client.query(`SELECT id, name, location, status, current_term, created_at, updated_at, founder_user_id FROM schools ORDER BY created_at ASC`),
        client.query(`SELECT id, email, name, status, profile, created_at, updated_at FROM users ORDER BY created_at ASC`),
        client.query(`SELECT user_id, password_hash FROM user_credentials`),
        client.query(`SELECT id, user_id, school_id, role, status, created_at, accepted_at, revoked_at, ended_at FROM school_memberships ORDER BY created_at ASC`),
        client.query(`SELECT id, school_id, name, email, role, status, invited_at, code, accepted_at, revoked_at, accepted_user_id FROM invitations ORDER BY invited_at ASC`),
        client.query(`SELECT id, school_id, actor_id, actor_name, action, detail, at FROM audits ORDER BY at DESC`),
        client.query(`SELECT id, school_id, name, academic_term_id, status, created_at, updated_at FROM classes ORDER BY created_at ASC`),
        client.query(`SELECT id, school_id, class_id, user_id, academic_term_id, created_at, updated_at FROM class_teachers`),
        client.query(`SELECT id, school_id, student_number, name, gender, status, current_class_id, created_at, updated_at FROM students ORDER BY created_at ASC`),
        client.query(`SELECT id, school_id, name FROM academic_terms`),
      ]);

      const passwordByUserId = new Map(userCredsResult.rows.map((row) => [row.user_id, row.password_hash]));
      const classTeacherMap = new Map();
      for (const row of classTeachersResult.rows) {
        const key = row.class_id;
        classTeacherMap.set(key, [...(classTeacherMap.get(key) || []), row.user_id]);
      }
      const schoolIdByUserId = new Map();
      for (const membership of membershipsResult.rows) {
        if (!schoolIdByUserId.has(membership.user_id)) {
          schoolIdByUserId.set(membership.user_id, membership.school_id);
        }
      }
      const users = usersResult.rows.map((row) => {
        const profile = normalizeProfile(row.profile);
        const role = profile.role || "teacher";
        const classIds = Array.isArray(profile.classIds) ? profile.classIds : [];
        return {
          id: row.id,
          email: row.email,
          name: row.name,
          status: row.status,
          role,
          classIds,
          schoolId: schoolIdByUserId.get(row.id) || null,
          passwordHash: passwordByUserId.get(row.id) || null,
          createdAt: row.created_at?.toISOString(),
          updatedAt: row.updated_at?.toISOString(),
        };
      });
      const classes = classesResult.rows.map((row) => ({
        id: row.id,
        schoolId: row.school_id,
        name: row.name,
        year: null,
        academicTermId: row.academic_term_id,
        teacherIds: classTeacherMap.get(row.id) || [],
        createdAt: row.created_at?.toISOString(),
        updatedAt: row.updated_at?.toISOString(),
      }));
      const students = studentsResult.rows.map((row) => ({
        id: row.id,
        schoolId: row.school_id,
        studentId: row.student_number,
        name: row.name,
        gender: row.gender,
        status: row.status,
        classId: row.current_class_id,
        guardian: null,
        createdAt: row.created_at?.toISOString(),
        updatedAt: row.updated_at?.toISOString(),
      }));
      const schools = schoolsResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        location: row.location,
        status: row.status,
        current_term: row.current_term,
        term: row.current_term,
        createdAt: row.created_at?.toISOString(),
        updatedAt: row.updated_at?.toISOString(),
        founder_user_id: row.founder_user_id,
      }));
      const memberships = membershipsResult.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        schoolId: row.school_id,
        role: row.role,
        status: row.status,
        createdAt: row.created_at?.toISOString(),
        acceptedAt: row.accepted_at?.toISOString(),
        revokedAt: row.revoked_at?.toISOString(),
        endedAt: row.ended_at?.toISOString(),
      }));
      const invitations = invitationsResult.rows.map((row) => ({
        id: row.id,
        schoolId: row.school_id,
        name: row.name,
        email: row.email,
        role: row.role,
        status: row.status,
        invitedAt: row.invited_at?.toISOString(),
        code: row.code,
        acceptedAt: row.accepted_at?.toISOString(),
        revokedAt: row.revoked_at?.toISOString(),
        acceptedUserId: row.accepted_user_id,
      }));
      const audit = auditResult.rows.map((row) => ({
        id: row.id,
        schoolId: row.school_id,
        actorId: row.actor_id,
        actorName: row.actor_name,
        action: row.action,
        detail: row.detail,
        at: row.at?.toISOString(),
      }));
      const attendance = {};

      data = {
        school: schools[0] || null,
        schools,
        users,
        memberships,
        classes,
        students,
        attendance,
        invitations,
        audit,
      };
      return data;
    } finally {
      client.release();
    }
  }

  async function saveData(updatedData) {
    ensureDatabaseConfigured();
    if (!updatedData) {
      updatedData = data;
    }
    if (!updatedData) {
      throw new Error("No persistence data available to save.");
    }
    const client = await connect();
    try {
      await client.query("BEGIN");
      const schools = schoolRows(updatedData.schools || []);
      const users = userRows(updatedData.users || []);
      const credentials = userCredentialRows(updatedData.users || []);
      const memberships = membershipRows(updatedData.memberships || []);
      const invitations = invitationRows(updatedData.invitations || []);
      const audits = auditRows(updatedData.audit || []);
      const termRows = academicTermRows(updatedData.schools || [], updatedData.classes || []);
      const classes = classRows(updatedData.classes || [], new Map(termRows.map((term) => [`${term.school_id}:${term.name}`, term.id])));
      const classTeachers = classTeacherRows(updatedData.classes || []);
      const students = studentRows(updatedData.students || []);

      await upsertRows(client, "schools", schools);
      await upsertRows(client, "users", users);
      await upsertRows(client, "user_credentials", credentials, "user_id");
      await upsertRows(client, "school_memberships", memberships);
      await upsertRows(client, "academic_terms", termRows);
      await upsertRows(client, "classes", classes);
      await upsertRows(client, "class_teachers", classTeachers);
      await upsertRows(client, "students", students);
      await upsertRows(client, "invitations", invitations);
      await upsertRows(client, "audits", audits);
      await client.query("COMMIT");
      data = updatedData;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
    ensureDatabaseConfigured();
    const client = await connect();
    try {
      await client.query("BEGIN");
      const schools = schoolRows(data.schools || []);
      const users = userRows(data.users || []);
      const credentials = userCredentialRows(data.users || []);
      const memberships = membershipRows(data.memberships || []);
      const invitations = invitationRows(data.invitations || []);
      const audits = auditRows(data.audit || []);
      const termRows = academicTermRows(data.schools || [], data.classes || []);
      const classes = classRows(data.classes || [], new Map(termRows.map((term) => [`${term.school_id}:${term.name}`, term.id])));
      const classTeachers = classTeacherRows(data.classes || []);
      const students = studentRows(data.students || []);

      await upsertRows(client, "schools", schools);
      await upsertRows(client, "users", users);
      await upsertRows(client, "user_credentials", credentials, "user_id");
      await upsertRows(client, "school_memberships", memberships);
      await upsertRows(client, "academic_terms", termRows);
      await upsertRows(client, "classes", classes);
      await upsertRows(client, "class_teachers", classTeachers);
      await upsertRows(client, "students", students);
      await upsertRows(client, "invitations", invitations);
      await upsertRows(client, "audits", audits);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function ready() {
    ensureDatabaseConfigured();
    await query("SELECT 1");
    return true;
  }

  return {
    async loadData() {
      return loadData();
    },
    async saveData() {
      return saveData(data);
    },
    async ready() {
      return ready();
    },
    get data() {
      return data;
    },
  };
}
