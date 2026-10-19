import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = mkdtempSync(join(tmpdir(), 'sdust-widget-'));
const binary = name => process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', name + (process.platform === 'win32' ? '.exe' : '')) : name;
try {
  for (const [command, args] of [
    [binary('javac'), ['-d', directory, 'android/app/src/main/java/com/sdust/shst/widget/WidgetSchedule.java', 'tests/native/WidgetScheduleCheck.java']],
    [binary('java'), ['-cp', directory, 'WidgetScheduleCheck']],
  ]) {
    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error('Widget schedule check failed; install JDK 17 and check JAVA_HOME.');
  }
} finally { rmSync(directory, { recursive: true, force: true }); }
