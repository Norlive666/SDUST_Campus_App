import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";

// 引入 Vant 移动端组件库及样式
import Vant from "vant";
import "vant/lib/index.css";
import "./styles/secondary-pages.css";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(Vant);

app.mount("#app");
