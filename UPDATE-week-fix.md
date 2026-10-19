# 教学周自动递增与左右滑动切换

基于上游 main：d4b9450（保留最新节次时间调整，后续已移除 iOS 工程）。

## 手势功能

- 周课表：左滑下一周，右滑上一周。
- 日程：左滑后一天，右滑前一天；跨周日/周一同步切换教学周。
- 保留竖向滚动和下拉刷新，忽略短距离、取消、多指和竖向手势，避免滑动误开课程详情。
- 第 1 周周一与第 25 周周日为可浏览日期范围边界。

## 修复内容

- 当前教学周与校准时所在周的周一日期一起保存，每跨过一个周一自动递增一周。
- 保留“我的 → 教学进度”手动校准，校准后继续随时间递增。
- 重新启动、页面跨日、应用从后台恢复时更新教学周与当天日期。
- 正在查看其他周时保留浏览位置，“本周”按钮回到更新后的当前周。
- 教务页面的周次查询下拉框不再覆盖当前教学周。
- 老版本缓存没有校准日期，首次升级使用现有学期日期算法迁移。若与学校实际校历不同，在“我的 → 教学进度”校准一次即可。登录状态与课表缓存保留。

## 网页上传到 GitHub

1. 备份仓库或创建修复分支。
2. 解压工程 ZIP，进入同时包含 package.json、src、android 的目录。
3. 在 GitHub 仓库点击 Add file → Upload files，把该目录中的内容上传到仓库根目录，确认路径没有多套一层文件夹。
4. 如果只上传修改文件，覆盖 src/App.vue、src/stores/user.ts、src/stores/timetable.ts、src/views/TimetableView.vue；新增 src/services/teaching-week.ts、tests/teaching-week.spec.ts、tests/swipe.spec.ts 与本说明。
5. 提交修改。若上传到分支，创建 Pull Request 后合并至 main。
6. 按原有 GitHub Actions 构建流程生成安装包。此 ZIP 为源码，不包含新编译的 APK。

## 本地 Git 合并（使用另附补丁）

在已克隆的仓库中执行，先保证工作区没有未保存的修改：

```bash
git switch main
git pull --ff-only
git switch -c fix/automatic-week
git apply --check /路径/week-and-swipe-fix.patch
git apply /路径/week-and-swipe-fix.patch
pnpm install --frozen-lockfile
pnpm build
git add src tests UPDATE-week-fix.md
git commit -m "Fix teaching week progression across calendar weeks"
git push -u origin fix/automatic-week
```

然后在 GitHub 创建 Pull Request，将 fix/automatic-week 合并到 main。若检查补丁时出现冲突，先停止应用补丁，检查上游相关文件是否有更新。

## 验证

新增回归测试覆盖旧缓存迁移、周日到周一、间隔多周、后台恢复、手动校准、刷新防回退、跨年与日期校验。

```bash
pnpm exec playwright install chromium
pnpm test
pnpm build
```

涉及后台恢复的自动化测试在浏览器中模拟生命周期事件，安卓的实际后台恢复仍需真机验证。手势同时通过浏览器原生触摸输入与合成触摸事件验证，包含跨周、边界和误触检查。
