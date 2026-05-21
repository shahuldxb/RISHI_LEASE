export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT ?? "",
  azureOpenAIKey: process.env.AZURE_OPENAI_KEY ?? process.env.OPENAI_API_KEY ?? "",
  azureOpenAIDeployment: process.env.AZURE_OPENAI_DEPLOYMENT ?? "",
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-12-01-preview",
};
