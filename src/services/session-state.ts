// Read the old login snapshot without letting retired preview sessions into the app.
export function readPersistedUser(): Record<string, any> | null {
  try {
    const raw = localStorage.getItem("shst_user");
    if (!raw) return null;
    const user = JSON.parse(raw);
    if (!user || typeof user !== "object" || Array.isArray(user)) return null;
    if (user.isMockMode === true) {
      for (const key of [
        "shst_user",
        "shst_timetable",
        "shst_grades",
        "shst_exams",
        "sdust_cookie",
      ])
        localStorage.removeItem(key);
      return null;
    }
    delete user.isMockMode;
    return user;
  } catch (_) {
    return null;
  }
}
