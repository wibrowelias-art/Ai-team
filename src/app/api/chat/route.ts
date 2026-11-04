import { handleChat } from "@/server/handleChat";

/** Worker chat, meetings and worker-initiated messages, powered by Gemini. */
export async function POST(request: Request): Promise<Response> {
  return handleChat(request);
}
