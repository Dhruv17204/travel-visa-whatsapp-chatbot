export interface MetaConfig {
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  phoneNumberId: string;
  wabaId: string;
  graphApiVersion: string;
}

export function loadMetaConfig(): MetaConfig {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const appSecret = process.env.META_APP_SECRET;
  const verifyToken = process.env.META_VERIFY_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const wabaId = process.env.META_WABA_ID;
  const graphApiVersion = process.env.META_GRAPH_API_VERSION || 'v20.0';

  if (!accessToken || !appSecret || !verifyToken || !phoneNumberId || !wabaId) {
    throw new Error('Meta configuration failed: Required META environment variables are missing.');
  }

  return {
    accessToken,
    appSecret,
    verifyToken,
    phoneNumberId,
    wabaId,
    graphApiVersion,
  };
}
