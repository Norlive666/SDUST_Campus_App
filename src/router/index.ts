import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import MainLayout from '../views/MainLayout.vue';
import TimetableView from '../views/TimetableView.vue';
import GradeView from '../views/GradeView.vue';
import ExamView from '../views/ExamView.vue';
import ProfileView from '../views/ProfileView.vue';
import ClassroomView from '../views/ClassroomView.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
  },
  {
    path: '/',
    component: MainLayout,
    redirect: '/timetable',
    children: [
      {
        path: 'timetable',
        name: 'Timetable',
        component: TimetableView,
      },
      {
        path: 'grade',
        name: 'Grade',
        component: GradeView,
      },
      {
        path: 'exam',
        name: 'Exam',
        component: ExamView,
      },
      {
        path: 'profile',
        name: 'Profile',
        component: ProfileView,
      },
    ],
  },
  {
    path: '/classroom',
    name: 'Classroom',
    component: ClassroomView,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, _, next) => {
  let user: any = null;
  try {
    const saved = localStorage.getItem('shst_user');
    if (saved) {
      user = JSON.parse(saved);
    }
  } catch (_) {}

  const isLoggedIn = user && user.isLoggedIn;
  if (to.path !== '/login' && !isLoggedIn) {
    next('/login');
  } else if (to.path === '/login' && isLoggedIn) {
    next('/timetable');
  } else {
    next();
  }
});

export default router;
