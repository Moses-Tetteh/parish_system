import pkg from "../../package.json";

/** Mirrors PHP's APP_NAME / APP_VERSION constants (used in <title> and the footer). */
export const APP_NAME = process.env.APP_NAME || "Blessed Clementina Parish";
export const APP_VERSION: string = pkg.version;
