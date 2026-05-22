import Constants from 'expo-constants';

const APP_VARIANT = Constants.expoConfig?.extra?.APP_VARIANT ?? 'public';

export const IS_MCLOONES = APP_VARIANT === 'mcloones';
export const APP_DISPLAY_NAME = IS_MCLOONES ? "Boathouse Connect" : "MyResto Connect";
