import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";
import LoginView from "../views/LoginView.vue";
import MainLayout from "../views/MainLayout.vue";
import TimetableView from "../views/TimetableView.vue";
import GradeView from "../views/GradeView.vue";
import ExamView from "../views/ExamView.vue";
import ProfileView from "../views/ProfileView.vue";
import { readPersistedUser } from "../services/session-state";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "Login",
    component: LoginView,
  },
  {
    path: "/",
    component: MainLayout,
    redirect: "/timetable",
    children: [
      {
        path: "timetable",
        name: "Timetable",
        component: TimetableView,
      },
      {
        path: "grade",
        name: "Grade",
        component: GradeView,
      },
      {
        path: "exam",
        name: "Exam",
        component: ExamView,
      },
      {
        path: "profile",
        name: "Profile",
        component: ProfileView,
      },
    ],
  },
  { path: "/:pathMatch(.*)*", redirect: "/timetable" },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, _, next) => {
  const user = readPersistedUser();

  const isLoggedIn = user && user.isLoggedIn;
  if (to.path !== "/login" && !isLoggedIn) {
    next("/login");
  } else if (to.path === "/login" && isLoggedIn && to.query.reauth !== "1") {
    next("/timetable");
  } else {
    next();
  }
});

export default router;
