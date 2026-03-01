import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getMode, shouldIntercept, type PlancopMode } from "../mode.js";

describe("getMode", () => {
  const originalEnv = process.env.PLANCOP_MODE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.PLANCOP_MODE;
    } else {
      process.env.PLANCOP_MODE = originalEnv;
    }
  });

  it("returns 'auto' when PLANCOP_MODE is not set", () => {
    delete process.env.PLANCOP_MODE;
    expect(getMode()).toBe("auto");
  });

  it("returns 'off' when PLANCOP_MODE is 'off'", () => {
    process.env.PLANCOP_MODE = "off";
    expect(getMode()).toBe("off");
  });

  it("returns 'auto' when PLANCOP_MODE is 'auto'", () => {
    process.env.PLANCOP_MODE = "auto";
    expect(getMode()).toBe("auto");
  });

  it("returns 'always' when PLANCOP_MODE is 'always'", () => {
    process.env.PLANCOP_MODE = "always";
    expect(getMode()).toBe("always");
  });

  it("returns 'aggressive' when PLANCOP_MODE is 'aggressive'", () => {
    process.env.PLANCOP_MODE = "aggressive";
    expect(getMode()).toBe("aggressive");
  });

  it("returns 'auto' for invalid PLANCOP_MODE value", () => {
    process.env.PLANCOP_MODE = "invalid";
    expect(getMode()).toBe("auto");
  });

  it("returns 'auto' for empty string PLANCOP_MODE", () => {
    process.env.PLANCOP_MODE = "";
    expect(getMode()).toBe("auto");
  });
});

describe("shouldIntercept", () => {
  describe("off mode", () => {
    it("does not intercept edit", () => {
      expect(shouldIntercept("off", "edit")).toBe(false);
    });

    it("does not intercept create", () => {
      expect(shouldIntercept("off", "create")).toBe(false);
    });

    it("does not intercept write", () => {
      expect(shouldIntercept("off", "write")).toBe(false);
    });

    it("does not intercept bash", () => {
      expect(shouldIntercept("off", "bash")).toBe(false);
    });

    it("does not intercept read", () => {
      expect(shouldIntercept("off", "read")).toBe(false);
    });

    it("does not intercept ls", () => {
      expect(shouldIntercept("off", "ls")).toBe(false);
    });
  });

  describe("auto mode", () => {
    it("intercepts edit", () => {
      expect(shouldIntercept("auto", "edit")).toBe(true);
    });

    it("intercepts create", () => {
      expect(shouldIntercept("auto", "create")).toBe(true);
    });

    it("intercepts write", () => {
      expect(shouldIntercept("auto", "write")).toBe(true);
    });

    it("does not intercept bash", () => {
      expect(shouldIntercept("auto", "bash")).toBe(false);
    });

    it("does not intercept read", () => {
      expect(shouldIntercept("auto", "read")).toBe(false);
    });

    it("does not intercept ls", () => {
      expect(shouldIntercept("auto", "ls")).toBe(false);
    });
  });

  describe("always mode", () => {
    it("intercepts edit", () => {
      expect(shouldIntercept("always", "edit")).toBe(true);
    });

    it("intercepts create", () => {
      expect(shouldIntercept("always", "create")).toBe(true);
    });

    it("intercepts bash", () => {
      expect(shouldIntercept("always", "bash")).toBe(true);
    });

    it("intercepts read", () => {
      expect(shouldIntercept("always", "read")).toBe(true);
    });

    it("intercepts ls", () => {
      expect(shouldIntercept("always", "ls")).toBe(true);
    });

    it("intercepts arbitrary tool names", () => {
      expect(shouldIntercept("always", "some_unknown_tool")).toBe(true);
    });
  });

  describe("aggressive mode", () => {
    it("intercepts edit", () => {
      expect(shouldIntercept("aggressive", "edit")).toBe(true);
    });

    it("intercepts create", () => {
      expect(shouldIntercept("aggressive", "create")).toBe(true);
    });

    it("intercepts write", () => {
      expect(shouldIntercept("aggressive", "write")).toBe(true);
    });

    it("intercepts bash", () => {
      expect(shouldIntercept("aggressive", "bash")).toBe(true);
    });

    it("does not intercept read", () => {
      expect(shouldIntercept("aggressive", "read")).toBe(false);
    });

    it("does not intercept ls", () => {
      expect(shouldIntercept("aggressive", "ls")).toBe(false);
    });
  });
});
