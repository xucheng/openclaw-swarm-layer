import { main } from "../src/runtime/openclaw-exec-bridge.ts";

const code = await main(process.argv);
process.exit(code);
