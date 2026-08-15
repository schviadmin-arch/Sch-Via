import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createPersistence } from "./persistence.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 5000);
const dataPath = process.env.DATA_PATH || join(root, "data", "schvia.json");
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || "schvia-local-development-secret";
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const loginWindowMs = 5 * 60 * 1000;
const maxLoginAttempts = 10;
if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be configured in production");
}
const loginAttempts = new Map();
const sessions = new Map();
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const today = new Date().toISOString().slice(0, 10);

let data;
const persistence = createPersistence({ dataPath, mode: process.env.PERSISTENCE_MODE });
try {
  data = await persistence.loadData();
} catch (error) {
  console.error("Failed to initialize persistence:", error);
  throw error;
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, encoded) {
  if (!encoded || typeof password !== "string") return false;
  const [salt, expectedHex] = encoded.split(":");
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  const body = status >= 400
    ? { ...payload, requestId: response.getHeader("X-Request-Id") }
    : payload;
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        const error = new Error("Request too large");
        error.statusCode = 413;
        reject(error);
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        const error = new Error("Invalid JSON");
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sessionCookie(token) {
  return `schvia_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${isProduction ? "; Secure" : ""}`;
}

function clearSessionCookie() {
  return `schvia_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isProduction ? "; Secure" : ""}`;
}

function signSession(value) {
  return createHmac("sha256", sessionSecret).update(value).digest("hex");
}

function getSession(request) {
  const raw = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("schvia_session="))?.split("=")[1];
  if (!raw) return null;
  const [id, signature] = raw.split(".");
  if (!id || !signature || sessions.get(id) === undefined) return null;
  const expected = signSession(id);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const session = sessions.get(id);
  if (session.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  return session;
}

function schoolFor(session) {
  const schoolId = session.schoolId || data.schools[0]?.id;
  return data.schools.find((school) => school.id === schoolId) || data.schools[0];
}

function membershipFor(session) {
  return data.memberships.find((membership) => membership.userId === session.userId && membership.schoolId === session.schoolId && membership.status === "active");
}

function userFor(session) {
  return data.users.find((user) => user.id === session.userId);
}

function publicUser(user, role = user?.role) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return { ...safeUser, role };
}

function requestAddress(request) {
  return request.headers["x-forwarded-for"]?.split(",")[0]?.trim() || request.socket.remoteAddress || "unknown";
}

function loginAllowed(request) {
  const now = Date.now();
  const address = requestAddress(request);
  const recent = (loginAttempts.get(address) || []).filter((timestamp) => now - timestamp < loginWindowMs);
  if (recent.length >= maxLoginAttempts) {
    loginAttempts.set(address, recent);
    return false;
  }
  recent.push(now);
  loginAttempts.set(address, recent);
  return true;
}

function requireRole(request, response, roles) {
  const session = getSession(request);
  if (!session) {
    sendJson(response, 401, { error: "Sign in required" });
    return null;
  }
  const user = userFor(session);
  if (!user || user.status !== "active" || !membershipFor(session)) {
    sendJson(response, 401, { error: "Your account is no longer active" });
    return null;
  }
  if (!roles.includes(session.role)) {
    sendJson(response, 403, { error: "This action is outside your responsibility" });
    return null;
  }
  return session;
}

function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function activeTeacher(id, schoolId) {
  return data.users.some((item) => item.id === id && item.schoolId === schoolId && item.role === "teacher" && item.status === "active"
    && data.memberships.some((membership) => membership.userId === id && membership.schoolId === schoolId && membership.status === "active"));
}

function audit(actor, action, detail) {
  data.audit.unshift({
    id: `audit-${Date.now()}-${randomBytes(3).toString("hex")}`,
    actorId: actor.id,
    actorName: actor.name,
    schoolId: actor.schoolId || data.schools[0]?.id,
    action,
    detail,
    at: new Date().toISOString(),
  });
  data.audit = data.audit.slice(0, 100);
}

function visibleState(session) {
  const school = schoolFor(session);
  const schoolId = school.id;
  const membership = membershipFor(session);
  const schoolUsers = data.users.filter((item) => item.schoolId === schoolId && data.memberships.some((candidate) => candidate.userId === item.id && candidate.schoolId === schoolId && candidate.status === "active"));
  const schoolClasses = data.classes.filter((item) => item.schoolId === schoolId);
  const schoolStudents = data.students.filter((item) => item.schoolId === schoolId);
  const isSchoolAdmin = ["principal", "admin"].includes(session.role);
  const assigned = !isSchoolAdmin
    ? schoolClasses.filter((item) => item.teacherIds.includes(session.userId)).map((item) => item.id)
    : schoolClasses.map((item) => item.id);
  const students = schoolStudents.filter((item) => assigned.includes(item.classId));
  const attendance = Object.values(data.attendance).filter((item) => item.schoolId === schoolId && assigned.includes(item.classId));
  return {
    school,
    currentUser: publicUser(userFor(session), membership?.role || session.role),
    users: (isSchoolAdmin ? schoolUsers : schoolUsers.filter((item) => item.id === session.userId || item.role === "principal")).map((user) => publicUser(user, data.memberships.find((item) => item.userId === user.id && item.schoolId === schoolId)?.role || user.role)),
    classes: schoolClasses.filter((item) => assigned.includes(item.id)),
    students,
    attendance,
    invitations: isSchoolAdmin ? data.invitations.filter((item) => item.schoolId === schoolId) : [],
    audit: isSchoolAdmin ? data.audit.filter((item) => item.schoolId === schoolId) : data.audit.filter((item) => item.schoolId === schoolId && item.actorId === session.userId),
  };
}

async function handleApi(request, response, pathname) {
  if (request.method === "POST" && !request.headers["content-type"]?.toLowerCase().includes("application/json")) {
    return sendJson(response, 415, { error: "Requests must use application/json" });
  }
  if (request.method === "POST" && pathname === "/api/auth/login") {
    if (!loginAllowed(request)) return sendJson(response, 429, { error: "Too many sign-in attempts. Try again later." });
    const body = await readBody(request);
    const role = body.role === "teacher" ? "teacher" : "principal";
    const user = data.users.find((item) => item.role === role && item.status === "active");
    if (!user) return sendJson(response, 404, { error: "No active demo user for that role" });
    const id = randomBytes(18).toString("hex");
    const membership = data.memberships.find((item) => item.userId === user.id && item.schoolId === user.schoolId && item.status === "active");
    sessions.set(id, { userId: user.id, schoolId: user.schoolId, role: membership?.role || user.role, createdAt: Date.now(), expiresAt: Date.now() + sessionLifetimeMs });
    return sendJson(response, 200, { user: publicUser(user, membership?.role || user.role) }, { "Set-Cookie": sessionCookie(`${id}.${signSession(id)}`) });
  }
  if (request.method === "POST" && pathname === "/api/auth/register") {
    if (!loginAllowed(request)) return sendJson(response, 429, { error: "Too many sign-in attempts. Try again later." });
    const body = await readBody(request);
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const schoolName = body.schoolName?.trim();
    const password = body.password;
    if (!name || !schoolName || !email || !password) return sendJson(response, 400, { error: "Name, school name, email, and password are required" });
    if (!isValidEmail(email)) return sendJson(response, 400, { error: "Enter a valid email address" });
    if (typeof password !== "string" || password.length < 8) return sendJson(response, 400, { error: "Use a password with at least 8 characters" });
    if (data.users.some((user) => user.email === email)) return sendJson(response, 409, { error: "An account with that email already exists" });
    const now = new Date().toISOString();
    const school = { id: `school-${randomBytes(8).toString("hex")}`, name: schoolName, location: body.location?.trim() || "", term: body.term?.trim() || "Current academic year", createdAt: now };
    const user = { id: `user-${randomBytes(8).toString("hex")}`, name, email, role: "principal", status: "active", schoolId: school.id, classIds: [], passwordHash: hashPassword(password), createdAt: now };
    data.schools.push(school);
    data.users.push(user);
    data.memberships.push({ id: `membership-${randomBytes(8).toString("hex")}`, userId: user.id, schoolId: school.id, role: "principal", status: "active", createdAt: now });
    data.audit.unshift({ id: `audit-${randomBytes(8).toString("hex")}`, schoolId: school.id, actorId: user.id, actorName: user.name, action: "Workspace created", detail: `${school.name} · ${school.location}`, at: now });
    await persistence.saveData();
    const id = randomBytes(18).toString("hex");
    sessions.set(id, { userId: user.id, schoolId: school.id, role: "principal", createdAt: Date.now(), expiresAt: Date.now() + sessionLifetimeMs });
    return sendJson(response, 201, { user: publicUser(user, "principal"), school }, { "Set-Cookie": sessionCookie(`${id}.${signSession(id)}`) });
  }
  if (request.method === "POST" && pathname === "/api/auth/login-email") {
    if (!loginAllowed(request)) return sendJson(response, 429, { error: "Too many sign-in attempts. Try again later." });
    const body = await readBody(request);
    const email = body.email?.trim().toLowerCase();
    const user = data.users.find((item) => item.email === email && item.status === "active");
    if (!user || !verifyPassword(body.password, user.passwordHash)) return sendJson(response, 401, { error: "Email or password is incorrect" });
    const membership = data.memberships.find((item) => item.userId === user.id && item.schoolId === user.schoolId && item.status === "active");
    if (!membership) return sendJson(response, 403, { error: "This account has no active school workspace" });
    const id = randomBytes(18).toString("hex");
    sessions.set(id, { userId: user.id, schoolId: user.schoolId, role: membership.role, createdAt: Date.now(), expiresAt: Date.now() + sessionLifetimeMs });
    return sendJson(response, 200, { user: publicUser(user, membership.role) }, { "Set-Cookie": sessionCookie(`${id}.${signSession(id)}`) });
  }
  if (request.method === "POST" && pathname === "/api/auth/accept-invite") {
    if (!loginAllowed(request)) return sendJson(response, 429, { error: "Too many sign-in attempts. Try again later." });
    const body = await readBody(request);
    const code = body.code?.trim().toUpperCase();
    const invite = data.invitations.find((item) => item.code === code && item.status === "pending");
    if (!invite) return sendJson(response, 404, { error: "That invitation code is invalid or has already been used" });
    if (!body.name?.trim() || !body.email?.trim() || !body.password) return sendJson(response, 400, { error: "Name, email, password, and invitation code are required" });
    if (!isValidEmail(body.email)) return sendJson(response, 400, { error: "Enter a valid email address" });
    if (body.password.length < 8) return sendJson(response, 400, { error: "Use a password with at least 8 characters" });
    const email = body.email.trim().toLowerCase();
    if (data.users.some((user) => user.email === email)) return sendJson(response, 409, { error: "An account with that email already exists" });
    const now = new Date().toISOString();
    const user = { id: `user-${randomBytes(8).toString("hex")}`, name: body.name.trim(), email, role: invite.role, status: "active", schoolId: invite.schoolId, classIds: [], passwordHash: hashPassword(body.password), createdAt: now };
    data.users.push(user);
    data.memberships.push({ id: `membership-${randomBytes(8).toString("hex")}`, userId: user.id, schoolId: invite.schoolId, role: invite.role, status: "active", createdAt: now });
    invite.status = "accepted";
    invite.acceptedAt = now;
    invite.acceptedUserId = user.id;
    data.audit.unshift({ id: `audit-${randomBytes(8).toString("hex")}`, schoolId: invite.schoolId, actorId: user.id, actorName: user.name, action: "Staff invitation accepted", detail: `${user.name} · ${invite.role}`, at: now });
    await persistence.saveData();
    const id = randomBytes(18).toString("hex");
    sessions.set(id, { userId: user.id, schoolId: invite.schoolId, role: invite.role, createdAt: Date.now(), expiresAt: Date.now() + sessionLifetimeMs });
    return sendJson(response, 201, { user: publicUser(user, invite.role), school: schoolFor({ schoolId: invite.schoolId }) }, { "Set-Cookie": sessionCookie(`${id}.${signSession(id)}`) });
  }
  if (request.method === "POST" && pathname === "/api/auth/logout") {
    const session = getSession(request);
    if (session) {
      const raw = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("schvia_session="))?.split("=")[1];
      sessions.delete(raw?.split(".")[0]);
    }
    return sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
  }
  if (request.method === "GET" && pathname === "/api/state") {
    const session = requireRole(request, response, ["principal", "teacher"]);
    return session ? sendJson(response, 200, visibleState(session)) : undefined;
  }
  if (request.method === "POST" && pathname === "/api/school") {
    const session = requireRole(request, response, ["principal", "admin"]);
    if (!session) return;
    const body = await readBody(request);
    if (!body.name?.trim()) return sendJson(response, 400, { error: "School name is required" });
    const school = schoolFor(session);
    school.name = body.name.trim();
    school.location = (body.location || "").trim();
    school.term = (body.term || "").trim();
    audit(userFor(session), "School settings updated", `${school.name} · ${school.location}`);
    await persistence.saveData();
    return sendJson(response, 200, visibleState(session));
  }
  if (request.method === "POST" && pathname === "/api/users") {
    const session = requireRole(request, response, ["principal", "admin"]);
    if (!session) return;
    const body = await readBody(request);
    if (!body.name?.trim() || !body.email?.trim()) return sendJson(response, 400, { error: "Name and email are required" });
    if (!isValidEmail(body.email)) return sendJson(response, 400, { error: "Enter a valid email address" });
    const email = body.email.trim().toLowerCase();
    const schoolId = schoolFor(session).id;
    if (data.users.some((item) => item.schoolId === schoolId && item.email === email) || data.invitations.some((item) => item.schoolId === schoolId && item.email === email && item.status === "pending")) {
      return sendJson(response, 409, { error: "That email already belongs to this school" });
    }
    const invite = { id: `invite-${Date.now()}`, schoolId, name: body.name.trim(), email, role: body.role === "admin" ? "admin" : "teacher", status: "pending", invitedAt: new Date().toISOString(), code: randomBytes(4).toString("hex").toUpperCase() };
    data.invitations.unshift(invite);
    audit(userFor(session), "Staff invitation created", `${invite.name} · ${invite.role}`);
    await persistence.saveData();
    return sendJson(response, 201, visibleState(session));
  }
  if (request.method === "POST" && pathname === "/api/classes") {
    const session = requireRole(request, response, ["principal", "admin"]);
    if (!session) return;
    const body = await readBody(request);
    if (!body.name?.trim()) return sendJson(response, 400, { error: "Class name is required" });
    const schoolId = schoolFor(session).id;
    const year = body.year?.trim() || schoolFor(session).term;
    if (data.classes.some((item) => item.schoolId === schoolId && item.name.toLowerCase() === body.name.trim().toLowerCase() && item.year.toLowerCase() === year.toLowerCase())) {
      return sendJson(response, 409, { error: "That class already exists for this academic year" });
    }
    if (body.teacherId && !activeTeacher(body.teacherId, schoolId)) return sendJson(response, 400, { error: "Choose an active teacher from this school" });
    const item = { id: `class-${Date.now()}`, schoolId, name: body.name.trim(), year, teacherIds: body.teacherId ? [body.teacherId] : [] };
    data.classes.push(item);
    audit(userFor(session), "Class created", item.name);
    await persistence.saveData();
    return sendJson(response, 201, visibleState(session));
  }
  if (request.method === "POST" && pathname === "/api/students") {
    const session = requireRole(request, response, ["principal", "admin"]);
    if (!session) return;
    const body = await readBody(request);
    if (!body.name?.trim() || !body.classId) return sendJson(response, 400, { error: "Student name and class are required" });
    const schoolId = schoolFor(session).id;
    if (!data.classes.some((item) => item.schoolId === schoolId && item.id === body.classId)) return sendJson(response, 400, { error: "Choose a valid class" });
    const studentId = body.studentId?.trim() || `NBS-${String(data.students.filter((item) => item.schoolId === schoolId).length + 1).padStart(3, "0")}`;
    if (data.students.some((item) => item.schoolId === schoolId && item.studentId.toLowerCase() === studentId.toLowerCase())) {
      return sendJson(response, 409, { error: "That student ID already exists" });
    }
    const item = { id: `student-${Date.now()}`, schoolId, studentId, name: body.name.trim(), gender: body.gender || "Not specified", classId: body.classId, guardian: body.guardian?.trim() || "Not added", status: "enrolled" };
    data.students.push(item);
    audit(userFor(session), "Student enrolled", `${item.name} · ${item.studentId}`);
    await persistence.saveData();
    return sendJson(response, 201, visibleState(session));
  }
  if (request.method === "POST" && pathname === "/api/attendance") {
    const session = requireRole(request, response, ["teacher", "principal"]);
    if (!session) return;
    const body = await readBody(request);
    if (!body.date || !body.classId || !Array.isArray(body.records)) return sendJson(response, 400, { error: "Date, class, and records are required" });
    if (!isValidDate(body.date)) return sendJson(response, 400, { error: "Attendance date must be a valid YYYY-MM-DD date" });
    const schoolId = schoolFor(session).id;
    const targetClass = data.classes.find((item) => item.schoolId === schoolId && item.id === body.classId);
    if (!targetClass) return sendJson(response, 404, { error: "Class not found" });
    const allowed = session.role === "principal" || data.classes.some((item) => item.schoolId === schoolId && item.id === body.classId && item.teacherIds.includes(session.userId));
    if (!allowed) return sendJson(response, 403, { error: "You are not assigned to this class" });
    const validStudents = new Set(data.students.filter((item) => item.schoolId === schoolId && item.classId === body.classId).map((item) => item.id));
    if (!body.records.length) return sendJson(response, 400, { error: "At least one attendance record is required" });
    const seenStudents = new Set();
    for (const record of body.records) {
      if (!record || !validStudents.has(record.studentId)) return sendJson(response, 400, { error: "Every attendance record must belong to the selected class" });
      if (seenStudents.has(record.studentId)) return sendJson(response, 409, { error: "A student can only appear once per attendance batch" });
      if (!["present", "absent", "late", "excused"].includes(record.status)) return sendJson(response, 400, { error: "Attendance status is invalid" });
      seenStudents.add(record.studentId);
    }
    let saved = 0;
    for (const record of body.records) {
      const key = `${body.date}:${body.classId}:${record.studentId}`;
      const existing = data.attendance[key];
      data.attendance[key] = { id: existing?.id || `attendance-${body.date}-${body.classId}-${record.studentId}`, schoolId, date: body.date, classId: body.classId, studentId: record.studentId, status: record.status, recordedBy: existing?.recordedBy || session.userId, recordedAt: existing?.recordedAt || new Date().toISOString(), updatedAt: new Date().toISOString(), synced: true };
      saved++;
    }
    audit(userFor(session), "Attendance saved", `${body.records.length} records · ${body.date}`);
    await persistence.saveData();
    return sendJson(response, 200, { ...visibleState(session), saved });
  }
  sendJson(response, 404, { error: "API route not found" });
}

const server = createServer(async (request, response) => {
  const requestId = randomBytes(8).toString("hex");
  response.setHeader("X-Request-Id", requestId);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  let requestedPath;
  try {
    requestedPath = decodeURIComponent((request.url || "/").split("?")[0]);
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad request");
    return;
  }

  if (requestedPath === "/health" || requestedPath === "/api/healthz") {
    if (requestedPath === "/api/healthz") {
      return sendJson(response, 200, { status: "ok" });
    }
    return sendJson(response, 200, { ok: true, service: "schvia" });
  }

  if (requestedPath === "/ready") {
    const ready = await persistence.ready();
    return sendJson(response, ready ? 200 : 503, { ok: ready, ready, error: ready ? undefined : "Persistence is not ready" });
  }

  if (requestedPath.startsWith("/api/")) {
    try {
      await handleApi(request, response, requestedPath);
    } catch (error) {
      console.error(error);
      const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      sendJson(response, status, { error: status >= 500 ? "Request failed" : error.message || "Request failed" });
    }
    return;
  }

  if (requestedPath.split("/").some((segment) => segment.startsWith("."))) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.slice(1);
  const filePath = normalize(join(root, relativePath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`SchVIA preview server listening on port ${port}`);
});

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
  for (const [address, attempts] of loginAttempts) {
    const recent = attempts.filter((timestamp) => now - timestamp < loginWindowMs);
    if (recent.length) loginAttempts.set(address, recent);
    else loginAttempts.delete(address);
  }
}, 60_000);
cleanupTimer.unref();