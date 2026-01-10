import { describe, it, expect } from "vitest";
import { generateEventQR } from "./generate";

describe("generateEventQR", () => {
  const baseUrl = "https://sabaipics.com";

  it("generates valid PNG Uint8Array for valid access code", async () => {
    const result = await generateEventQR("ABC123", baseUrl);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);

    // Verify PNG magic bytes (89 50 4E 47)
    expect(result[0]).toBe(0x89);
    expect(result[1]).toBe(0x50);
    expect(result[2]).toBe(0x4e);
    expect(result[3]).toBe(0x47);
  });

  it("accepts different valid access codes", async () => {
    const codes = ["A1B2C3", "XXXXXX", "000000", "ZZZZZZ"];

    for (const code of codes) {
      const result = await generateEventQR(code, baseUrl);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it("rejects access code with lowercase characters", async () => {
    await expect(generateEventQR("abc123", baseUrl)).rejects.toThrow(
      /Invalid access code format/
    );
  });

  it("rejects access code with special characters", async () => {
    await expect(generateEventQR("ABC!@#", baseUrl)).rejects.toThrow(
      /Invalid access code format/
    );
  });

  it("rejects access code that is too short", async () => {
    await expect(generateEventQR("ABC", baseUrl)).rejects.toThrow(
      /Invalid access code format/
    );
  });

  it("rejects access code that is too long", async () => {
    await expect(generateEventQR("ABCDEFG", baseUrl)).rejects.toThrow(
      /Invalid access code format/
    );
  });

  it("rejects empty access code", async () => {
    await expect(generateEventQR("", baseUrl)).rejects.toThrow(
      /Invalid access code format/
    );
  });

  it("generates different PNGs for different access codes", async () => {
    const png1 = await generateEventQR("CODE01", baseUrl);
    const png2 = await generateEventQR("CODE02", baseUrl);

    // PNGs should be different (different QR content)
    expect(png1).not.toEqual(png2);
  });
});
