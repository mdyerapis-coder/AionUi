# CDP

The in-app browser bridge binds with `listen(0)`. `AIONUI_CDP_PORT` is only an on/off switch (`0` or `false` disables). The port passed to the MCP launcher is `AIONUI_CDP_ACTIVE_PORT`.

See `packages/desktop/src/process/utils/configureChromium.ts` and `packages/desktop/src/process/resources/builtinMcp/browserServer.ts`.
