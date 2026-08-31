import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

export async function invokeWithTools(
  model: BaseChatModel,
  tools: readonly StructuredToolInterface[],
  input: { messages: BaseMessage[] } | BaseMessage[],
): Promise<string> {
  const messages = Array.isArray(input) ? input : input.messages;
  // `bindTools` is optional on the BaseChatModel interface; every concrete
  // provider we construct implements it. Cast to reach it uniformly.
  const boundModel = (model as any).bindTools(tools as any);
  const modelResult = await boundModel.invoke(messages);

  if (!modelResult.tool_calls || modelResult.tool_calls.length === 0) {
    return modelResult.content.toString();
  }

  const toolMessages = await Promise.all(
    modelResult.tool_calls.map(async (call: any) => {
      const tool = tools.find((t) => t.name === call.name);
      if (!tool) {
        return new ToolMessage({
          tool_call_id: call.id,
          content: `Tool "${call.name}" not found`,
        });
      }

      const result = await tool.invoke(call.args);
      return new ToolMessage({
        tool_call_id: call.id,
        content: result.toString(),
      });
    }),
  );

  const finalResult = await boundModel.invoke([
    ...messages,
    modelResult,
    ...toolMessages,
  ]);

  return finalResult.content.toString();
}
