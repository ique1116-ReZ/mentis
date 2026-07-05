const configuredApiBase = import.meta.env.VITE_API_BASE?.trim();

export const API_BASE = configuredApiBase || (import.meta.env.DEV ? "http://127.0.0.1:3001" : "https://api.aimentis.site");
