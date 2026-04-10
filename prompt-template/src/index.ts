// @radzor/prompt-template — Manage and render prompt templates with variables and few-shot examples

export interface PromptTemplateConfig {
  delimiters?: { open: string; close: string };
  strictMode?: boolean;
}

export interface TemplateRegistration {
  name: string;
  template: string;
  defaults?: Record<string, string>;
  variables: string[];
}

export interface TemplateInfo {
  name: string;
  variables: string[];
  defaults: Record<string, string>;
  hasExamplesSlot: boolean;
  charLength: number;
}

export interface RenderedPrompt {
  text: string;
  templateName: string;
  variablesUsed: string[];
  exampleCount: number;
}

export interface FewShotExample {
  input: string;
  output: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  unresolvedVariables: string[];
}

export type EventMap = Record<string, never>;
export type Listener<T> = (event: T) => void;

export class PromptTemplate {
  private config: {
    delimiters: { open: string; close: string };
    strictMode: boolean;
  };
  private templates: Map<string, TemplateRegistration> = new Map();
  private listeners: Record<string, never> = {};

  constructor(config?: PromptTemplateConfig) {
    this.config = {
      delimiters: config?.delimiters ?? { open: "{{", close: "}}" },
      strictMode: config?.strictMode ?? true,
    };
  }

  on(): void {
    // No events — method exists for interface consistency
  }

  off(): void {
    // No events
  }

  private emit(): void {
    // No events
  }

  /** Register a new prompt template. */
  register(name: string, template: string, defaults?: Record<string, string>): void {
    const variables = this.extractVariables(template);
    this.templates.set(name, {
      name,
      template,
      defaults: defaults ?? {},
      variables,
    });
  }

  /** List all registered templates with metadata. */
  list(): TemplateInfo[] {
    return Array.from(this.templates.values()).map((t) => ({
      name: t.name,
      variables: t.variables,
      defaults: t.defaults ?? {},
      hasExamplesSlot: t.template.includes(`${this.config.delimiters.open}examples${this.config.delimiters.close}`),
      charLength: t.template.length,
    }));
  }

  /** Render a registered template with variables and optional few-shot examples. */
  render(
    name: string,
    variables?: Record<string, string>,
    examples?: FewShotExample[]
  ): RenderedPrompt {
    const registration = this.templates.get(name);
    if (!registration) {
      throw new Error(`Template "${name}" is not registered`);
    }

    const vars = { ...registration.defaults, ...variables };
    const variablesUsed: string[] = [];
    let text = registration.template;

    // Inject few-shot examples if the template has an {{examples}} slot
    const examplesPlaceholder = `${this.config.delimiters.open}examples${this.config.delimiters.close}`;
    let exampleCount = 0;

    if (text.includes(examplesPlaceholder) && examples && examples.length > 0) {
      const formattedExamples = examples
        .map((ex, i) => `Example ${i + 1}:\nInput: ${ex.input}\nOutput: ${ex.output}`)
        .join("\n\n");
      text = text.replace(examplesPlaceholder, formattedExamples);
      exampleCount = examples.length;
    } else if (text.includes(examplesPlaceholder)) {
      text = text.replace(examplesPlaceholder, "");
    }

    // Process conditionals: {{#if varName}}...{{/if}}
    text = this.processConditionals(text, vars);

    // Replace variables
    for (const varName of registration.variables) {
      if (varName === "examples") continue;

      const placeholder = `${this.config.delimiters.open}${varName}${this.config.delimiters.close}`;
      if (text.includes(placeholder)) {
        if (varName in vars) {
          text = text.split(placeholder).join(vars[varName]);
          variablesUsed.push(varName);
        } else if (this.config.strictMode) {
          throw new Error(`Unresolved variable "${varName}" in template "${name}"`);
        }
      }
    }

    // Trim excessive whitespace while preserving structure
    text = text
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return {
      text,
      templateName: name,
      variablesUsed,
      exampleCount,
    };
  }

  /** Validate a template for issues. */
  validate(name: string, variables?: Record<string, string>): ValidationResult {
    const registration = this.templates.get(name);
    if (!registration) {
      return {
        valid: false,
        errors: [`Template "${name}" is not registered`],
        warnings: [],
        unresolvedVariables: [],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const vars = { ...registration.defaults, ...variables };

    // Check for unclosed delimiters
    const { open, close } = this.config.delimiters;
    const openCount = registration.template.split(open).length - 1;
    const closeCount = registration.template.split(close).length - 1;
    if (openCount !== closeCount) {
      errors.push(`Mismatched delimiters: ${openCount} opening vs ${closeCount} closing`);
    }

    // Check for unresolved variables
    const unresolvedVariables = registration.variables.filter(
      (v) => v !== "examples" && !(v in vars)
    );

    if (unresolvedVariables.length > 0 && this.config.strictMode) {
      errors.push(`Unresolved variables: ${unresolvedVariables.join(", ")}`);
    }

    // Check for empty template
    if (registration.template.trim().length === 0) {
      errors.push("Template is empty");
    }

    // Warnings
    if (registration.template.length > 10000) {
      warnings.push("Template exceeds 10,000 characters — consider splitting");
    }

    const unusedVars = Object.keys(vars).filter(
      (v) => !registration.variables.includes(v)
    );
    if (unusedVars.length > 0) {
      warnings.push(`Variables provided but not in template: ${unusedVars.join(", ")}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      unresolvedVariables,
    };
  }

  // ─── Helpers ────────────────────────────────────────────

  private extractVariables(template: string): string[] {
    const { open, close } = this.config.delimiters;
    const escapedOpen = this.escapeRegex(open);
    const escapedClose = this.escapeRegex(close);
    const regex = new RegExp(`${escapedOpen}\\s*([a-zA-Z_][a-zA-Z0-9_]*)\\s*${escapedClose}`, "g");
    const vars = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(template)) !== null) {
      const name = match[1];
      // Skip conditional syntax keywords
      if (name !== "if" && !name.startsWith("#") && !name.startsWith("/")) {
        vars.add(name);
      }
    }

    return Array.from(vars);
  }

  private processConditionals(text: string, vars: Record<string, string>): string {
    const { open, close } = this.config.delimiters;
    const escapedOpen = this.escapeRegex(open);
    const escapedClose = this.escapeRegex(close);

    // {{#if varName}}content{{/if}}
    const conditionalRegex = new RegExp(
      `${escapedOpen}#if\\s+(\\w+)${escapedClose}([\\s\\S]*?)${escapedOpen}/if${escapedClose}`,
      "g"
    );

    return text.replace(conditionalRegex, (_match, varName: string, content: string) => {
      const value = vars[varName];
      if (value && value.trim().length > 0) {
        return content;
      }
      return "";
    });
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

export default PromptTemplate;
