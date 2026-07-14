import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'mx.tuxtlasgo.app',
    appName: 'TuxtlasGO',
    webDir: 'dist',
    android: {
        allowMixedContent: true,
    },
};

export default config;