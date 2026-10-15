import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sdust.shst',
  appName: '山科小站',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: true
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
