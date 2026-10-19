import { defineStore } from "pinia";
import { showToast } from "vant";
import { checkForUpdate, type AppUpdate } from "../services/app-update";

export const useUpdateStore = defineStore("update", {
  state: () => ({ checking: false, visible: false, update: null as AppUpdate | null }),
  actions: {
    async check(manual = false) {
      if (this.checking) return;
      this.checking = true;
      try {
        const update = await checkForUpdate();
        this.update = update;
        this.visible = !!update;
        if (manual && !update) showToast("暂无可用更新，当前版本可继续使用");
      } catch (_) {
        if (manual) showToast("检查更新失败，请检查网络后重试");
      } finally { this.checking = false; }
    },
  },
});
