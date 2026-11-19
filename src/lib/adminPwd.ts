// Contraseña de admin: ya NO está escrita en el código. Se pide al entrar al panel,
// se valida contra el servidor y vive solo en memoria (se pierde al recargar la página).
let actual = '';
export const fijarAdminPwd = (p: string) => { actual = p; };
export const adminPwd = () => actual;
