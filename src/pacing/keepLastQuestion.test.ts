import { countQuestions, keepLastQuestion } from "./keepLastQuestion";

describe("keepLastQuestion", () => {
  it("leaves a reply with one question untouched", () => {
    const text = "*The guide leans on her staff.* \"Did the storm keep you up all night?\"";
    expect(keepLastQuestion(text)).toEqual({ action: "untouched", text, questions: 1 });
  });

  it("leaves a reply with no question untouched", () => {
    const text = "*The guide points down the hill.* \"The bridge is out, so we go around.\"";
    expect(keepLastQuestion(text).action).toBe("untouched");
  });

  it("drops an earlier quote that holds only a question and keeps the narration", () => {
    const result = keepLastQuestion("\"Are you hurt?\" *The guide kneels beside the cart and checks the wheel.* \"Can you walk to the village?\"");
    expect(result).toMatchObject({ action: "trimmed", questions: 2 });
    expect(result.text).toBe("*The guide kneels beside the cart and checks the wheel.* \"Can you walk to the village?\"");
  });

  it("drops a question inside a quote and keeps the rest of that quote", () => {
    const result = keepLastQuestion("\"You came early. Did you sleep at all? The road was long.\" *She hands over a cup.* \"Will you stay for supper?\"");
    expect(result.action).toBe("trimmed");
    expect(result.text).toBe("\"You came early. The road was long.\" *She hands over a cup.* \"Will you stay for supper?\"");
  });

  it("drops a dialogue tag right after a dropped quote", () => {
    const result = keepLastQuestion("\"Is that your horse?\" *she asks, eyes narrowing.* *The wind picks up over the field.* \"Where are you headed tonight?\"");
    expect(result.action).toBe("trimmed");
    expect(result.text).toBe("*The wind picks up over the field.* \"Where are you headed tonight?\"");
  });

  it("drops an action span left holding only a dropped question", () => {
    const result = keepLastQuestion("*Is this the right road?* The guide studies the old map for a long moment. \"Shall we take the left fork?\"");
    expect(result.action).toBe("trimmed");
    expect(result.text).toBe("The guide studies the old map for a long moment. \"Shall we take the left fork?\"");
  });

  it("leaves no empty quote when one quote held two questions", () => {
    const result = keepLastQuestion("*The guide folds her arms and waits by the gate.* \"Who sent you out here? Why did you come so late tonight?\"");
    expect(result.action).toBe("trimmed");
    expect(result.text).toBe("*The guide folds her arms and waits by the gate.* \"Why did you come so late tonight?\"");
    expect(result.text).not.toContain("\"\"");
  });

  it("joins a short follow-up fragment to its question with an em dash", () => {
    const result = keepLastQuestion("*The guide turns from the window.* \"Where were you? Last night?\"");
    expect(result).toMatchObject({ action: "trimmed", joined: true });
    expect(result.text).toBe("*The guide turns from the window.* \"Where were you — last night?\"");
    expect(countQuestions(result.text)).toBe(1);
  });

  it("keeps the blank lines between beats", () => {
    const result = keepLastQuestion("\"Are you cold?\"\n\n*The fire cracks and the guide adds another log to it.*\n\n\"Do you want the blanket?\"");
    expect(result.action).toBe("trimmed");
    expect(result.text).toBe("*The fire cracks and the guide adds another log to it.*\n\n\"Do you want the blanket?\"");
  });

  it("keeps the original when the trimmed reply would be too short", () => {
    const text = "\"Why?\" \"Now?\"";
    expect(keepLastQuestion(text)).toEqual({ action: "rejected", text, questions: 2, reasons: ["too-short"] });
  });

  it("keeps the original when the trimmed reply would leave a quote open", () => {
    const text = "\"You came back. Did anyone follow you? *The guide glances at the trees beyond the fence.* \"Is the gate locked?\"";
    const result = keepLastQuestion(text);
    expect(result.action).toBe("rejected");
    expect(result.text).toBe(text);
    expect(result.action === "rejected" ? result.reasons : []).toContain("unbalanced");
  });

  it("is idempotent: a trimmed reply passes through untouched", () => {
    const first = keepLastQuestion("\"Are you hurt?\" *The guide kneels beside the cart and checks the wheel.* \"Can you walk to the village?\"");
    expect(keepLastQuestion(first.text).action).toBe("untouched");
  });

  it("treats a non-string as empty", () => {
    expect(keepLastQuestion(undefined as unknown as string)).toEqual({ action: "untouched", text: "", questions: 0 });
  });
});
