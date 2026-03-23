import { main } from "../dist/src/runtime/openclaw-exec-bridge.js";

const code = await main(process.argv);
process.exit(code);
