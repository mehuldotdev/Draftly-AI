/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Direct OpenRouter API integration without Vercel AI SDK
 * This avoids Vercel's billing requirements while maintaining functionality
 */

import { z } from "zod";

interface GenerateTextOptions {
  model: string;
  system?: string;
  prompt: string;
  tools?: Record<string, any>;
  stopWhen?: (stepCount: number) => boolean;
  maxTokens?: number;
  temperature?: number;
}

interface GenerateObjectOptions<T extends z.ZodType> {
  model: string;
  system?: string;
  prompt: string;
  schema: T;
  maxTokens?: number;
  temperature?: number;
}

interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

/**
 * Convert Zod schema to JSON Schema for OpenAI-compatible API
 */
function zodToJsonSchema(schema: z.ZodType): any {
  if (schema instanceof z.ZodObject) {
    const shape = (schema as any)._def.shape() as Record<string, z.ZodType>;
    const properties: any = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!(value as any).isOptional()) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: false,
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: "string", description: schema.description };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: "number", description: schema.description };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean", description: schema.description };
  }

  if (schema instanceof z.ZodArray) {
    const def = (schema as any)._def;
    return {
      type: "array",
      items: zodToJsonSchema(def.type),
      description: schema.description,
      minItems: def.minLength?.value,
      maxItems: def.maxLength?.value,
    };
  }

  if (schema instanceof z.ZodEnum) {
    const def = (schema as any)._def;
    return {
      type: "string",
      enum: def.values,
      description: schema.description,
    };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema((schema as any)._def.innerType);
  }

  return { type: "string" };
}

/**
 * Generate text using OpenRouter API with optional tool support
 */
export async function generateText(
  options: GenerateTextOptions
): Promise<{ text: string; toolCalls?: any[] }> {
  const { model, system, prompt, tools, maxTokens = 4000, temperature = 0.7 } = options;

  const messages: Message[] = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  messages.push({ role: "user", content: prompt });

  const toolsArray: Tool[] = [];
  if (tools) {
    for (const [name, toolDef] of Object.entries(tools)) {
      const jsonSchema = zodToJsonSchema(toolDef.inputSchema);
      toolsArray.push({
        type: "function",
        function: {
          name,
          description: toolDef.description,
          parameters: jsonSchema,
        },
      });
    }
  }

  let stepCount = 0;
  let shouldStop = false;

  while (!shouldStop) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Draftly AI",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        ...(toolsArray.length > 0 && { tools: toolsArray }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${error}`);
    }

    const data = await response.json();
    const choice = data.choices[0];
    const assistantMessage = choice.message;

    messages.push(assistantMessage);
    stepCount++;

    // Check if there are tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      // Execute tools
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);
        const tool = tools?.[toolName];

        if (tool) {
          const result = await tool.execute(toolArgs);
          messages.push({
            role: "tool",
            content: JSON.stringify(result),
            tool_call_id: toolCall.id,
            name: toolName,
          });
        }
      }

      // Check stop condition
      if (options.stopWhen && options.stopWhen(stepCount)) {
        shouldStop = true;
      }
    } else {
      // No more tool calls, we're done
      shouldStop = true;
    }

    // Safety limit
    if (stepCount >= 10) {
      shouldStop = true;
    }
  }

  // Get the final text response
  const lastMessage = messages[messages.length - 1];
  const text = lastMessage.role === "assistant" ? lastMessage.content : "";

  return { text };
}

/**
 * Generate structured object using OpenRouter API with JSON mode
 */
export async function generateObject<T extends z.ZodType>(
  options: GenerateObjectOptions<T>
): Promise<{ object: z.infer<T> }> {
  const { model, system, prompt, schema, maxTokens = 4000, temperature = 0.7 } = options;

  const jsonSchema = zodToJsonSchema(schema);

  const messages: Message[] = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }

  messages.push({
    role: "user",
    content: `${prompt}\n\nYou must respond with valid JSON matching this schema:\n${JSON.stringify(
      jsonSchema,
      null,
      2
    )}`,
  });

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Draftly AI",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Parse and validate with Zod
  const parsed = JSON.parse(content);
  const validated = schema.parse(parsed);

  return { object: validated };
}

/**
 * Helper to create step count checker
 */
export function stepCountIs(count: number) {
  return (currentCount: number) => currentCount >= count;
}

/**
 * Enhanced tool definition compatible with our implementation
 */
export function createTool<T extends z.ZodType>(config: {
  description: string;
  inputSchema: T;
  execute: (input: z.infer<T>) => Promise<any>;
}) {
  return {
    description: config.description,
    inputSchema: config.inputSchema,
    execute: config.execute,
  };
}
