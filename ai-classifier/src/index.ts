// @radzor/ai-classifier — Classify text into categories using LLM or rule-based approaches

export interface AiClassifierConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  mode?: "llm" | "rules" | "hybrid";
}

export interface CategoryDefinition {
  name: string;
  description: string;
  keywords: string[];
}

export interface ClassificationResult {
  category: string;
  confidence: number;
  scores: Record<string, number>;
  method: "llm" | "rules";
}

export interface TrainResult {
  categoriesUpdated: number;
  keywordsAdded: number;
}

export type EventMap = {
  onClassified: { text: string; category: string; confidence: number; method: string };
};

export type Listener<T> = (event: T) => void;

const HYBRID_RULES_THRESHOLD = 0.6;

export class AiClassifier {
  private config: {
    apiKey: string;
    model: string;
    baseUrl: string;
    mode: "llm" | "rules" | "hybrid";
  };
  private categories: Map<string, CategoryDefinition> = new Map();
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config?: AiClassifierConfig) {
    this.config = {
      apiKey: config?.apiKey ?? "",
      model: config?.model ?? "gpt-4o-mini",
      baseUrl: config?.baseUrl ?? "https://api.openai.com/v1",
      mode: config?.mode ?? "llm",
    };

    if (this.config.mode === "llm" && !this.config.apiKey) {
      throw new Error('API key required for "llm" mode. Set apiKey or use "rules" mode.');
    }
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list) this.listeners[event] = list.filter((l) => l !== listener) as typeof list;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  /** Define a classification category. */
  defineCategory(name: string, description: string, keywords?: string[]): void {
    this.categories.set(name, {
      name,
      description,
      keywords: keywords ?? [],
    });
  }

  /** Classify a single text. */
  async classify(text: string): Promise<ClassificationResult> {
    if (this.categories.size === 0) {
      throw new Error("No categories defined. Call defineCategory() first.");
    }

    let result: ClassificationResult;

    switch (this.config.mode) {
      case "llm":
        result = await this.classifyWithLLM(text);
        break;
      case "rules":
        result = this.classifyWithRules(text);
        break;
      case "hybrid": {
        const rulesResult = this.classifyWithRules(text);
        if (rulesResult.confidence >= HYBRID_RULES_THRESHOLD) {
          result = rulesResult;
        } else {
          result = await this.classifyWithLLM(text);
        }
        break;
      }
    }

    this.emit("onClassified", {
      text: text.slice(0, 200),
      category: result.category,
      confidence: result.confidence,
      method: result.method,
    });

    return result;
  }

  /** Classify multiple texts. */
  async batchClassify(texts: string[]): Promise<ClassificationResult[]> {
    const results: ClassificationResult[] = [];
    for (const text of texts) {
      results.push(await this.classify(text));
    }
    return results;
  }

  /** Train the rule-based classifier by extracting keywords from labeled examples. */
  train(examples: Array<{ text: string; category: string }>): TrainResult {
    const categoryKeywords = new Map<string, Set<string>>();
    let keywordsAdded = 0;

    // Group examples by category
    for (const example of examples) {
      if (!categoryKeywords.has(example.category)) {
        categoryKeywords.set(example.category, new Set());
      }
      const words = this.extractSignificantWords(example.text);
      for (const word of words) {
        categoryKeywords.get(example.category)!.add(word);
      }
    }

    // Count words per category and filter out common words
    const allCategoryWords = new Map<string, Set<string>>();
    const wordCategoryCounts = new Map<string, number>();

    for (const [, words] of categoryKeywords) {
      for (const word of words) {
        wordCategoryCounts.set(word, (wordCategoryCounts.get(word) ?? 0) + 1);
      }
    }

    // Only keep words unique to 1-2 categories
    const maxCategories = Math.max(2, Math.floor(this.categories.size / 2));
    for (const [cat, words] of categoryKeywords) {
      const filtered = new Set<string>();
      for (const word of words) {
        if ((wordCategoryCounts.get(word) ?? 0) <= maxCategories) {
          filtered.add(word);
        }
      }
      allCategoryWords.set(cat, filtered);
    }

    // Update categories with new keywords
    let categoriesUpdated = 0;
    for (const [catName, newWords] of allCategoryWords) {
      let category = this.categories.get(catName);
      if (!category) {
        category = { name: catName, description: catName, keywords: [] };
        this.categories.set(catName, category);
      }

      const existingSet = new Set(category.keywords.map((k) => k.toLowerCase()));
      for (const word of newWords) {
        if (!existingSet.has(word)) {
          category.keywords.push(word);
          keywordsAdded++;
        }
      }
      categoriesUpdated++;
    }

    return { categoriesUpdated, keywordsAdded };
  }

  // ─── Rule-based classification ──────────────────────────

  private classifyWithRules(text: string): ClassificationResult {
    const lower = text.toLowerCase();
    const words = new Set(lower.split(/\W+/).filter((w) => w.length > 2));
    const scores: Record<string, number> = {};
    let totalMatches = 0;

    for (const [name, cat] of this.categories) {
      let matches = 0;
      for (const keyword of cat.keywords) {
        if (keyword.includes(" ")) {
          // Multi-word keyword: check substring
          if (lower.includes(keyword.toLowerCase())) matches += 2;
        } else {
          if (words.has(keyword.toLowerCase())) matches++;
        }
      }
      scores[name] = matches;
      totalMatches += matches;
    }

    // Normalize scores
    if (totalMatches > 0) {
      for (const key of Object.keys(scores)) {
        scores[key] = scores[key] / totalMatches;
      }
    } else {
      // Uniform distribution when no matches
      const uniform = 1 / this.categories.size;
      for (const key of Object.keys(scores)) {
        scores[key] = uniform;
      }
    }

    const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
    const [topCategory, topScore] = sorted[0];

    return {
      category: topCategory,
      confidence: totalMatches > 0 ? topScore : 0,
      scores,
      method: "rules",
    };
  }

  // ─── LLM-based classification ──────────────────────────

  private async classifyWithLLM(text: string): Promise<ClassificationResult> {
    const categoryList = Array.from(this.categories.values())
      .map((c) => `- "${c.name}": ${c.description}`)
      .join("\n");

    const categoryNames = Array.from(this.categories.keys());

    const systemPrompt = `You are a text classifier. Classify the given text into exactly one of these categories:

${categoryList}

Respond ONLY with JSON in this exact format:
{"category": "<category_name>", "confidence": <0.0-1.0>, "scores": {${categoryNames.map((n) => `"${n}": <0.0-1.0>`).join(", ")}}}

Rules:
- Scores must sum to approximately 1.0
- confidence must equal the score of the chosen category
- Do not include any text outside the JSON`;

    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Classify this text:\n\n"${text}"` },
        ],
        temperature: 0,
        max_tokens: 200,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Classifier API error ${res.status}: ${body}`);
    }

    const data = await res.json();
    const content = data.choices[0].message.content ?? "";

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in classifier response");

      const parsed = JSON.parse(jsonMatch[0]);
      const category = String(parsed.category);
      const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));

      // Validate category exists
      if (!this.categories.has(category)) {
        // Find closest match
        const lower = category.toLowerCase();
        for (const [name] of this.categories) {
          if (name.toLowerCase() === lower) {
            return {
              category: name,
              confidence,
              scores: parsed.scores ?? { [name]: confidence },
              method: "llm",
            };
          }
        }
      }

      return {
        category,
        confidence,
        scores: parsed.scores ?? { [category]: confidence },
        method: "llm",
      };
    } catch {
      // Fallback: try to find a category name in the response
      const lower = content.toLowerCase();
      for (const [name] of this.categories) {
        if (lower.includes(name.toLowerCase())) {
          return {
            category: name,
            confidence: 0.3,
            scores: { [name]: 0.3 },
            method: "llm",
          };
        }
      }

      const firstCat = Array.from(this.categories.keys())[0];
      return {
        category: firstCat,
        confidence: 0.1,
        scores: { [firstCat]: 0.1 },
        method: "llm",
      };
    }
  }

  // ─── Text processing helpers ────────────────────────────

  private extractSignificantWords(text: string): string[] {
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "shall", "can", "need", "dare", "ought",
      "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
      "as", "into", "through", "during", "before", "after", "above",
      "below", "between", "out", "off", "over", "under", "again", "further",
      "then", "once", "here", "there", "when", "where", "why", "how", "all",
      "each", "every", "both", "few", "more", "most", "other", "some",
      "such", "no", "nor", "not", "only", "own", "same", "so", "than",
      "too", "very", "just", "because", "but", "and", "or", "if", "while",
      "this", "that", "these", "those", "it", "its", "i", "me", "my",
      "we", "our", "you", "your", "he", "him", "his", "she", "her", "they",
      "them", "their", "what", "which", "who", "whom",
    ]);

    return text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));
  }
}

export default AiClassifier;
