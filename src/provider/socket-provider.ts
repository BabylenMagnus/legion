import { ulid } from "ulid";
import type { Socket } from "socket.io-client";
import type { LLM } from "@/session/llm";
import type { StreamTextResult, ToolSet } from "ai";
import { getCurrentProjectId } from "@/core/config";
import { Log } from "@/util/log";

const log = Log.create({ service: "provider.socket" });

/** Registry for mapping requestId to session/message for usage callbacks */
export const requestRegistry = new Map<
  string,
  { sessionID: string; messageID: string }
>();

export interface LLMRequest {
  requestId: string;
  model: string;
  messages: any[];
  metadata: {
    project_id: string | null;
    feature_id?: string;
  };
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  tools?: Record<string, any>;
  activeTools?: string[];
}

/**
 * Creates a StreamTextResult that reads chunks from WebSocket events.
 * API emits legion:llm:chunk with { requestId, chunk } where chunk is a stream part.
 */
export async function stream(
  socket: Socket,
  input: LLM.StreamInput
): Promise<StreamTextResult<ToolSet, unknown>> {
  const requestId = ulid();
  const projectId = await getCurrentProjectId();

  const request: LLMRequest = {
    requestId,
    model: input.model.id,
    messages: input.messages,
    metadata: {
      project_id: projectId,
    },
    temperature: input.model.capabilities.temperature ? 0.7 : undefined,
    topP: 1,
    topK: undefined,
    maxOutputTokens: input.model.limit?.output,
    tools: input.tools,
    activeTools: Object.keys(input.tools || {}).filter((x) => x !== "invalid" && x !== "_noop"),
  };

  log.info("sending llm request", { requestId, model: input.model.id, projectId });

  if (input.assistantMessageID) {
    requestRegistry.set(requestId, {
      sessionID: input.sessionID,
      messageID: input.assistantMessageID,
    });
  }

  socket.emit("legion:llm:request", request);

  return createStreamResult(socket, requestId, input.abort);
}

function createStreamResult(
  socket: Socket,
  requestId: string,
  abort?: AbortSignal
): StreamTextResult<ToolSet, unknown> {
  const chunks: any[] = [];
  let finished = false;
  let streamError: Error | null = null;
  let resolveWaiter: (() => void) | null = null;
  const waitForChunk = () =>
    new Promise<void>((resolve) => {
      resolveWaiter = resolve;
    });

  const chunkHandler = (data: { requestId: string; chunk: any }) => {
    if (data.requestId !== requestId) return;
    chunks.push(data.chunk);
    if (resolveWaiter) {
      resolveWaiter();
      resolveWaiter = null;
    }
  };

  const doneHandler = (data: { requestId: string }) => {
    if (data.requestId !== requestId) return;
    finished = true;
    if (resolveWaiter) {
      resolveWaiter();
      resolveWaiter = null;
    }
  };

  const errorHandler = (data: { requestId: string; error: string }) => {
    if (data.requestId !== requestId) return;
    streamError = new Error(data.error);
    finished = true;
    if (resolveWaiter) {
      resolveWaiter();
      resolveWaiter = null;
    }
  };

  socket.on("legion:llm:chunk", chunkHandler);
  socket.on("legion:llm:done", doneHandler);
  socket.on("legion:llm:error", errorHandler);

  const cleanup = () => {
    socket.off("legion:llm:chunk", chunkHandler);
    socket.off("legion:llm:done", doneHandler);
    socket.off("legion:llm:error", errorHandler);
    requestRegistry.delete(requestId);
  };

  abort?.addEventListener("abort", cleanup);

  async function* fullStream(): AsyncIterable<any> {
    let index = 0;
    try {
      while (true) {
        if (streamError) {
          throw streamError;
        }
        if (index < chunks.length) {
          yield chunks[index++];
        } else if (finished) {
          break;
        } else {
          await waitForChunk();
        }
      }
    } finally {
      cleanup();
    }
  }

  return {
    fullStream: fullStream(),
    textStream: (async function* () {
      for await (const part of fullStream()) {
        if (part.type === "text-delta" && part.text) {
          yield part.text;
        }
      }
    })(),
    toDataStreamResponse: () => {
      throw new Error("toDataStreamResponse not supported for Socket Provider");
    },
    toTextStreamResponse: () => {
      throw new Error("toTextStreamResponse not supported for Socket Provider");
    },
  } as StreamTextResult<ToolSet, unknown>;
}
