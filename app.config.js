const publicUrl = process.env.PUBLIC_URL || '/';

module.exports = {
  expo: {
    name: 'mobile',
    slug: 'mobile',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './src/logos/Favicon.png',
      display: 'standalone',
      scope: publicUrl,
      startUrl: publicUrl,
      orientation: 'portrait-primary',
      themeColor: '#1F2937',
      backgroundColor: '#FFFFFF',
      shortName: 'WhoPlays',
      categories: ['sports', 'utilities'],
    },
    experiments: {
      baseUrl: publicUrl,
    },
    plugins: [
      [
        'expo-location',
        {
          locationWhenInUsePermission: 'WhoPlays utilise ta position pour trouver le terrain et le match autour de toi.',
        },
      ],
    ],
  },
};
