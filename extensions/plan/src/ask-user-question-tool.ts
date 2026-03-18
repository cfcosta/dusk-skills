import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionToolResult,
} from "../../../packages/workflow-core/src/index";
import {
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  type TUI,
  truncateToWidth,
} from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

interface AskUserQuestionOption {
  label: string;
  description: string;
  preview?: string;
}

interface AskUserQuestionInput {
  question: string;
  header: string;
  options: AskUserQuestionOption[];
  multiSelect: boolean;
}

interface QuestionAnnotation {
  preview?: string;
  notes?: string;
}

interface AskUserQuestionResultDetails {
  questions: AskUserQuestionInput[];
  answers: Record<string, string>;
  annotations?: Record<string, QuestionAnnotation>;
  cancelled: boolean;
}

interface AskUserQuestionToolParams {
  questions: Array<{
    question: string;
    header?: string;
    options: AskUserQuestionOption[];
    multiSelect?: boolean;
  }>;
}

interface NormalizedOption extends AskUserQuestionOption {
  isOther?: boolean;
}

interface NormalizedQuestion {
  id: string;
  question: string;
  header: string;
  options: NormalizedOption[];
  multiSelect: boolean;
}

interface SelectionState {
  optionLabels: string[];
  optionIndexes: number[];
  customText?: string;
  previews: Record<string, string>;
}

const MAX_HEADER_LENGTH = 12;

const AskUserQuestionOptionSchema = Type.Object({
  label: Type.String({
    description: "The display text for this option that the user will see and select.",
  }),
  description: Type.String({
    description: "Explanation of what this option means or what will happen if chosen.",
  }),
  preview: Type.Optional(
    Type.String({
      description:
        "Optional preview content for the focused option. Use for mockups, code snippets, or comparisons.",
    }),
  ),
});

const AskUserQuestionQuestionSchema = Type.Object({
  question: Type.String({
    description:
      "The complete question to ask the user. Keep it specific and end it with a question mark.",
  }),
  header: Type.Optional(
    Type.String({
      description:
        "Very short label shown in the questionnaire tab bar, e.g. 'Scope', 'Auth', 'Approach'.",
    }),
  ),
  options: Type.Array(AskUserQuestionOptionSchema, {
    description:
      "The available choices for this question. Provide 2-4 concrete options. Do not include an 'Other' option; it is added automatically.",
  }),
  multiSelect: Type.Optional(
    Type.Boolean({
      description: "Allow the user to select multiple options instead of only one.",
    }),
  ),
});

const AskUserQuestionParams = Type.Object({
  questions: Type.Array(AskUserQuestionQuestionSchema, {
    description: "Questions to ask the user (1-4 questions).",
  }),
});

function errorResult(
  message: string,
  questions: AskUserQuestionInput[] = [],
): {
  content: Array<{ type: "text"; text: string }>;
  details: AskUserQuestionResultDetails;
} {
  return {
    content: [{ type: "text", text: message }],
    details: {
      questions,
      answers: {},
      cancelled: true,
    },
  };
}

function normalizeQuestions(
  rawQuestions: Array<{
    question: string;
    header?: string;
    options: AskUserQuestionOption[];
    multiSelect?: boolean;
  }>,
): { ok: true; questions: NormalizedQuestion[] } | { ok: false; message: string } {
  if (rawQuestions.length === 0) {
    return { ok: false, message: "Error: No questions provided" };
  }

  if (rawQuestions.length > 4) {
    return { ok: false, message: "Error: AskUserQuestion accepts at most 4 questions" };
  }

  const seenQuestions = new Set<string>();

  const questions: NormalizedQuestion[] = [];
  for (const [index, rawQuestion] of rawQuestions.entries()) {
    const question = rawQuestion.question.trim();
    if (question.length === 0) {
      return { ok: false, message: `Error: Question ${index + 1} is empty` };
    }

    if (seenQuestions.has(question)) {
      return { ok: false, message: `Error: Duplicate question text: ${question}` };
    }
    seenQuestions.add(question);

    if (rawQuestion.options.length < 2 || rawQuestion.options.length > 4) {
      return {
        ok: false,
        message: `Error: Question ${index + 1} must have between 2 and 4 options`,
      };
    }

    const seenLabels = new Set<string>();
    const options: NormalizedOption[] = rawQuestion.options.map((option) => {
      const label = option.label.trim();
      if (label.length === 0) {
        throw new Error(`Question ${index + 1} has an empty option label`);
      }
      if (seenLabels.has(label)) {
        throw new Error(`Question ${index + 1} has duplicate option label: ${label}`);
      }
      seenLabels.add(label);
      return {
        label,
        description: option.description.trim(),
        preview: option.preview,
      } satisfies NormalizedOption;
    });

    options.push({
      label: "Type something.",
      description: "Write your own answer instead of choosing one of the suggested options.",
      isOther: true,
    });

    questions.push({
      id: `q${index + 1}`,
      question,
      header: (rawQuestion.header?.trim() || `Q${index + 1}`).slice(0, MAX_HEADER_LENGTH),
      options,
      multiSelect: rawQuestion.multiSelect === true,
    });
  }

  return { ok: true, questions };
}

function getSelectionState(
  selections: Map<string, SelectionState>,
  questionId: string,
): SelectionState {
  return (
    selections.get(questionId) ?? {
      optionLabels: [],
      optionIndexes: [],
      previews: {},
    }
  );
}

function buildResultDetails(
  questions: NormalizedQuestion[],
  selections: Map<string, SelectionState>,
  cancelled: boolean,
): AskUserQuestionResultDetails {
  const answers: Record<string, string> = {};
  const annotations: Record<string, QuestionAnnotation> = {};

  for (const question of questions) {
    const selection = selections.get(question.id);
    if (!selection) {
      continue;
    }

    const values = [...selection.optionLabels];
    if (selection.customText?.trim()) {
      values.push(selection.customText.trim());
    }
    if (values.length === 0) {
      continue;
    }

    answers[question.question] = values.join(", ");

    const previews = Object.values(selection.previews);
    if (previews.length > 0 || selection.customText?.trim()) {
      annotations[question.question] = {
        ...(previews.length > 0 ? { preview: previews.join("\n\n") } : {}),
        ...(selection.customText?.trim() ? { notes: selection.customText.trim() } : {}),
      };
    }
  }

  return {
    questions: questions.map((question) => ({
      question: question.question,
      header: question.header,
      options: question.options.filter((option) => !option.isOther),
      multiSelect: question.multiSelect,
    })),
    answers,
    ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
    cancelled,
  };
}

function buildResultContent(details: AskUserQuestionResultDetails): string {
  const parts = Object.entries(details.answers).map(([question, answer]) => {
    const annotation = details.annotations?.[question];
    const chunks = [`"${question}"="${answer}"`];
    if (annotation?.preview) {
      chunks.push(`selected preview:\n${annotation.preview}`);
    }
    if (annotation?.notes) {
      chunks.push(`user notes: ${annotation.notes}`);
    }
    return chunks.join(" ");
  });

  if (parts.length === 0) {
    return "User cancelled the questionnaire";
  }

  return `User has answered your questions: ${parts.join(", ")}. You can now continue with the user's answers in mind.`;
}

export function registerAskUserQuestionTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "AskUserQuestion",
    label: "AskUserQuestion",
    description:
      "Ask the user multiple-choice clarification questions with suggested options. The user can always choose 'Type something.' to provide a custom answer.",
    promptSnippet:
      "Ask the user 1-4 focused clarification questions with 2-4 suggested options each. The user always gets an automatic Other/free-text path.",
    promptGuidelines: [
      "Use this tool when a short list of concrete choices would help the user answer quickly.",
      "In plan mode, use this tool to clarify requirements or choose between approaches before finalizing the plan.",
      "Do not use this tool to ask whether the plan is ready or whether you should proceed; the plan approval UI handles that.",
    ],
    parameters: AskUserQuestionParams,

    async execute(
      _toolCallId: string,
      params: AskUserQuestionToolParams,
      _signal: AbortSignal,
      _onUpdate: ((update: ExtensionToolResult<AskUserQuestionResultDetails>) => void) | undefined,
      ctx: ExtensionContext,
    ) {
      if (!ctx.hasUI) {
        return errorResult("Error: UI not available (running in non-interactive mode)");
      }

      let normalized;
      try {
        normalized = normalizeQuestions(params.questions);
      } catch (error) {
        return errorResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (!normalized.ok) {
        return errorResult(normalized.message);
      }

      const questions = normalized.questions;
      const result = await ctx.ui.custom<AskUserQuestionResultDetails>((tui, theme, _kb, done) => {
        const renderTui = tui as TUI;
        let currentTab = 0;
        let optionIndex = 0;
        let inputMode = false;
        let inputQuestionId: string | undefined;
        let cachedLines: string[] | undefined;
        const selections = new Map<string, SelectionState>();
        const totalTabs = questions.length + 1;
        const isMultiQuestion = questions.length > 1;

        const editorTheme: EditorTheme = {
          borderColor: (text) => theme.fg("accent", text),
          selectList: {
            selectedPrefix: (text) => theme.fg("accent", text),
            selectedText: (text) => theme.fg("accent", text),
            description: (text) => theme.fg("muted", text),
            scrollInfo: (text) => theme.fg("dim", text),
            noMatch: (text) => theme.fg("warning", text),
          },
        };
        const editor = new Editor(renderTui, editorTheme);

        const refresh = () => {
          cachedLines = undefined;
          renderTui.requestRender();
        };

        const currentQuestion = (): NormalizedQuestion | undefined => {
          return questions[currentTab];
        };

        const allAnswered = (): boolean => {
          return questions.every((question) => {
            const selection = selections.get(question.id);
            return Boolean(
              selection &&
              (selection.optionLabels.length > 0 ||
                (selection.customText && selection.customText.trim())),
            );
          });
        };

        const submit = (cancelled: boolean) => {
          done(buildResultDetails(questions, selections, cancelled));
        };

        const advanceAfterAnswer = () => {
          if (!isMultiQuestion) {
            submit(false);
            return;
          }

          if (currentTab < questions.length - 1) {
            currentTab += 1;
          } else {
            currentTab = questions.length;
          }
          optionIndex = 0;
          refresh();
        };

        const setSingleSelection = (
          question: NormalizedQuestion,
          option: NormalizedOption,
          index: number,
        ) => {
          selections.set(question.id, {
            optionLabels: option.isOther ? [] : [option.label],
            optionIndexes: option.isOther ? [] : [index + 1],
            previews: option.preview ? { [option.label]: option.preview } : {},
          });
        };

        const toggleMultiSelection = (
          question: NormalizedQuestion,
          option: NormalizedOption,
          index: number,
        ) => {
          const selection = getSelectionState(selections, question.id);
          const labelIndex = selection.optionLabels.indexOf(option.label);
          if (labelIndex >= 0) {
            selection.optionLabels.splice(labelIndex, 1);
            selection.optionIndexes.splice(labelIndex, 1);
            delete selection.previews[option.label];
          } else {
            selection.optionLabels.push(option.label);
            selection.optionIndexes.push(index + 1);
            if (option.preview) {
              selection.previews[option.label] = option.preview;
            }
          }
          selections.set(question.id, selection);
        };

        const saveCustomAnswer = (question: NormalizedQuestion, value: string) => {
          const selection = getSelectionState(selections, question.id);
          selection.customText = value;
          selections.set(question.id, selection);
        };

        const removeCustomAnswer = (question: NormalizedQuestion) => {
          const selection = getSelectionState(selections, question.id);
          delete selection.customText;
          selections.set(question.id, selection);
        };

        editor.onSubmit = (value) => {
          const question = questions.find((candidate) => candidate.id === inputQuestionId);
          if (!question) {
            return;
          }

          const trimmed = value.trim();
          if (trimmed.length === 0) {
            inputMode = false;
            inputQuestionId = undefined;
            editor.setText("");
            refresh();
            return;
          }

          saveCustomAnswer(question, trimmed);
          inputMode = false;
          inputQuestionId = undefined;
          editor.setText("");
          if (!question.multiSelect) {
            advanceAfterAnswer();
            return;
          }
          refresh();
        };

        const renderPreview = (
          width: number,
          option: NormalizedOption | undefined,
          lines: string[],
        ) => {
          if (!option?.preview) {
            return;
          }

          lines.push("");
          lines.push(truncateToWidth(theme.fg("muted", " Preview:"), width));
          for (const line of option.preview.split(/\r?\n/)) {
            lines.push(truncateToWidth(` ${theme.fg("dim", line)}`, width));
          }
        };

        const renderOptions = (width: number, question: NormalizedQuestion, lines: string[]) => {
          const selection = getSelectionState(selections, question.id);
          for (const [index, option] of question.options.entries()) {
            const selected = index === optionIndex;
            const prefix = selected ? theme.fg("accent", "> ") : "  ";
            const multiMarker = question.multiSelect
              ? selection.optionLabels.includes(option.label) ||
                (option.isOther && selection.customText)
                ? "[x] "
                : "[ ] "
              : "";
            const color = selected ? "accent" : "text";
            const optionLabel = option.isOther && inputMode ? `${option.label} ✎` : option.label;
            lines.push(
              truncateToWidth(
                prefix + theme.fg(color, `${index + 1}. ${multiMarker}${optionLabel}`),
                width,
              ),
            );
            if (option.description) {
              lines.push(truncateToWidth(`     ${theme.fg("muted", option.description)}`, width));
            }
          }
        };

        const handleInput = (data: string) => {
          if (inputMode) {
            if (matchesKey(data, Key.escape)) {
              inputMode = false;
              inputQuestionId = undefined;
              editor.setText("");
              refresh();
              return;
            }
            editor.handleInput(data);
            refresh();
            return;
          }

          if (isMultiQuestion) {
            if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
              currentTab = (currentTab + 1) % totalTabs;
              optionIndex = 0;
              refresh();
              return;
            }
            if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
              currentTab = (currentTab - 1 + totalTabs) % totalTabs;
              optionIndex = 0;
              refresh();
              return;
            }
          }

          if (currentTab === questions.length) {
            if (matchesKey(data, Key.enter) && allAnswered()) {
              submit(false);
              return;
            }
            if (matchesKey(data, Key.escape)) {
              submit(true);
            }
            return;
          }

          const question = currentQuestion();
          if (!question) {
            submit(true);
            return;
          }

          if (matchesKey(data, Key.up)) {
            optionIndex = Math.max(0, optionIndex - 1);
            refresh();
            return;
          }
          if (matchesKey(data, Key.down)) {
            optionIndex = Math.min(question.options.length - 1, optionIndex + 1);
            refresh();
            return;
          }

          const option = question.options[optionIndex];
          if (!option) {
            return;
          }

          if (question.multiSelect && data === " ") {
            if (option.isOther) {
              inputMode = true;
              inputQuestionId = question.id;
              editor.setText("");
            } else {
              toggleMultiSelection(question, option, optionIndex);
            }
            refresh();
            return;
          }

          if (matchesKey(data, Key.enter)) {
            if (question.multiSelect) {
              if (option.isOther) {
                if (getSelectionState(selections, question.id).customText?.trim()) {
                  advanceAfterAnswer();
                } else {
                  inputMode = true;
                  inputQuestionId = question.id;
                  editor.setText("");
                  refresh();
                }
                return;
              }

              const selection = getSelectionState(selections, question.id);
              if (selection.optionLabels.length === 0 && !selection.customText?.trim()) {
                toggleMultiSelection(question, option, optionIndex);
              }
              advanceAfterAnswer();
              return;
            }

            if (option.isOther) {
              removeCustomAnswer(question);
              setSingleSelection(question, option, optionIndex);
              inputMode = true;
              inputQuestionId = question.id;
              editor.setText("");
              refresh();
              return;
            }

            setSingleSelection(question, option, optionIndex);
            advanceAfterAnswer();
            return;
          }

          if (matchesKey(data, Key.escape)) {
            submit(true);
          }
        };

        const render = (width: number): string[] => {
          if (cachedLines) {
            return cachedLines;
          }

          const lines: string[] = [];
          const addLine = (text: string) => {
            lines.push(truncateToWidth(text, width));
          };

          addLine(theme.fg("accent", "─".repeat(width)));

          if (isMultiQuestion) {
            const tabs: string[] = ["← "];
            for (const [index, question] of questions.entries()) {
              const active = index === currentTab;
              const answered = Boolean(
                getSelectionState(selections, question.id).optionLabels.length > 0 ||
                getSelectionState(selections, question.id).customText?.trim(),
              );
              const marker = answered ? "■" : "□";
              const text = ` ${marker} ${question.header} `;
              tabs.push(theme.fg(active ? "accent" : answered ? "success" : "muted", `${text} `));
            }
            const submitActive = currentTab === questions.length;
            const canSubmit = allAnswered();
            const submitText = " ✓ Submit ";
            tabs.push(
              `${theme.fg(submitActive ? "accent" : canSubmit ? "success" : "dim", submitText)}→`,
            );
            addLine(` ${tabs.join("")}`);
            lines.push("");
          }

          if (currentTab === questions.length) {
            addLine(theme.fg("accent", " Ready to submit"));
            lines.push("");
            for (const question of questions) {
              const selection = getSelectionState(selections, question.id);
              const values = [...selection.optionLabels];
              if (selection.customText?.trim()) {
                values.push(`(wrote) ${selection.customText.trim()}`);
              }
              if (values.length > 0) {
                addLine(
                  `${theme.fg("muted", ` ${question.header}: `)}${theme.fg("text", values.join(", "))}`,
                );
              }
            }
            lines.push("");
            if (allAnswered()) {
              addLine(theme.fg("success", " Press Enter to submit"));
            } else {
              const missing = questions
                .filter((question) => {
                  const selection = getSelectionState(selections, question.id);
                  return !(selection.optionLabels.length > 0 || selection.customText?.trim());
                })
                .map((question) => question.header)
                .join(", ");
              addLine(theme.fg("warning", ` Unanswered: ${missing}`));
            }
          } else {
            const question = currentQuestion();
            const option = question?.options[optionIndex];
            if (question) {
              addLine(theme.fg("text", ` ${question.question}`));
              lines.push("");
              renderOptions(width, question, lines);
              if (inputMode) {
                lines.push("");
                addLine(theme.fg("muted", " Your answer:"));
                for (const line of editor.render(width - 2)) {
                  addLine(` ${line}`);
                }
                lines.push("");
              } else {
                renderPreview(width, option, lines);
              }
            }
          }

          lines.push("");
          if (inputMode) {
            addLine(theme.fg("dim", " Enter to submit • Esc to cancel"));
          } else if (currentTab !== questions.length) {
            const question = currentQuestion();
            addLine(
              theme.fg(
                "dim",
                question?.multiSelect
                  ? " ↑↓ navigate • Space toggle • Enter continue • Esc cancel"
                  : isMultiQuestion
                    ? " Tab/←→ switch • ↑↓ navigate • Enter select • Esc cancel"
                    : " ↑↓ navigate • Enter select • Esc cancel",
              ),
            );
          }
          addLine(theme.fg("accent", "─".repeat(width)));

          cachedLines = lines;
          return lines;
        };

        return {
          render,
          invalidate: () => {
            cachedLines = undefined;
          },
          handleInput,
        };
      });

      const contentText = buildResultContent(result);
      return {
        content: [{ type: "text", text: contentText }],
        details: result,
      };
    },
  });
}
