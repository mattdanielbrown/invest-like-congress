import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/lib/alias-loader.mjs", pathToFileURL("./"));
