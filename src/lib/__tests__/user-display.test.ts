import { displayName, userInitials, teamInitials } from "../user-display";

describe("displayName", () => {
  it("joins first and last name", () => {
    expect(displayName({ first_name: "Jane", last_name: "Doe" })).toBe("Jane Doe");
  });

  it("falls back to username when both names are missing", () => {
    expect(displayName({ first_name: null, last_name: null, username: "jdoe" })).toBe("jdoe");
  });

  it("trims a lone first or last name", () => {
    expect(displayName({ first_name: "Jane", last_name: null })).toBe("Jane");
    expect(displayName({ first_name: null, last_name: "Doe" })).toBe("Doe");
  });
});

describe("userInitials", () => {
  it("uses first+last initials", () => {
    expect(userInitials({ first_name: "Jane", last_name: "Doe" })).toBe("JD");
  });

  it("falls back to the username's first letter when names are missing", () => {
    expect(userInitials({ first_name: null, last_name: null, username: "jdoe" })).toBe("J");
  });

  it("returns an empty string when nothing is available", () => {
    expect(userInitials({})).toBe("");
  });
});

describe("teamInitials", () => {
  it("takes the first letter of up to two words", () => {
    expect(teamInitials("Design Team")).toBe("DT");
  });

  it("splits on hyphens too", () => {
    expect(teamInitials("Content-Ops")).toBe("CO");
  });

  it("handles a single word", () => {
    expect(teamInitials("Engineering")).toBe("E");
  });
});
