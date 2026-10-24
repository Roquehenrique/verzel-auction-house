// Shared by the server layout (inline script) and the client theme toggle.
// Not a "use client" module: the layout must import a plain string.
export const THEME_KEY = "leilao.theme";

// Runs in <head> before the first paint: applies the saved theme (or the
// operating system's one), so dark-mode users never see a light flash.
export const themeScript = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");var d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;
