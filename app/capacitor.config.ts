import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rishu.sapnahealth',
  appName: 'Sapna Health',
  webDir: 'dist',
  backgroundColor: '#FBFBFB',
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover', style: 'DARK' },
    SplashScreen: { launchShowDuration: 1200, launchAutoHide: true, backgroundColor: '#FBFBFB', showSpinner: false, androidScaleType: 'CENTER_INSIDE' },
    LocalNotifications: { smallIcon: 'ic_stat_sapna', iconColor: '#C6F432' },
  },
};

export default config;
