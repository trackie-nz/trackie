const TRACKIE_THEME_CSS: string = '@TRACKIE_THEME_CSS@';

const isInjected = TRACKIE_THEME_CSS.startsWith(':root');

export const TRACKIE_INSTALLED_THEME = isInjected
  ? JSON.stringify({
      id: 'trackie',
      name: 'Trackie',
      repo: 'trackie-nz/trackie-theme',
      cssContent: TRACKIE_THEME_CSS,
      baseTheme: 'light',
    })
  : undefined;
