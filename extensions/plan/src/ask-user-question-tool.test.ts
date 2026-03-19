import { expect, mock, test } from "bun:test";
import type {
  AskUserQuestionQuestionConfig,
  AskUserQuestionResultDetails,
  SelectionState,
} from "./ask-user-question-tool";

mock.module("@mariozechner/pi-tui", () => ({
  Editor: class {
    focused = false;
    onChange?: (value: string) => void;
    onSubmit?: (value: string) => void;

    constructor(..._args: unknown[]) {}

    setText(value: string) {
      this.onChange?.(value);
    }

    handleInput(_data: string) {}

    render(_width: number) {
      return [""];
    }
  },
  Markdown: class {
    constructor(..._args: unknown[]) {}

    setText(_value: string) {}

    render(_width: number) {
      return [""];
    }
  },
  Key: {
    tab: "tab",
    escape: "escape",
    up: "up",
    down: "down",
    enter: "enter",
    right: "right",
    left: "left",
    shift: (key: string) => `shift+${key}`,
  },
  matchesKey: () => false,
  truncateToWidth: (text: string) => text,
  wrapTextWithAnsi: (text: string) => [text],
}));

const {
  AskUserQuestionComponent,
  normalizeQuestions,
  buildResultDetails,
  buildResultContent,
} = await import("./ask-user-question-tool");

function createTheme() {
  return {
    fg: (_color: string, text: string) => text,
    strikethrough: (text: string) => text,
  };
}

function createTui() {
  return {
    requestRenderCalls: 0,
    requestRender() {
      this.requestRenderCalls += 1;
    },
  };
}

function buildQuestion(label = "Repo local"): AskUserQuestionQuestionConfig {
  return {
    question: "Which scope should we use?",
    header: "Scope",
    options: [
      {
        label,
        description: "Only touch the current repository.",
        preview: "Only modify files in this repo.",
      },
      {
        label: "Docs only",
        description: "Limit the work to documentation changes.",
      },
    ],
  };
}

test("normalizeQuestions rejects empty and oversized questionnaires", () => {
  expect(normalizeQuestions([])).toEqual({
    ok: false,
    message: "Error: No questions provided",
  });

  expect(
    normalizeQuestions([
      buildQuestion("One"),
      { ...buildQuestion("Two"), question: "Question 2?" },
      { ...buildQuestion("Three"), question: "Question 3?" },
      { ...buildQuestion("Four"), question: "Question 4?" },
      { ...buildQuestion("Five"), question: "Question 5?" },
    ]),
  ).toEqual({
    ok: false,
    message: "Error: AskUserQuestion accepts at most 4 questions",
  });
});

test("normalizeQuestions rejects duplicate question text", () => {
  expect(
    normalizeQuestions([
      buildQuestion(),
      {
        ...buildQuestion("Backend only"),
        header: "Alt",
      },
    ]),
  ).toEqual({
    ok: false,
    message: "Error: Duplicate question text: Which scope should we use?",
  });
});

test("normalizeQuestions rejects duplicate option labels", () => {
  expect(() =>
    normalizeQuestions([
      {
        question: "Which scope should we use?",
        options: [
          { label: "Repo local", description: "Use the repo." },
          { label: "Repo local", description: "Still use the repo." },
        ],
      },
    ]),
  ).toThrow("Question 1 has duplicate option label: Repo local");
});

test("normalizeQuestions injects the Type something. option", () => {
  const normalized = normalizeQuestions([buildQuestion()]);
  expect(normalized.ok).toBe(true);
  if (!normalized.ok) {
    throw new Error("Expected normalized questions");
  }

  expect(normalized.questions[0]).toMatchObject({
    id: "q1",
    question: "Which scope should we use?",
    header: "Scope",
    multiSelect: false,
  });
  expect(normalized.questions[0]?.options.at(-1)).toEqual({
    label: "Type something.",
    description: "Write your own answer instead of choosing one of the suggested options.",
    isOther: true,
  });
});

test("AskUserQuestionComponent uses the split layout on wide renders", () => {
  const normalized = normalizeQuestions([buildQuestion()]);
  expect(normalized.ok).toBe(true);
  if (!normalized.ok) {
    throw new Error("Expected normalized questions");
  }

  const component = new AskUserQuestionComponent(
    createTui() as never,
    createTheme() as never,
    () => {},
    normalized.questions,
  );

  const wideLines = component.render(120);

  expect(wideLines.some((line) => line.includes("Choices") && line.includes("Preview"))).toBe(true);
  expect(wideLines.some((line) => (line.match(/┌/g)?.length ?? 0) >= 2)).toBe(true);
});

test("AskUserQuestionComponent uses the stacked layout on narrow renders", () => {
  const normalized = normalizeQuestions([buildQuestion()]);
  expect(normalized.ok).toBe(true);
  if (!normalized.ok) {
    throw new Error("Expected normalized questions");
  }

  const component = new AskUserQuestionComponent(
    createTui() as never,
    createTheme() as never,
    () => {},
    normalized.questions,
  );

  const narrowLines = component.render(80);

  expect(narrowLines.some((line) => line.includes("Choices") && line.includes("Preview"))).toBe(
    false,
  );
  expect(narrowLines.some((line) => line.includes("Choices"))).toBe(true);
  expect(narrowLines.some((line) => line.includes("Preview"))).toBe(true);
  expect(narrowLines.some((line) => (line.match(/┌/g)?.length ?? 0) >= 2)).toBe(false);
});

test("AskUserQuestionComponent caches rendered output per width and invalidates on width changes", () => {
  const normalized = normalizeQuestions([buildQuestion()]);
  expect(normalized.ok).toBe(true);
  if (!normalized.ok) {
    throw new Error("Expected normalized questions");
  }

  const component = new AskUserQuestionComponent(
    createTui() as never,
    createTheme() as never,
    () => {},
    normalized.questions,
  );

  const wideFirst = component.render(120);
  const wideSecond = component.render(120);
  const narrow = component.render(80);

  expect(wideSecond).toBe(wideFirst);
  expect(narrow).not.toBe(wideFirst);
  expect(narrow.join("\n")).not.toEqual(wideFirst.join("\n"));
});

test("buildResultDetails formats answers, annotations, and strips the injected other option", () => {
  const normalized = normalizeQuestions([buildQuestion()]);
  expect(normalized.ok).toBe(true);
  if (!normalized.ok) {
    throw new Error("Expected normalized questions");
  }

  const question = normalized.questions[0]!;
  const selections = new Map<string, SelectionState>([
    [
      question.id,
      {
        optionLabels: ["Repo local"],
        optionIndexes: [1],
        customText: "also update docs",
        previews: {
          "Repo local": "Only modify files in this repo.",
        },
      },
    ],
  ]);

  expect(buildResultDetails(normalized.questions, selections, false)).toEqual({
    questions: [
      {
        question: "Which scope should we use?",
        header: "Scope",
        options: [
          {
            label: "Repo local",
            description: "Only touch the current repository.",
            preview: "Only modify files in this repo.",
          },
          {
            label: "Docs only",
            description: "Limit the work to documentation changes.",
          },
        ],
        multiSelect: false,
      },
    ],
    answers: {
      "Which scope should we use?": "Repo local, also update docs",
    },
    annotations: {
      "Which scope should we use?": {
        preview: "Only modify files in this repo.",
        notes: "also update docs",
      },
    },
    cancelled: false,
  });
});

test("buildResultContent formats answered questionnaires", () => {
  const details: AskUserQuestionResultDetails = {
    questions: [],
    answers: {
      "Which scope should we use?": "Repo local, also update docs",
    },
    annotations: {
      "Which scope should we use?": {
        preview: "Only modify files in this repo.",
        notes: "also update docs",
      },
    },
    cancelled: false,
  };

  expect(buildResultContent(details)).toBe(
    'User has answered your questions: "Which scope should we use?"="Repo local, also update docs" selected preview:\nOnly modify files in this repo. user notes: also update docs. You can now continue with the user\'s answers in mind.',
  );
});

test("buildResultContent returns the cancelled questionnaire output when no answers were recorded", () => {
  expect(
    buildResultContent({
      questions: [],
      answers: {},
      cancelled: true,
    }),
  ).toBe("User cancelled the questionnaire");
});
