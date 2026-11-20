// Who "me" is (src/lib/useMe.ts → myNames in src/lib/tasks.ts): every name the signed-in person goes by, so "Mine"
// finds work assigned under the device name, the team name or the email prefix.
import { describe, expect, it } from "vitest";
import { isMyName, myNames } from "@/lib/tasks";

const members = [
  { userId: "u1", name: "Jordan Lee", email: "jordan@example.com" },
  { userId: "u2", name: "", email: "pat@example.com" },
  { userId: "u3", name: null, email: null },
];

describe("myNames", () => {
  it("device name first, then the team name by user id, then the email prefix", () => {
    expect(myNames({ author: "Jordan", email: "jlee@example.com", userId: "u1", members })).toEqual(["Jordan", "Jordan Lee", "jlee"]);
  });
  it("drops repeats whatever the capitalisation", () => {
    expect(myNames({ author: "jordan lee", email: "Jordan.Lee@example.com", userId: "u1", members })).toEqual(["jordan lee", "Jordan.Lee"]);
    expect(myNames({ author: "pat", email: "pat@example.com", userId: "u2", members })).toEqual(["pat"]);
  });
  it("a member with no name uses their email prefix; no name at all adds nothing", () => {
    expect(myNames({ author: "Me", userId: "u2", members })).toEqual(["Me", "pat"]);
    expect(myNames({ author: "Me", userId: "u3", members })).toEqual(["Me"]);
  });
  it("works signed out and off a team", () => {
    expect(myNames({ author: "Me" })).toEqual(["Me"]);
    expect(myNames({ author: " ", email: null, userId: null, members: [] })).toEqual([]);
    // Another user's member row is never mine.
    expect(myNames({ author: "Sam", userId: "u9", members })).toEqual(["Sam"]);
  });
  it("isMyName is case-insensitive and ignores blanks", () => {
    const names = myNames({ author: "Jordan", email: "jlee@example.com", userId: "u1", members });
    expect(isMyName("JORDAN LEE", names)).toBe(true);
    expect(isMyName(" jlee ", names)).toBe(true);
    expect(isMyName("Pat", names)).toBe(false);
    expect(isMyName("", names)).toBe(false);
    expect(isMyName(null, names)).toBe(false);
  });
});
