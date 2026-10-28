// Identidad sin registro: cada dispositivo guarda su id de usuario en esta cookie.
export const USER_COOKIE = "ts_uid";

export const USER_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 400,
};
