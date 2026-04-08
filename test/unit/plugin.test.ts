import plugin from "../../src/index.js";

function createApi(overrides?: Partial<Record<string, unknown>>) {
  return {
    pluginConfig: {},
    registerCli: vi.fn(),
    registerTool: vi.fn(),
    registerService: vi.fn(),
    ...overrides,
  } as any;
}

describe("plugin registration", () => {
  it("registers cli, tools, and service by default", () => {
    const api = createApi();

    plugin.register?.(api);

    expect(api.registerCli).toHaveBeenCalledTimes(1);
    expect(api.registerTool).toHaveBeenCalledTimes(8);
    expect(api.registerService).toHaveBeenCalledTimes(1);
  });

  it("respects disabled config flags", () => {
    const api = createApi({
      pluginConfig: {
        enableCli: false,
        enableTools: false,
        enableService: false,
      },
    });

    plugin.register?.(api);

    expect(api.registerCli).not.toHaveBeenCalled();
    expect(api.registerService).not.toHaveBeenCalled();
  });
});
